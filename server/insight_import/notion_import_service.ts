import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  analyzeImportCandidates,
  type AnalyzedImportItem,
} from '@amadda/domain/insight-import';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  appendNotionPropertyRequest,
  createInitialNotionAnalysisCursor,
  createNotionImportClient,
  NotionClientError,
  runNotionAnalysisSlice,
  type NotionAnalysisCursor,
  type NotionAnalysisSlice,
  type NotionImportClient,
} from './notion_client.js';
import {
  extractNotionCandidates,
  type NotionFieldMapping,
  type NotionFieldMappingRequest,
} from './notion_candidate_extractor.js';
import type { NotionImportServerConfig } from './import_server_config.js';
import {
  createSupabaseImportAdminStore,
  type EncryptedConnection,
  type ImportAdminStore,
} from './supabase_import_admin_store.js';
import { createTokenCipher, type TokenCipher } from './token_cipher.js';

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_REVOKE_URL = 'https://api.notion.com/v1/oauth/revoke';
const SERVER_AUTH_OPTIONS = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const;

export type NotionImportFailureCode =
  | 'invalid-request'
  | 'not-found'
  | 'permission-denied'
  | 'provider-rate-limited'
  | 'reauthorize'
  | 'write-failed';

export class NotionImportServiceError extends Error {
  readonly code: NotionImportFailureCode;

  constructor(code: NotionImportFailureCode) {
    super('Notion 가져오기 요청을 완료하지 못했습니다.');
    this.code = code;
    this.name = 'NotionImportServiceError';
  }
}

export type NotionConnectionStatus = {
  connectionId: string;
  includePageUrls: boolean;
  jobId: string;
  jobStatus:
    'analyzing' | 'ready' | 'committing' | 'completed' | 'failed' | 'undone';
  status:
    | 'pending'
    | 'exchanging'
    | 'connected'
    | 'analyzing'
    | 'completed'
    | 'canceled'
    | 'failed';
  workspaceName: string | null;
};

export type NotionAnalyzeResult =
  | {
      candidateCount: number;
      mappingRequests: NotionFieldMappingRequest[];
      requestCount: number;
      status: 'mapping-required';
    }
  | {
      candidateCount: number;
      requestCount: number;
      status: 'analyzing';
    }
  | {
      candidateCount: number;
      prepared: unknown;
      requestCount: number;
      status: 'ready';
    };

export type NotionFinishResult = {
  status: 'canceled' | 'cleanup-pending' | 'completed';
};

export type NotionImportService = {
  analyze(
    accessToken: string,
    connectionId: string,
    mappings: NotionFieldMapping[]
  ): Promise<NotionAnalyzeResult>;
  cancel(
    accessToken: string,
    connectionId: string
  ): Promise<NotionFinishResult>;
  complete(
    accessToken: string,
    connectionId: string
  ): Promise<NotionFinishResult>;
  handleCallback(query: unknown): Promise<{ redirectUrl: string }>;
  start(
    accessToken: string,
    includePageUrls: boolean,
    returnMode: 'android' | 'web'
  ): Promise<{ authorizeUrl: string; connectionId: string }>;
  status(
    accessToken: string,
    connectionId: string
  ): Promise<NotionConnectionStatus>;
};

export type NotionImportUserStore = {
  appendItems(
    accessToken: string,
    jobId: string,
    items: AnalyzedImportItem[],
    cursor: NotionAnalysisCursor
  ): Promise<{ candidateCount: number }>;
  authenticate(accessToken: string): Promise<string | null>;
  finalize(
    accessToken: string,
    jobId: string,
    cursor: NotionAnalysisCursor
  ): Promise<unknown>;
  getCursor(accessToken: string, jobId: string): Promise<NotionAnalysisCursor>;
  getStatus(
    accessToken: string,
    connectionId: string
  ): Promise<NotionConnectionStatus | null>;
  startJob(
    accessToken: string,
    jobId: string,
    idempotencyKey: string
  ): Promise<void>;
};

export type NotionImportServiceDependencies = {
  adminStore: ImportAdminStore;
  cipher: TokenCipher;
  config: NotionImportServerConfig;
  createClient(accessToken: string): NotionImportClient;
  fetch: typeof globalThis.fetch;
  now(): Date;
  randomState(): string;
  randomUuid(): string;
  runAnalysisSlice(
    client: NotionImportClient,
    cursor: NotionAnalysisCursor
  ): Promise<NotionAnalysisSlice>;
  userStore: NotionImportUserStore;
};

