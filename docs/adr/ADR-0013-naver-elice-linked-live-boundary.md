---
id: ADR-0013
title: Naver→Elice Linked Live의 로컬 신뢰·데이터 경계
type: adr
status: accepted
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../contracts.md
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../runbooks/RUN-0004-recommendation-workflow-linked-live.md
  - ../experiments/EXP-0001-linked-live-representative-scenario-repeatability.md
  - ../troubleshooting/TS-0018-elice-structured-output-unsupported-array-keyword.md
  - https://github.com/gdh0730/hub/issues/50
  - ADR-0009-mock-local-live-gateway-boundary.md
  - ADR-0011-elice-chat-completions-provider-boundary.md
  - ADR-0012-recommendation-core-and-split-live-boundary.md
---

# ADR-0013 Naver→Elice Linked Live의 로컬 신뢰·데이터 경계

## 맥락과 문제

Mock linked는 제품 core 규칙을, 개별 Local Live는 인증·schema를, Split Live는 네 실제
Provider 요청의 독립 호환성을 검증하도록 설계됐다. 어느 축도 같은 실행에서 받은 실제
Naver 장소·Blog 근거가 제품 점수와 Top 3를 거쳐 실제 Elice 이유 생성으로 연결되는지는
증명하지 않는다.

원본 자격을 Java나 CI에 직접 전달하거나 실제 응답을 fixture로 저장하면 비밀·데이터
노출 위험이 커진다. 또한 Linked 실행의 성공과 제품 runtime·클라우드 배포·법률 준수를
같은 상태로 표현하면 검증 범위를 과장한다.

저장소 소유자는 Naver와 Elice 양쪽의 실행 승인이 있고 현재 제품 문맥의 전달도
승인됐다고 진술했다. 승인 원문은 이 저장소 작업에서 독립적으로 검토하지 않았다.

## 판단 기준과 검토 대안

기준은 실제 Provider 간 데이터 연결, provenance 검증, 비밀 최소 권한, 원문 비저장,
결정적 사용자 확인, 호출 상한과 검증 상태의 명확성이다.

- Split Live를 최종 증거로 사용하면 Naver→Elice가 실제로 연결되지 않아 목적을 달성하지
  못한다.
- Java 프로세스가 raw credential을 소유하면 구성은 단순하지만 test report와 예외의
  노출 면적을 넓힌다.
- 실제 응답을 저장한 뒤 오프라인 Elice를 호출하면 재현성은 생기지만 Naver 원문을
  영구 보존하고 같은 실행의 연결 증거도 약해진다.
- 로컬 stateful Gateway로만 자격과 응답 provenance를 보유하면 구현 비용은 늘지만 실제
  연결, fail-closed와 비저장 경계를 함께 검증할 수 있다.

## 결정

PP-040에서 고정 합성 입력을 사용하는 invocation-bound 로컬 반복 Linked Live harness를
도입한다. 각 invocation은 새 Gateway·일회성 로컬 자격·독립 호출 예산을 가지며 HTTP
retry와 구분한다.
제품 runtime이나 배포 Live를 활성화하지 않는다. 실행 계약은 다음과 같다.
이 결정은 ADR-0009·ADR-0011·ADR-0012를 폐기하지 않고, 그중 Linked Live의 로컬
검증 예외와 성공 증거만 구체화한다.

```text
실제 Elice 조건 추출
  -> versioned 사용자 확인 fixture
  -> 실제 Naver Local 1~2회
  -> 제품 정규화·filter·dedup·예비 후보 pool 최대 5개
  -> 실제 Naver Blog 3~5회
  -> 최종 0~80 점수·Top 3
  -> 실제 Elice 근거 이유 1회
  -> 서버 place·evidence 검증
```

조건 추출은 Draft를 자동 확정하지 않는다. 합성 입력의 의미와 schema를 검증한 뒤 별도
확정 fixture를 core에 전달한다. 총 논리 호출 상한은 9회이고 redirect·자동 retry는
허용하지 않으며 Embedding은 호출하지 않는다. 실제 성공은 `linked=true`, 후보 3개,
`degraded=false`, `reasonFallback=false`를 모두 만족해야 한다.

