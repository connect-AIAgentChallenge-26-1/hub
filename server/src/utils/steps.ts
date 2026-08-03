import { readJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

export interface Step {
  id: number;
  name: string;
  status: "pending" | "active" | "done";
  progress_pct: number;
  agent_name: string;
}

// Shared seed used both for a brand-new user's initial steps.json (auth.ts's
// callback) and for the dev-only /api/dev/reset endpoint, so the two never
// drift apart into two different "fresh workflow" definitions.
export const SEED_STEPS: Step[] = [
  { id: 1, name: "요구사항 분석", status: "active", progress_pct: 0, agent_name: "Requirements Agent" },
  { id: 2, name: "게임 기획", status: "pending", progress_pct: 0, agent_name: "Game Design Agent" },
  { id: 3, name: "게임 시스템 설계", status: "pending", progress_pct: 0, agent_name: "Game Systems Agent" },
  { id: 4, name: "클래스 설계 (UML)", status: "pending", progress_pct: 0, agent_name: "Class Design Agent" },
  { id: 5, name: "프로젝트 구조 설계", status: "pending", progress_pct: 0, agent_name: "Project Structure Agent" },
  { id: 6, name: "ScriptableObject 설계", status: "pending", progress_pct: 0, agent_name: "ScriptableObject Agent" },
  { id: 7, name: "코드 생성", status: "pending", progress_pct: 0, agent_name: "Code Generation Agent" },
  { id: 8, name: "리팩토링 및 코드 리뷰", status: "pending", progress_pct: 0, agent_name: "Refactoring Agent" },
  { id: 9, name: "문서화", status: "pending", progress_pct: 0, agent_name: "Documentation Agent" },
];

export function stepsFile(userId: number): string {
  return getUserDataPath(userId, "steps.json");
}

export async function getSteps(userId: number): Promise<Step[]> {
  return readJson<Step[]>(stepsFile(userId));
}

export async function getStep(userId: number, id: number): Promise<Step | null> {
  const steps = await getSteps(userId);
  return steps.find((s) => s.id === id) ?? null;
}