export type CreateSupabaseNotionImportServiceConfig = {
  notion: NotionImportServerConfig;
  publishableKey: string;
  serviceRoleKey: string;
  url: string;
};

export function createSupabaseExpiredNotionConnectionRevoker({
  notion,
  serviceRoleKey,
  url,
}: Omit<CreateSupabaseNotionImportServiceConfig, 'publishableKey'>) {
  const adminStore = createSupabaseImportAdminStore({ serviceRoleKey, url });
  const cipher = createTokenCipher(notion.tokenEncryptionKey);

  return () =>
    revokeExpiredNotionConnections(
      adminStore,
      cipher,
      notion,
      new Date().toISOString()
    );
}

export function createSupabaseNotionImportService({
  notion,
  publishableKey,
  serviceRoleKey,
  url,
}: CreateSupabaseNotionImportServiceConfig): NotionImportService {
  const authClient = createClient(url, publishableKey, {
    auth: SERVER_AUTH_OPTIONS,
  });

  return createNotionImportService({
    adminStore: createSupabaseImportAdminStore({ serviceRoleKey, url }),
    cipher: createTokenCipher(notion.tokenEncryptionKey),
    config: notion,
    createClient: (accessToken) => createNotionImportClient({ accessToken }),
    fetch: globalThis.fetch,
    now: () => new Date(),
    randomState: () => randomBytes(32).toString('base64url'),
    randomUuid: randomUUID,
    runAnalysisSlice: (client, cursor) =>
      runNotionAnalysisSlice(client, cursor),
    userStore: createSupabaseNotionImportUserStore(authClient, (accessToken) =>
      createClient(url, publishableKey, {
        auth: SERVER_AUTH_OPTIONS,
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      })
    ),
  });
}

