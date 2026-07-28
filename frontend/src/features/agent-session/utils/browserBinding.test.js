import { beforeEach, describe, expect, it, vi } from "vitest";

const STORED_BINDING_ID = "2fc69322-47dd-4bb5-a826-aa5c31e27d04";
const CREATED_BINDING_ID = "8ca04045-e548-4de0-9484-7ad0bc5d23bf";

async function loadBrowserBinding() {
  vi.resetModules();
  return import("./browserBinding");
}

describe("browserBinding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores a valid browser binding ID", async () => {
    window.localStorage.setItem(
      "agent-browser-binding-id",
      STORED_BINDING_ID
    );
    const { getOrCreateBrowserBindingId } = await loadBrowserBinding();

    expect(getOrCreateBrowserBindingId()).toBe(STORED_BINDING_ID);
  });

  it("replaces an invalid value with a generated UUID", async () => {
    window.localStorage.setItem("agent-browser-binding-id", "invalid");
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue(
      CREATED_BINDING_ID
    );
    const { getOrCreateBrowserBindingId } = await loadBrowserBinding();

    expect(getOrCreateBrowserBindingId()).toBe(CREATED_BINDING_ID);
    expect(
      window.localStorage.getItem("agent-browser-binding-id")
    ).toBe(CREATED_BINDING_ID);
  });
});
