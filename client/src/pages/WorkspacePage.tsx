import { useEffect, useState, useCallback } from "react";
import StepSidebar from "../components/StepSidebar";
import WorkspaceMainPanel from "../components/WorkspaceMainPanel";
import { API_BASE_URL, type Step } from "../lib/api";

interface ProjectInfo {
  repo_url: string;
  branch: string;
}

function repoFullNameFromUrl(repoUrl?: string): string | null {
  if (!repoUrl) return null;
  return repoUrl.replace("https://github.com/", "");
}

export default function WorkspacePage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const refreshSteps = useCallback(() => {
    fetch(`${API_BASE_URL}/api/steps`)
      .then((res) => res.json())
      .then((data: Step[]) => setSteps(data))
      .catch(() => setStepsError("단계 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요."));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/steps`)
      .then((res) => res.json())
      .then((data: Step[]) => {
        setSteps(data);
        const firstClickable = data.find((s) => s.status === "active" || s.status === "done");
        if (firstClickable) setSelectedStepId(firstClickable.id);
      })
      .catch(() => setStepsError("단계 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요."));

    fetch(`${API_BASE_URL}/api/analysis/project`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setProject)
      .catch(() => setProject(null));
  }, []);

  const selectedStep = steps.find((s) => s.id === selectedStepId);

  return (
    <section style={{ padding: "32px 24px", maxWidth: 1080, margin: "0 auto" }}>
      <div className="workspace">
        <StepSidebar
          steps={steps}
          selectedStepId={selectedStepId}
          onSelectStep={setSelectedStepId}
          repoFullName={repoFullNameFromUrl(project?.repo_url)}
          branch={project?.branch ?? null}
        />

        <div className="ws-main">
          {stepsError ? (
            <div style={{ color: "var(--red)", fontSize: 13 }}>{stepsError}</div>
          ) : !selectedStep ? (
            <div style={{ color: "var(--text-dim)" }}>표시할 단계가 없습니다.</div>
          ) : (
            // key forces a clean remount on step switch, so unsaved edits /
            // in-flight chat state never leak between steps.
            <WorkspaceMainPanel
              key={selectedStep.id}
              step={selectedStep}
              onStepsRefreshNeeded={refreshSteps}
            />
          )}
        </div>
      </div>
    </section>
  );
}
