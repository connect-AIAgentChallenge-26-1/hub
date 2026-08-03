export function shouldLoadSuggestions({ enabled, query, mapReady }) {
  return Boolean(enabled && mapReady && String(query || "").trim().length >= 2);
}
