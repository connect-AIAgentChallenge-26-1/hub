import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL } from "./api";

interface DemoModeContextValue {
  demoMode: boolean;
  // null until the first /api/health fetch resolves — callers that gate
  // rendering/redirects on this must treat null as "don't know yet, don't
  // decide" rather than false, or a genuinely-enabled workflow would flash a
  // redirect on every page load before the real value arrives.
  enableNewProjectWorkflow: boolean | null;
  refresh: () => void;
  setDemoMode: (enabled: boolean) => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  demoMode: false,
  enableNewProjectWorkflow: null,
  refresh: () => {},
  setDemoMode: async () => {},
});

// Single source of truth for app-wide config read from /api/health — the
// repo-connect screen's demo-mode toggle and the app-wide "DEMO MODE" badge
// both read demoMode from here instead of each fetching /api/health
// independently, and the 9-step-workflow feature flag rides along on the
// same fetch since it's the same "config the server hands the client" idea.
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(false);
  const [enableNewProjectWorkflow, setEnableNewProjectWorkflow] = useState<boolean | null>(null);

  function refresh() {
    fetch(`${API_BASE_URL}/api/health`, { credentials: "include" })
      .then((res) => res.json())
      .then((data: { demoMode?: boolean; enableNewProjectWorkflow?: boolean }) => {
        setDemoModeState(Boolean(data.demoMode));
        setEnableNewProjectWorkflow(Boolean(data.enableNewProjectWorkflow));
      })
      .catch(() => {
        setDemoModeState(false);
        setEnableNewProjectWorkflow(false);
      });
  }

  useEffect(refresh, []);

  async function setDemoMode(enabled: boolean) {
    const res = await fetch(`${API_BASE_URL}/api/dev/demo-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      credentials: "include",
    });
    if (!res.ok) throw new Error("demo mode toggle failed");
    const data = await res.json();
    setDemoModeState(Boolean(data.demoMode));
  }

  return (
    <DemoModeContext.Provider value={{ demoMode, enableNewProjectWorkflow, refresh, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