원본 Naver·Elice 자격은 `.env.live.local`을 직접 parsing한 Loopback Gateway만 가진다.
Java에는 127.0.0.1 URL과 Provider별로 분리된 일회성 local 자격만 준다. Gateway는
condition → Local → 선택적 완화 → Blog → reason 순서를 보유하고, 실제 Naver 응답에서
유래하지 않은 장소·근거 또는 후보 간 evidence 교차를 Elice 호출 전에 거부한다.

Elice에는 사용자가 승인한 현재 전체 제품 문맥 중 다음 allowlist만 전달한다.

- 확정 조건: `locationQuery`, `placeType`, `placeTypeDetail`, `preferences`, `exclusions`
- 장소: UUID `placeId`, 장소명, category
- Local 근거: evidence ID·유형·장소명 `title`, category·description·주소·도로명 주소를
  정규화해 결합한 `summary`
- Blog 근거: evidence ID·유형·제목·요약

Elice 응답은 자유 요약이 아니라 유형별 고정 문장 계약으로 제한한다. `LOCAL`은
`검증된 장소 정보에 따라 이 후보를 제안합니다.`, `BLOG`는
`연결된 블로그 근거를 함께 확인할 수 있습니다.`만 허용하고 문장마다 정확히 하나의
evidence ID를 인용한다. strict schema의 text enum과 단일 ID 배열에 더해 Java와
Gateway가 evidence 유형과 문장을 다시 대조한다. 장소명·근거 단어가 겹친다는 이유만으로
속성을 지어내는 false-success를 막기 위한 결정이다. 점수·순위는 결정론적 서버가 Elice
호출 전에 확정하므로 LLM에는 전달하지 않고 생성 권한도 주지 않는다.
정확히 한 evidence라는 배열 제약은 `minItems=1`, `maxItems=1`과 서버 검증으로
완결한다. Elice strict Structured Outputs 지원 부분집합에서 400을 일으킨
`uniqueItems`는 사용하지 않는다.

Naver·Elice 자격, 원문 응답 전체, Local·Blog URL, 좌표, `CandidateKey`, Blog 작성자·
작성일, 점수·순위, session·개인정보와 Provider routing URL은 전달하지 않는다. 응답은
메모리에서만 사용하고 cache·DB·파일·artifact에 저장하지 않는다.

이 허용은 저장소 소유자의 승인 진술을 전제로 한 고정 합성 입력의 로컬 검증 예외다.
승인 원문을 독립 검토하지 않았으므로 법률·약관 준수, Elice의 미보관·미학습 또는 실제
사용자 데이터 처리 허용을 주장하지 않는다. 제품 runtime·실제 사용자 입력·영구 저장과
배포는 기존 PP-029·PP-030·PP-033·PP-035 gate를 유지한다.

자동 harness와 실제 실행 증거도 구분한다. source set·Gateway·guard가 Mock 기반 검증을
통과하면 harness 코드는 `implemented`가 될 수 있다. 실제 Linked 계약은 검토·push된
정확한 SHA의 allowlist 시나리오가 독립 invocation으로 strict success를 통과해야
`implemented`다. 실패·degraded·fallback은 안전 동작이지 Linked 성공이 아니다.

## 결과와 트레이드오프

실제 Naver 응답의 출처를 유지한 채 제품 core와 Elice 이유 생성까지 연결해 개별 canary나
Split Live보다 강한 핵심 워크플로 증거를 얻을 수 있다. Java·GitHub Actions·공유 Fork에
raw credential을 전달하지 않고 호출·데이터 범위를 Gateway가 강제한다.

