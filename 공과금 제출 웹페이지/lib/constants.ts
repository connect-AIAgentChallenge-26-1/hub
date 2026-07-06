// 공과금 카테고리 정의 — 디자인 토큰(색상)과 1:1 매핑 (screen-spec.md)

export type Category = "ELECTRIC" | "GAS" | "WATER" | "MAINT" | "ETC";

export const CATEGORIES: {
  key: Category;
  label: string;
  icon: string;
  color: string;
  defaultProvider?: string;
}[] = [
  { key: "ELECTRIC", label: "전기", icon: "⚡", color: "var(--bill-electric)", defaultProvider: "한국전력" },
  { key: "GAS", label: "가스", icon: "🔥", color: "var(--bill-gas)", defaultProvider: "도시가스" },
  { key: "WATER", label: "수도", icon: "💧", color: "var(--bill-water)", defaultProvider: "상수도사업본부" },
  { key: "MAINT", label: "관리비", icon: "🏢", color: "var(--bill-maint)" },
  { key: "ETC", label: "기타", icon: "📄", color: "var(--text-weak)" },
];

export function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

// 지출 카테고리 라벨(예산 화면)
export const EXPENSE_CATEGORIES = ["공과금", "식비", "생활용품", "교통", "여가", "기타"];
