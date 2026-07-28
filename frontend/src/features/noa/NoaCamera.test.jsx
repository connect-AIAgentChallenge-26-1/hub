import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoaCamera from "./NoaCamera";

const originalMediaDevices = navigator.mediaDevices;

describe("NoaCamera", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices
    });
  });

  it("explains when camera access is unavailable", async () => {
    const onStatusChange = vi.fn();
    const onEvent = vi.fn();

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined
    });

    render(
      <NoaCamera
        onStatusChange={onStatusChange}
        onEvent={onEvent}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "카메라 시작" }));

    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith("unavailable")
    );
    expect(
      screen.getByText("이 브라우저에서는 카메라 접근을 지원하지 않습니다.")
    ).toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "system" })
    );
  });

  it("starts and stops a local camera stream", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }]
    });
    const onEvent = vi.fn();

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();

    function CameraHarness() {
      const [status, setStatus] = useState("idle");

      return (
        <NoaCamera
          status={status}
          onStatusChange={setStatus}
          onEvent={onEvent}
        />
      );
    }

    render(<CameraHarness />);
    fireEvent.click(screen.getByRole("button", { name: "카메라 시작" }));

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false })
    );
    expect(
      await screen.findByRole("button", { name: "카메라 끄기" })
    ).toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "observation",
        title: "카메라 관찰을 시작했습니다."
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 끄기" }));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "카메라 시작" })
    ).toBeInTheDocument();
  });
});
