import { describe, expect, it } from "vitest";
import { getRestartServiceTarget } from "./appLifecyclePolicy";

describe("app lifecycle policy", () => {
  it("restarts into the setup wizard with the default desktop windows prepared", () => {
    expect(getRestartServiceTarget()).toEqual({
      screen: "wizard",
      openWindows: ["quest", "manager"],
    });
  });
});