export function createNotionImportService(
  dependencies: NotionImportServiceDependencies
): NotionImportService {
  const {
    adminStore,
    cipher,
    config,
    createClient: notionClientFactory,
    fetch,
    now,
    randomState,
    randomUuid,
    runAnalysisSlice: analyzeSlice,
    userStore,
  } = dependencies;

  const authenticate = async (accessToken: string) => {
    const userId = await userStore.authenticate(accessToken);

    if (!userId) {
      throw new NotionImportServiceError('permission-denied');
    }

    return userId;
  };

  const getOwnedConnection = async (
    accessToken: string,
    connectionId: string
  ) => {
    const userId = await authenticate(accessToken);
    const status = await userStore.getStatus(accessToken, connectionId);

    if (!status) {
      throw new NotionImportServiceError('not-found');
    }

    const connection = await adminStore.getConnection(connectionId);
    if (!connection || connection.userId !== userId) {
      throw new NotionImportServiceError('not-found');
    }

    return { connection, status };
  };

  const exchangeRefreshToken = async (connection: EncryptedConnection) => {
    if (!connection.refreshToken) {
      await adminStore.finishConnection(connection.id, 'failed');
      throw new NotionImportServiceError('reauthorize');
    }

    const aad = createTokenAad(connection);
    const refreshToken = cipher.decrypt(connection.refreshToken, aad);
    const response = await fetch(NOTION_TOKEN_URL, {
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      headers: createNotionOAuthHeaders(config),
      method: 'POST',
    });
    const body = await readJson(response);

    if (!response.ok || !isTokenResponse(body)) {
      await adminStore.finishConnection(connection.id, 'failed');
      throw new NotionImportServiceError('reauthorize');
    }

    const rotatedRefreshToken =
      typeof body.refresh_token === 'string'
        ? body.refresh_token
        : refreshToken;
    await adminStore.storeTokens(connection.id, {
      accessToken: cipher.encrypt(body.access_token, aad),
      refreshToken: cipher.encrypt(rotatedRefreshToken, aad),
      workspaceId: readNullableString(body.workspace_id),
      workspaceName: readNullableString(body.workspace_name),
    });

    return body.access_token;
  };

  const runAuthorizedSlice = async (
    connection: EncryptedConnection,
    cursor: NotionAnalysisCursor
  ) => {
    if (!connection.accessToken) {
      throw new NotionImportServiceError('reauthorize');
    }

    const aad = createTokenAad(connection);
    const accessToken = cipher.decrypt(connection.accessToken, aad);

    try {
      return await analyzeSlice(notionClientFactory(accessToken), cursor);
    } catch (error) {
      if (!(error instanceof NotionClientError)) {
        throw error;
      }

      if (error.code === 'provider-rate-limited') {
        throw new NotionImportServiceError('provider-rate-limited');
      }

      if (error.code !== 'reauthorize') {
        throw new NotionImportServiceError('write-failed');
      }

      const refreshedAccessToken = await exchangeRefreshToken(connection);
      try {
        return await analyzeSlice(
          notionClientFactory(refreshedAccessToken),
          cursor
        );
      } catch (retryError) {
        if (
          retryError instanceof NotionClientError &&
          retryError.code === 'reauthorize'
        ) {
          await adminStore.finishConnection(connection.id, 'failed');
          throw new NotionImportServiceError('reauthorize');
        }
        throw retryError;
      }
    }
  };

  const finish = async (
    accessToken: string,
    connectionId: string,
    status: 'canceled' | 'completed'
  ): Promise<NotionFinishResult> => {
    const { connection } = await getOwnedConnection(accessToken, connectionId);

    if (connection.accessToken) {
      const token = cipher.decrypt(
        connection.accessToken,
        createTokenAad(connection)
      );
      const revoked = await revokeNotionToken(fetch, config, token);

      if (!revoked) {
        return { status: 'cleanup-pending' };
      }
    }

    await adminStore.finishConnection(connectionId, status);
    return { status };
  };

  return {
    async analyze(accessToken, connectionId, mappings) {
      const { connection, status } = await getOwnedConnection(
        accessToken,
        connectionId
      );
      const cursor = await userStore.getCursor(accessToken, connection.jobId);

      if (status.jobStatus === 'ready') {
        const prepared = await userStore.finalize(
          accessToken,
          connection.jobId,
          cursor
        );
        return {
          candidateCount: 0,
          prepared,
          requestCount: 0,
          status: 'ready',
        };
      }

      const slice = await runAuthorizedSlice(connection, cursor);
      const extracted = extractNotionCandidates({
        blocks: slice.blocks,
        dataSources: slice.dataSources,
        includePageUrls: connection.includePageUrls,
        mappings,
        pages: slice.pages,
        propertyItems: slice.properties,
      });

      if (extracted.mappingRequests.length > 0) {
        return {
          candidateCount: 0,
          mappingRequests: extracted.mappingRequests,
          requestCount: slice.requestCount,
          status: 'mapping-required',
        };
      }

      for (const propertyRequest of extracted.propertyRequests) {
        appendNotionPropertyRequest(slice.cursor, propertyRequest);
      }

      const analysis = analyzeImportCandidates(extracted.candidates);
      const progress = await userStore.appendItems(
        accessToken,
        connection.jobId,
        analysis.items,
        slice.cursor
      );

      if (
        slice.cursor.stage !== 'complete' ||
        slice.cursor.propertyQueue.length > 0
      ) {
        return {
          candidateCount: progress.candidateCount,
          requestCount: slice.requestCount,
          status: 'analyzing',
        };
      }

      const prepared = await userStore.finalize(
        accessToken,
        connection.jobId,
        slice.cursor
      );
      return {
        candidateCount: progress.candidateCount,
        prepared,
        requestCount: slice.requestCount,
        status: 'ready',
      };
    },

    cancel(accessToken, connectionId) {
      return finish(accessToken, connectionId, 'canceled');
    },

    complete(accessToken, connectionId) {
      return finish(accessToken, connectionId, 'completed');
    },

    async handleCallback(query) {
      const parsed = parseCallbackQuery(query);
      const connection = await adminStore.consumeState(hash(parsed.state));

      if (!connection) {
        throw new NotionImportServiceError('invalid-request');
      }

      if (parsed.error) {
        await adminStore.finishConnection(connection.id, 'failed');
        return {
          redirectUrl: createReturnUrl(connection, 'access-denied', config),
        };
      }

      const response = await fetch(NOTION_TOKEN_URL, {
        body: JSON.stringify({
          code: parsed.code,
          grant_type: 'authorization_code',
          redirect_uri: config.redirectUri,
        }),
        headers: createNotionOAuthHeaders(config),
        method: 'POST',
      });
      const body = await readJson(response);

      if (!response.ok || !isTokenResponse(body)) {
        await adminStore.finishConnection(connection.id, 'failed');
        throw new NotionImportServiceError('write-failed');
      }

      const aad = createTokenAad(connection);
      await adminStore.storeTokens(connection.id, {
        accessToken: cipher.encrypt(body.access_token, aad),
        refreshToken:
          typeof body.refresh_token === 'string'
            ? cipher.encrypt(body.refresh_token, aad)
            : null,
        workspaceId: readNullableString(body.workspace_id),
        workspaceName: readNullableString(body.workspace_name),
      });

      return { redirectUrl: createReturnUrl(connection, null, config) };
    },

    async start(accessToken, includePageUrls, returnMode) {
      const userId = await authenticate(accessToken);
      const connectionId = randomUuid();
      const state = randomState();
      const createdAt = now();

      await userStore.startJob(
        accessToken,
        connectionId,
        hash(`notion\0${connectionId}`)
      );
      await adminStore.createConnection({
        expiresAt: new Date(createdAt.getTime() + 86_400_000).toISOString(),
        id: connectionId,
        includePageUrls,
        jobId: connectionId,
        returnMode,
        stateExpiresAt: new Date(
          createdAt.getTime() + 10 * 60_000
        ).toISOString(),
        stateHash: hash(state),
        userId,
      });

      const authorizeUrl = new URL(NOTION_AUTHORIZE_URL);
      authorizeUrl.searchParams.set('owner', 'user');
      authorizeUrl.searchParams.set('client_id', config.clientId);
      authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('state', state);

      return { authorizeUrl: authorizeUrl.toString(), connectionId };
    },

    async status(accessToken, connectionId) {
      await authenticate(accessToken);
      const status = await userStore.getStatus(accessToken, connectionId);

      if (!status) {
        throw new NotionImportServiceError('not-found');
      }

      return status;
    },
  };
}

