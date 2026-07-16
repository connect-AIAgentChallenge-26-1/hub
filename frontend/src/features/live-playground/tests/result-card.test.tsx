import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultCard } from "../components/result-list";
import { mockResult } from "../fixtures/mock-data";

describe("ResultCard", () => {
  it("후보의 순위·점수·근거·주의점과 안전한 외부 링크를 함께 표시한다", () => {
    const html = renderToStaticMarkup(<ResultCard place={mockResult.places[0]!} />);

    expect(html).toContain("1위");
    expect(html).toContain("Evidence score");
    expect(html).toContain("검증된 추천 이유");
    expect(html).toContain("가격 정보는 검색 근거에서 확인되지 않았습니다.");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("도보 시간");
    expect(html).not.toContain("지하철 출구");
  });
});
