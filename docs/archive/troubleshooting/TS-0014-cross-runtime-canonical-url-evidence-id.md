---
id: TS-0014
title: Java·TypeScript canonical URL의 근거 ID 불일치
type: troubleshooting
status: verified
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../contracts.md
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
---

# TS-0014 Java·TypeScript canonical URL의 근거 ID 불일치

## 증상과 영향

Linked Gateway는 Blog 근거가 실제 Naver 응답에서 유래했는지 확인하기 위해 Java core와
같은 `SHA-256("blog|" + canonicalUrl)`의 앞 16자리로 evidence ID를 다시 계산한다.
두 구현의 공식은 같았지만 percent-encoded 한글 경로가 있는 합성 URL에서 Gateway는
`e-a9e8168b6bb8e7ad`, Java는 `e-8abd4b50714cafe9`를 만들었다.

이 차이를 남겨 두면 일반 영문 URL fixture는 통과해도 실제 Blog URL에 percent encoding이
포함될 때 올바른 Java 이유 요청을 Gateway가 변조로 오인해 Elice upstream 전에 거부한다.
자격이나 Provider 응답 문제가 아니며 같은 입력의 내부 identity가 런타임에 따라 달라지는
재현 가능한 계약 결함이다.

## 조사 기록

1. Gateway 공격 테스트는 임의 evidence ID를 거부했지만 expected 상수도 TypeScript에서
   계산한 값만 사용해 Java와의 교차 검증이 없었다.
2. Java `CanonicalHttpUrl`은 `URI#getRawPath()`와 `getRawQuery()`를 URI component
   constructor에 다시 전달했다. 이 constructor는 이미 포함된 `%`를 `%25`로 escape해
   raw 경로를 이중 인코딩했다.
3. TypeScript의 WHATWG `URL`은 같은 raw percent encoding을 보존했기 때문에 hash 입력이
   달라졌다. 단순 URL의 결과는 같아 기존 단위 테스트에서 발견되지 않았다.
4. 실제 Provider를 재호출하지 않고 percent-encoded 한글 경로 합성 벡터로 두 결과를
   비교해 원인을 격리했다.

## 근본 원인과 해결

근본 원인은 canonical URL의 의미 규칙은 문서화했지만 byte-level hash 입력과 교차
런타임 conformance vector를 고정하지 않은 것이다. Java의 raw component를 이미
escaped 된 데이터가 아닌 일반 component처럼 다시 조립한 것이 직접 원인이었다.

Java는 scheme·소문자 host·정리된 기본 port로 origin만 component constructor에서 만든
뒤, 기존 raw path와 raw query를 문자열로 결합해 한 번만 parse·normalize하도록
수정했다. 이 방식은 fragment를 제거하고 dot segment를 정리하면서 `%EC...` 경로를
`%25EC...`로 바꾸지 않는다. Gateway는 같은 canonical URL을 사용해 evidence ID를
계산하고, Naver에서 캡처한 link·title·summary와 모두 정확히 맞아야 Elice 호출을 허용한다.
WHATWG URL과 Java URI가 encoded dot segment를 서로 다른 시점에 정규화하는 차이는
`%2e`를 해석했을 때 `.` 또는 `..`가 되는 path segment를 양쪽 모두 거부해 닫는다.

## 검증과 재발 방지

Java `CandidateNormalizerTest`와 Edge Linked Gateway 전체 흐름에 같은 합성 URL과
`e-a9e8168b6bb8e7ad` expected ID를 둔다. 2026-07-15 Java 17 대상 테스트와 Linked source
compile이 통과했고, 최종 Edge 13개 파일의 153개 테스트와 typecheck·Wrangler dry-run을
통과했다. 실제 Provider는 이 진단에서 호출하지 않았다.

향후 URL identity 규칙을 변경할 때는 Java와 TypeScript 벡터를 같은 PR에서 갱신하고,
percent encoding·기본 port·fragment·literal·encoded dot segment·query를 포함한 교차
검증을 먼저 통과시킨다. 임의로 한쪽 hash 값을 allowlist에 추가하거나 evidence ID 형식만 검사해
provenance를 약화하지 않는다.
