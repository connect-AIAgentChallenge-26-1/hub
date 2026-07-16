import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FailurePanel } from "../components/live-playground";

describe("FailurePanel", () => {
  it("안전한 오류·진단·trace ID와 복사 동작을 표시한다", () => {
    const html = renderToStaticMarkup(
      <FailurePanel
        failure={{
          errorCode: "CONDITION_PROVIDER_INVALID_RESPONSE",
          diagnosticCode: "CONDITION_BUDGET_ORDER_INVALID",
          title: "조건 추출 실패",
          detail: "조건을 추출하지 못했습니다.",
          traceId: "safe-trace-id",
        }}
        onReset={() => undefined}
      />,
    );

    expect(html).toContain("CONDITION_PROVIDER_INVALID_RESPONSE");
    expect(html).toContain("CONDITION_BUDGET_ORDER_INVALID");
    expect(html).toContain("safe-trace-id");
    expect(html).toContain("복사");
  });
});
