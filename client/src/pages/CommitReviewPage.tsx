import { Navigate } from "react-router-dom";
import { useDemoMode } from "../lib/DemoModeContext";

export default function CommitReviewPage() {
  const { enableNewProjectWorkflow } = useDemoMode();

  if (enableNewProjectWorkflow === null) return null;
  if (!enableNewProjectWorkflow) return <Navigate to="/expansions/new" replace />;

  return <div>커밋 리뷰</div>;
}
