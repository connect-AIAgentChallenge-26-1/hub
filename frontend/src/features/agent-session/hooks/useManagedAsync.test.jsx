import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useManagedAsync from "./useManagedAsync";

afterEach(() => {
  vi.useRealTimers();
});

describe("useManagedAsync", () => {
  it("runs scheduled callbacks", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useManagedAsync());

    act(() => {
      result.current.schedule(callback, 100);
      vi.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it("aborts tracked requests when unmounted", () => {
    const { result, unmount } = renderHook(() => useManagedAsync());
    const controller = result.current.createController();
    const abortSpy = vi.spyOn(controller, "abort");

    unmount();

    expect(abortSpy).toHaveBeenCalledOnce();
    expect(result.current.isMounted()).toBe(false);
  });
});
