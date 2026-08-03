import { shouldLoadSuggestions } from "./searchSuggestions";

test("업체 선택 후에는 같은 검색어로 자동완성을 다시 요청하지 않는다", () => {
  expect(shouldLoadSuggestions({ enabled: false, query: "메가MGC커피 강남중앙점", mapReady: true })).toBe(false);
});

test("사용자가 두 글자 이상 직접 입력할 때만 자동완성을 요청한다", () => {
  expect(shouldLoadSuggestions({ enabled: true, query: "메가", mapReady: true })).toBe(true);
  expect(shouldLoadSuggestions({ enabled: true, query: "메", mapReady: true })).toBe(false);
});
