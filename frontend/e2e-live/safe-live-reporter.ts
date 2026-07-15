import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import type { Buffer } from "node:buffer";

/**
 * Live Playground에는 실제 Provider 데이터가 표시된다. Playwright 기본 reporter가
 * 실패한 locator의 DOM이나 네트워크 정보를 출력하지 않도록 고정된 안전 요약만 남긴다.
 */
export default class SafeLiveReporter implements Reporter {
  onBegin(_config: FullConfig, suite: Suite): void {
    process.stdout.write(`LIVE_PLAYGROUND_E2E status=started testCount=${suite.allTests().length}\n`);
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    const failureCode = result.status === "passed" ? "NONE" : safeFailureCode(result);
    process.stdout.write(`LIVE_PLAYGROUND_E2E status=${safeStatus(result.status)} failureCode=${failureCode}\n`);
  }

  onStdOut(chunk: string | Buffer): void {
    const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    value.split(/\r?\n/).forEach((line) => {
      if (/^LIVE_PLAYGROUND_E2E stage=[A-Z0-9_]+ status=passed$/.test(line)) {
        process.stdout.write(`${line}\n`);
      }
    });
  }

  onEnd(result: FullResult): void {
    process.stdout.write(`LIVE_PLAYGROUND_E2E status=${result.status}\n`);
  }

  printsToStdio(): boolean {
    return true;
  }
}

function safeStatus(status: TestResult["status"]): string {
  switch (status) {
    case "passed":
    case "failed":
    case "timedOut":
    case "skipped":
    case "interrupted":
      return status;
    default:
      return "unknown";
  }
}

function safeFailureCode(result: TestResult): string {
  const safeCode = result.errors
    .map((error) => `${error.message ?? ""} ${error.value ?? ""}`)
    .join(" ")
    .match(/(?:LIVE_UI_CONTRACT|LIVE_PLAYGROUND_E2E):[A-Z0-9_]+/)?.[0];
  return safeCode?.replace(":", "_") ?? "UNCLASSIFIED";
}