export function createSupabaseNotionImportUserStore(
  authClient: Pick<SupabaseClient, 'auth'>,
  createUserClient: (accessToken: string) => SupabaseClient
): NotionImportUserStore {
  return {
    async appendItems(accessToken, jobId, items, cursor) {
      const { data, error } = await createUserClient(accessToken).rpc(
        'append_notion_import_items',
        {
          p_items: items,
          p_job_id: jobId,
          p_provider_cursor: cursor,
        }
      );
      if (error || !isRecord(data) || typeof data.candidateCount !== 'number') {
        throw new NotionImportServiceError('write-failed');
      }
      return { candidateCount: data.candidateCount };
    },

    async authenticate(accessToken) {
      try {
        const { data, error } = await authClient.auth.getUser(accessToken);
        return error || !data.user ? null : data.user.id;
      } catch {
        return null;
      }
    },

    async finalize(accessToken, jobId, cursor) {
      const { data, error } = await createUserClient(accessToken).rpc(
        'finalize_notion_import_analysis',
        { p_job_id: jobId, p_provider_cursor: cursor }
      );
      if (error || !data) {
        throw new NotionImportServiceError('write-failed');
      }
      return data;
    },

    async getCursor(accessToken, jobId) {
      const { data, error } = await createUserClient(accessToken)
        .from('insight_import_jobs')
        .select('provider_cursor')
        .eq('id', jobId)
        .maybeSingle();

      if (error || !data) {
        throw new NotionImportServiceError('not-found');
      }
      return parseCursor(data.provider_cursor);
    },

    async getStatus(accessToken, connectionId) {
      const client = createUserClient(accessToken);
      const { data: connection, error } = await client
        .from('my_insight_import_connections')
        .select('id,job_id,status,include_page_urls,workspace_name')
        .eq('id', connectionId)
        .maybeSingle();

      if (error) {
        throw new NotionImportServiceError('write-failed');
      }
      if (!connection) {
        return null;
      }

      const { data: job, error: jobError } = await client
        .from('insight_import_jobs')
        .select('status')
        .eq('id', connection.job_id)
        .maybeSingle();
      if (jobError || !job) {
        throw new NotionImportServiceError('write-failed');
      }

      return parseConnectionStatus(connection, job.status);
    },

    async startJob(accessToken, jobId, idempotencyKey) {
      const { error } = await createUserClient(accessToken).rpc(
        'start_notion_insight_import',
        {
          p_idempotency_key: idempotencyKey,
          p_job_id: jobId,
        }
      );
      if (error) {
        throw new NotionImportServiceError('write-failed');
      }
    },
  };
}

export async function revokeExpiredNotionConnections(
  adminStore: ImportAdminStore,
  cipher: TokenCipher,
  config: NotionImportServerConfig,
  currentTime: string,
  fetch: typeof globalThis.fetch = globalThis.fetch
) {
  const connections = await adminStore.listExpiredConnections(currentTime);

  for (const connection of connections) {
    if (!connection.accessToken) {
      continue;
    }

    try {
      const token = cipher.decrypt(
        connection.accessToken,
        createTokenAad(connection)
      );
      await revokeNotionToken(fetch, config, token);
    } catch {
      // 보존 기한이 지난 데이터는 Provider 응답과 무관하게 DB 정리를 계속한다.
    }
  }
}

