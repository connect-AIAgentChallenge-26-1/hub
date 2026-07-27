'use strict';

const crypto = require('node:crypto');

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function createCloudMemory(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const supabaseUrl = cleanBaseUrl(options.supabaseUrl);
  const supabaseSecret = String(options.supabaseSecret || '').trim();
  const openAiApiKey = String(options.openAiApiKey || '').trim();
  const embeddingModel = options.embeddingModel || 'text-embedding-3-small';
  const embeddingDimensions = Number(options.embeddingDimensions) || 512;
  const supabaseConfigured = Boolean(supabaseUrl && supabaseSecret);
  const embeddingsConfigured = Boolean(openAiApiKey);

  function supabaseHeaders(preferRepresentation = false) {
    const headers = {
      apikey: supabaseSecret,
      'Content-Type': 'application/json'
    };
    // New sb_secret_ keys must not be placed in Authorization. Legacy service_role
    // JWTs still use Bearer authentication.
    if (!supabaseSecret.startsWith('sb_secret_')) {
      headers.Authorization = `Bearer ${supabaseSecret}`;
    }
    if (preferRepresentation) headers.Prefer = 'resolution=merge-duplicates,return=representation';
    return headers;
  }

  async function supabaseRequest(pathname, init = {}) {
    if (!supabaseConfigured) return { configured: false, ok: false, data: null };
    try {
      const response = await fetchImpl(`${supabaseUrl}${pathname}`, {
        ...init,
        headers: { ...supabaseHeaders(Boolean(init.preferRepresentation)), ...(init.headers || {}) }
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      return { configured: true, ok: response.ok, status: response.status, data };
    } catch (error) {
      return { configured: true, ok: false, status: 0, data: null, error: error.message };
    }
  }

  async function createEmbedding(text) {
    const input = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 20_000);
    if (!embeddingsConfigured || !input) return null;
    try {
      const response = await fetchImpl('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: embeddingModel, input, dimensions: embeddingDimensions })
      });
      if (!response.ok) return null;
      const data = await response.json();
      const vector = data?.data?.[0]?.embedding;
      return Array.isArray(vector) && vector.length === embeddingDimensions ? vector : null;
    } catch {
      return null;
    }
  }

  async function mirrorPlannerState(ownerId, state) {
    const payload = [{ owner_id: ownerId, state_json: state, updated_at: new Date().toISOString() }];
    return supabaseRequest('/rest/v1/autonomous_planner_states?on_conflict=owner_id', {
      method: 'POST', preferRepresentation: true, body: JSON.stringify(payload)
    });
  }

  async function saveMemory({ ownerId, content, sourceName = '', sourceRef = '', metadata = {}, embedding = null }) {
    const normalized = String(content || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return { configured: supabaseConfigured, ok: false, skipped: true };
    const contentHash = crypto.createHash('sha256').update(`${ownerId}\n${sourceName}\n${sourceRef}\n${normalized}`).digest('hex');
    const vector = embedding || await createEmbedding(normalized);
    const payload = [{
      owner_id: ownerId,
      content: normalized,
      source_name: sourceName,
      source_ref: sourceRef,
      metadata,
      content_hash: contentHash,
      embedding: vector ? `[${vector.join(',')}]` : null,
      last_accessed_at: new Date().toISOString()
    }];
    const result = await supabaseRequest('/rest/v1/planner_memories?on_conflict=owner_id,content_hash', {
      method: 'POST', preferRepresentation: true, body: JSON.stringify(payload)
    });
    return { ...result, contentHash, embedding: vector };
  }

  async function searchMemories(ownerId, query, limit = 5) {
    const vector = await createEmbedding(query);
    if (!vector || !supabaseConfigured) return { configured: supabaseConfigured, ok: false, vector, items: [] };
    const result = await supabaseRequest('/rest/v1/rpc/match_planner_memories', {
      method: 'POST',
      body: JSON.stringify({
        query_owner_id: ownerId,
        query_embedding: `[${vector.join(',')}]`,
        match_threshold: 0.54,
        match_count: Math.max(1, Math.min(Number(limit) || 5, 10))
      })
    });
    return { ...result, vector, items: Array.isArray(result.data) ? result.data : [] };
  }

  async function mirrorHousekeepingEvent(event) {
    return supabaseRequest('/rest/v1/autonomous_housekeeping_events', {
      method: 'POST',
      body: JSON.stringify([{ ...event, created_at: event.created_at || new Date().toISOString() }])
    });
  }

  async function registerPushToken(ownerId, token, platform = 'web') {
    return supabaseRequest('/rest/v1/autonomous_push_tokens?on_conflict=token', {
      method: 'POST', preferRepresentation: true,
      body: JSON.stringify([{
        owner_id: ownerId,
        token,
        platform,
        enabled: true,
        updated_at: new Date().toISOString()
      }])
    });
  }

  return {
    status: () => ({ supabaseConfigured, embeddingsConfigured, embeddingModel, embeddingDimensions }),
    createEmbedding,
    mirrorPlannerState,
    saveMemory,
    searchMemories,
    mirrorHousekeepingEvent,
    registerPushToken
  };
}

module.exports = { createCloudMemory };