대신 stateful Gateway와 별도 source set·launcher를 유지해야 하고, 실제 Provider 결과가
달라 개별 invocation이 비결정적으로 실패할 수 있다. 승인 원문을 검토하지 않았으므로 이
결정 자체는 규제·계약 적합성 증거가 아니다. 주소·도로명 주소를 Elice에 전달하는 선택은
최소 필드 방식보다 데이터 범위가 크며 승인 범위가 바뀌면 즉시 축소해야 한다.

## 검증과 재검토 조건

필수 자동 검증은 다섯 Mock core 시나리오, Gateway 상태·provenance·호출 상한, 자격 교차
0건, 공격 field·route·method 거부, no-retry·no-redirect, cleanup과 report secret scan이다.
표준 `make check`와 CI에서는 실제 Provider 호출이 0건이어야 한다.

실제 실행은 [RUN-0004](../runbooks/RUN-0004-recommendation-workflow-linked-live.md)에 따라
기본적으로 병합된 정확한 `origin/main` SHA에서 수행한다. 저장소 소유자가 반복 개발
검증을 승인한 경우에는 exact allowlist 전용 branch의 clean·pushed SHA에서 독립
invocation을 반복할 수 있다. 각 invocation의 9회 상한과 no-retry·no-redirect는 유지한다.
성공 전에는 PP-040·WI-0042와 Linked 계약을 완료 처리하지 않는다.

2026-07-15 21:10 KST 첫 실행은 SHA `541a98b3b73bfdaa3a1c7396aaea32ce410a7237`에서
조건 추출 `PROVIDER_UNAVAILABLE`로 종료됐다. 같은 SHA에서 재실행하지 않았고 생성 report
10개 안전 scan과 downstream 중단을 확인했다. 이는 fail-closed 결정이 작동한 제한된
증거일 뿐 전체 Linked 성공, Provider 가용성 또는 약관 적합성 증거가 아니다. 현재 안전
오류만으로 upstream 5xx와 전송·timeout을 구분할 수 없으므로 Mock 진단과 검토·push된 새
검증 SHA가 후속 재검증 조건이다.

후속 진단에서 로컬 workerd 전송 경계와 제품 Provider 오류를 분리했고 Node 24 실행
adapter로 같은 Gateway 정책을 유지했다. 이유 생성 400은 strict schema의
`uniqueItems`가 Provider 지원 부분집합과 맞지 않은 원인이었으며 정확히 한 ID 의미를
`minItems=1`, `maxItems=1`과 서버 검증으로 유지한 채 해당 keyword를 제거했다. nullable
시나리오의 exact `Seoul`은 finite alias로만 사용자 확인 정본 `서울`에 연결하며 broad·
fuzzy 해석은 금지한다. 조건 cross-field 불일치는 원문 없는 field별 safe code로
fail-closed한다.

2026-07-15 최종 push SHA `e789af65e94441aa38a018a2931c3705f7125112`에서 완전
입력 카페, nullable 음식점, nullable 디저트 카페의 세 allowlist 시나리오를 독립 실행했다.
세 실행 모두 실제 Elice 조건 추출, 사용자 확인 fixture, 실제 Naver Local·Blog, 제품
점수·Top 3, 실제 Elice 이유와 서버 provenance 검증을 통과했다. safe summary의 논리 호출은
`7/6/6`이고 모두 `linked=true`, `degraded=false`, `reasonFallback=false`,
`cleanup=true`, retry 0회였다. 이에 PP-040의 동기 Linked core와 WI-0042, 로컬 Linked
계약을 `done`/`implemented`로 확정한다. 이 결과는 공개 API·DB·Worker·SSE·frontend,
제품 runtime, cloud 배포, SLA 또는 법률·약관 적합성의 완료 증거가 아니다.

승인 범위 철회·변경, 주소 전달 불허, Elice 보관·학습 정책 변화, Provider endpoint·schema
변화, 비밀·원문 노출 또는 호출 상한 초과가 관찰되면 즉시 실행을 중단하고 이 ADR을
재검토한다. 제품 runtime을 연결할 때도 이 로컬 예외를 자동 승계하지 않고 별도 보안·
개인정보·약관 검토를 수행한다.