async function revokeNotionToken(
  fetch: typeof globalThis.fetch,
  config: NotionImportServerConfig,
  token: string
) {
  try {
    const response = await fetch(NOTION_REVOKE_URL, {
      body: JSON.stringify({ token }),
      headers: createNotionOAuthHeaders(config),
      method: 'POST',
    });
    return response.ok;
  } catch {
    return false;
  }
}

function createNotionOAuthHeaders(config: NotionImportServerConfig) {
  return {
    Authorization: `Basic ${Buffer.from(
      `${config.clientId}:${config.clientSecret}`
    ).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

function createTokenAad(connection: {
  id: string;
  provider: 'notion';
  userId: string;
}) {
  return {
    connectionId: connection.id,
    provider: connection.provider,
    userId: connection.userId,
  } as const;
}

function createReturnUrl(
  connection: {
    id: string;
    returnMode: 'android' | 'web';
  },
  error: string | null,
  config: NotionImportServerConfig
) {
  const url =
    connection.returnMode === 'android'
      ? new URL('com.ppre1ude.amadda://import/notion')
      : new URL('/import', config.appOrigin);
  url.searchParams.set('import', 'notion');
  url.searchParams.set('connection', connection.id);
  if (error) {
    url.searchParams.set('error', error);
  }
  return url.toString();
}

function parseCallbackQuery(value: unknown) {
  if (!isRecord(value) || typeof value.state !== 'string') {
    throw new NotionImportServiceError('invalid-request');
  }

  if (typeof value.error === 'string') {
    return { code: null, error: value.error, state: value.state };
  }

  if (typeof value.code !== 'string') {
    throw new NotionImportServiceError('invalid-request');
  }

  return { code: value.code, error: null, state: value.state };
}

function parseCursor(value: unknown): NotionAnalysisCursor {
  if (value === null) {
    return createInitialNotionAnalysisCursor();
  }

  if (
    !isRecord(value) ||
    !Array.isArray(value.blockQueue) ||
    !Array.isArray(value.dataSourceQueue) ||
    !Array.isArray(value.visitedBlockIds) ||
    !Array.isArray(value.visitedDataSourceIds) ||
    !Array.isArray(value.visitedPageIds) ||
    !['search', 'data-sources', 'blocks', 'complete'].includes(
      String(value.stage)
    ) ||
    !(value.searchCursor === null || typeof value.searchCursor === 'string')
  ) {
    throw new NotionImportServiceError('write-failed');
  }

  const propertyQueue =
    value.propertyQueue === undefined ? [] : value.propertyQueue;
  if (!Array.isArray(propertyQueue)) {
    throw new NotionImportServiceError('write-failed');
  }

  return {
    ...(value as Omit<NotionAnalysisCursor, 'propertyQueue'>),
    propertyQueue: propertyQueue as NotionAnalysisCursor['propertyQueue'],
  };
}

function parseConnectionStatus(
  connection: Record<string, unknown>,
  jobStatus: unknown
): NotionConnectionStatus {
  if (
    typeof connection.id !== 'string' ||
    typeof connection.job_id !== 'string' ||
    typeof connection.include_page_urls !== 'boolean' ||
    typeof connection.status !== 'string' ||
    !isConnectionStatus(connection.status) ||
    !isJobStatus(jobStatus) ||
    !(
      connection.workspace_name === null ||
      typeof connection.workspace_name === 'string'
    )
  ) {
    throw new NotionImportServiceError('write-failed');
  }

  return {
    connectionId: connection.id,
    includePageUrls: connection.include_page_urls,
    jobId: connection.job_id,
    jobStatus,
    status: connection.status,
    workspaceName: connection.workspace_name,
  };
}

function isConnectionStatus(
  value: string
): value is NotionConnectionStatus['status'] {
  return [
    'pending',
    'exchanging',
    'connected',
    'analyzing',
    'completed',
    'canceled',
    'failed',
  ].includes(value);
}

function isJobStatus(
  value: unknown
): value is NotionConnectionStatus['jobStatus'] {
  return (
    typeof value === 'string' &&
    [
      'analyzing',
      'ready',
      'committing',
      'completed',
      'failed',
      'undone',
    ].includes(value)
  );
}

function isTokenResponse(
  value: unknown
): value is Record<string, unknown> & { access_token: string } {
  return (
    isRecord(value) &&
    typeof value.access_token === 'string' &&
    value.access_token.length > 0
  );
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function readNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
