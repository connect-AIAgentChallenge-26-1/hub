---
id: TS-0015
title: Java·TypeScript Naver HTML plain text 불일치
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

# TS-0015 Java·TypeScript Naver HTML plain text 불일치

## 증상과 영향

Java Naver adapter는 Spring `HtmlUtils.htmlUnescape`로 Provider의 title·description을
plain text로 바꾸지만, Linked Gateway는 여섯 개 entity를 대소문자 구분 없이 직접
치환했다. Gateway는 실제 Naver 응답에서 파생된 장소와 근거만 Elice로 전달되도록 Java
이유 요청을 대조하므로 두 결과가 다르면 정상 요청도 변조로 오인해 거부한다.

차이는 decimal·hex numeric entity, HTML 4 named entity의 대소문자, `&apos;`와 unknown
entity, 최대 reference 길이, double encoding, non-breaking space에서 재현됐다. 특히
numeric entity는 실제 검색 title·description에서도 나타날 수 있어 병합된 `main`의
일회성 Linked Live를 불필요하게 실패시킬 수 있었다.

## 조사 기록

1. Spring decoder는 HTML 4 named entity 253개를 case-sensitive로 한 번만 decode한다.
2. decimal과 `x` 또는 `X` hex numeric reference는 Unicode 최대 code point까지
   처리하고, unknown·semicolon 누락·길이 제한 초과 reference는 원문으로 남긴다.
3. `&#-1;`과 `&#x-1;`은 Spring 전체 문자열 decoder에서 `IllegalArgumentException`을
   발생시켜 뒤의 정상 text 처리까지 중단할 수 있었다.
4. Java adapter의 기존 ASCII whitespace 축약과 추천 normalizer·Gateway의 Unicode
   whitespace 축약이 달라 `&nbsp;`가 경계마다 다른 plain text가 됐다.
5. 기존 Mock fixture는 일반 한글과 `&amp;`만 사용해 decimal·hex·malformed 경계를
   동시에 통과시키지 않았다.

## 근본 원인과 해결

근본 원인은 Java와 TypeScript가 같은 Naver 원문을 비교하면서도 entity와 whitespace의
byte-level 변환 계약을 공유하지 않은 것이다. Gateway의 정규식 나열은 일반 HTML parser는
아니었지만 Spring의 실제 HTML 4 계약보다 좁고 case 규칙도 달랐다.

Java에는 최대 `; - & = 9`인 reference만 entity별로 Spring에 전달하는
`SafeHtmlEntityDecoder`를 추가했다. 한 entity가 음수 numeric 등으로 예외를 일으키면
그 reference만 원문으로 보존하고 다음 text 처리를 계속한다. Naver adapter와 추천
normalizer가 이 decoder를 함께 사용하며 Unicode whitespace를 한 칸으로 축약한다.

Edge에는 같은 길이 제한, HTML 4 named map, decimal·hex parser와 Unicode whitespace
규칙을 가진 작은 전용 decoder를 두었다. 전체 HTML document parser, 재귀 decode 또는
관대한 missing-semicolon 처리는 도입하지 않았다. 입력은 한 번만 decode하고 출력 길이는
입력보다 커지지 않으며 unknown·malformed·음수·범위 초과 reference는 그대로 보존한다.

## 검증과 재발 방지

양쪽 테스트에는 다음 여섯 ID와 동일한 입력·기대 plain text를 고정했다.

- `NAVER_HTML_V1_NUMERIC`: decimal, 소문자·대문자 hex와 supplementary code point
- `NAVER_HTML_V1_NAMED_CASE`: HTML 4 named, 대소문자와 unknown·`apos`
- `NAVER_HTML_V1_MALFORMED_BOUNDED`: double encoding, 최대 길이와 malformed
- `NAVER_HTML_V1_NEGATIVE_OUT_OF_RANGE`: 음수와 Unicode 범위 초과 numeric
- `NAVER_HTML_V1_ESCAPED_MARKUP`: decode 뒤 생긴 tag 제거
- `NAVER_HTML_V1_UNICODE_WHITESPACE`: `nbsp`, tab과 Unicode 공백 축약

2026-07-15 Edge targeted 6개와 전체 13개 파일 153개 테스트, TypeScript typecheck가
통과했다. Java 17에서는 `./gradlew clean` 뒤 Naver sanitizer와 candidate normalizer
targeted test가 assertion까지 통과했다. 첫 Java 실행의 stale test result index 오류는
제품 assertion 실패와 분리했고, 깨끗한 output에서 같은 source를 재검증했다. 실제
Provider와 Live task는 호출하지 않았다. 따라서 양쪽 공통 벡터의 실행 증거를 확보해 이
문서를 `verified`로 전환한다.

Spring HTML entity 계약, Unicode whitespace 규칙 또는 Naver Provider text 형식이 바뀌면
양쪽 벡터를 같은 PR에서 갱신한다. 한쪽에만 entity를 추가하거나 unknown 값을 임의
decode하지 않으며, 실제 응답 사례가 생겨도 Provider 원문은 문서나 test artifact에
복사하지 않고 합성 벡터로 축약한다.
