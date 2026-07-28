const BROWSER_BINDING_STORAGE_KEY = "agent-browser-binding-id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let inMemoryBindingId;

function createBindingId() {
  return window.crypto.randomUUID();
}

export function getOrCreateBrowserBindingId() {
  if (inMemoryBindingId) return inMemoryBindingId;

  try {
    const storedBindingId = window.localStorage.getItem(
      BROWSER_BINDING_STORAGE_KEY
    );

    if (storedBindingId && UUID_PATTERN.test(storedBindingId)) {
      inMemoryBindingId = storedBindingId;
      return inMemoryBindingId;
    }

    inMemoryBindingId = createBindingId();
    window.localStorage.setItem(
      BROWSER_BINDING_STORAGE_KEY,
      inMemoryBindingId
    );
    return inMemoryBindingId;
  } catch {
    inMemoryBindingId = createBindingId();
    return inMemoryBindingId;
  }
}
