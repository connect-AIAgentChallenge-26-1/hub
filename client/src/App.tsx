import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RepoConnectPage from "./pages/RepoConnectPage";
import AnalysisReportPage from "./pages/AnalysisReportPage";
import WorkspacePage from "./pages/WorkspacePage";
import CommitReviewPage from "./pages/CommitReviewPage";
import FeatureRequestPage from "./pages/FeatureRequestPage";
import ExpansionWorkspacePage from "./pages/ExpansionWorkspacePage";
import { DemoModeProvider, useDemoMode } from "./lib/DemoModeContext";

function DemoModeBadge() {
  const { demoMode } = useDemoMode();
  if (!demoMode) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        background: "var(--amber-bg)",
        color: "var(--amber)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.03em",
        padding: "4px 9px",
        borderRadius: 5,
        pointerEvents: "none",
      }}
    >
      DEMO MODE
    </div>
  );
}

function App() {
  return (
    <DemoModeProvider>
      <BrowserRouter>
        <DemoModeBadge />
        <Routes>
          <Route path="/" element={<Navigate to="/repo" replace />} />
          <Route path="/repo" element={<RepoConnectPage />} />
          <Route path="/analysis" element={<AnalysisReportPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/commit-review" element={<CommitReviewPage />} />
          <Route path="/expansions/new" element={<FeatureRequestPage />} />
          <Route path="/expansions/:expansionId" element={<ExpansionWorkspacePage />} />
        </Routes>
      </BrowserRouter>
    </DemoModeProvider>
  );
}

export default App;
