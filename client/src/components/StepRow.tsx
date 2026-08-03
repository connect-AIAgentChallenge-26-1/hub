import type { SidebarStep } from "../lib/api";

interface Props {
  step: SidebarStep;
  isSelected: boolean;
  onSelect: (id: number) => void;
}

export default function StepRow({ step, isSelected, onSelect }: Props) {
  const clickable = step.status === "done" || step.status === "active";

  return (
    <div
      className={`step-row ${step.status}${isSelected ? " active-selected" : ""}`}
      style={{ cursor: clickable ? "pointer" : "not-allowed" }}
      title={clickable ? "클릭해서 이 단계 보기" : "이전 단계를 먼저 완료해야 볼 수 있어요"}
      onClick={clickable ? () => onSelect(step.id) : undefined}
    >
      <span className="step-n">{String(step.id).padStart(2, "0")}</span>
      <span className="step-label">{step.name}</span>
      <span className="step-pct">{step.progress_pct}%</span>
    </div>
  );
}
