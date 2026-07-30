import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL } from "./api";

interface DemoModeContextValue {
  demoMode: boolean;
  refresh: () => void;
  setDemoMode: (enabled: boolean) => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  demoMode: false,
  refresh: () => {},
  setDemoMode: async () => {},
});

// Single source of truth for DEMO_MODE on the client — the repo-connect
// screen's toggle and the app-wide "DEMO MODE" badge both read this instead
// of each fetching /api/health independently, so toggling it updates the
// badge immediately.
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(false);

  function refresh() {
    fetch(`${API_BASE_URL}/api/health`)
      .then((res) => res.json())
      .then((data: { demoMode?: boolean }) => setDemoModeState(Boolean(data.demoMode)))
      .catch(() => setDemoModeState(false));
  }

  useEffect(refresh, []);

  async function setDemoMode(enabled: boolean) {
    const res = await fetch(`${API_BASE_URL}/api/dev/demo-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error("demo mode toggle failed");
    const data = await res.json();
    setDemoModeState(Boolean(data.demoMode));
  }

  return (
    <DemoModeContext.Provider value={{ demoMode, refresh, setDemoMode }}>{children}</DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
