# S24-C — PublishabilityEvaluator Extraction

완료일: 2026-07-12  
패키지: `0.4.4-observation.3-policy.15-foundation.7`  
PublishabilityEvaluator: `0.1.0`  
Policy pipeline compatibility version: `0.1.17`

## 목적

Policy.15 pipeline에 분산되어 있던 candidate 게시 판단 책임을 독립 계층으로 분리한다.

```text
candidate verdict
calendar-feed inclusion
publication reason/rule ownership
temporalRole guard
determinism guard
chronology guard
```

`eventType`, `actionType`, `temporalRole` 분류는 SemanticClassifier가 계속 소유하고,
`targetActor`, `audienceRules`는 ApplicabilityEvaluator가 소유한다.
PublishabilityEvaluator는 이 상위 계층의 결과를 변경하지 않고 게시 가능성만 판정한다.

## 구현

신규 모듈:

```text
noticepilot_publishability_evaluator.py
```

주요 API:

```text
PublishabilityEvaluator.base_projection(...)
PublishabilityEvaluator.evaluate_candidate(...)
PublishabilityEvaluator.evaluate_projection(...)
PublishabilityEvaluator.demote_candidate(...)
PublishabilityEvaluator.publication_reason_codes(...)
```

pipeline composition root:

```text
PUBLISHABILITY_EVALUATOR = PublishabilityEvaluator()
```

기존 API는 compatibility wrapper로 유지한다.

```text
candidate_disposition_for_audience(...)
demote_candidate_for_review(...)
```

따라서 기존 호출자는 유지되며 candidate의 다음 projection은 evaluator 결과에서 생성된다.

```text
status
includeInCalendarFeed
feedScopes
reasonCodes
confidence
uncertaintyReasons
```

## 게시 규칙

기본 actor/board 규칙:

```text
board 716 exact application period → auto_confirmed / job_application
student                           → auto_confirmed / student_default
mixed                             → needs_review
unknown                           → needs_review
other actor                       → not_calendar_relevant
```

명시적 temporal-role guard:

```text
reference_date       → needs_review
internal_process     → needs_review
conditional_followup → needs_review
unknown              → needs_review
```

기존 corpus에서 guard 대상 후보가 이미 review 상태인 경우 reason code를 추가하거나
재작성하지 않는다. 이 원칙으로 Policy.15 compatibility projection을 보존한다. 다만 향후
생산자가 이러한 role을 auto-confirmed로 전달하면 evaluator가 fail-closed로 demote한다.

추가 guard:

```text
non-deterministic temporal mention → needs_review
invalid chronology                 → needs_review, confidence=low
```

## Rule ID

S24-C는 기존 `reasonCodes`를 삭제하지 않는다. 대신 판단 근거를 다음 계층으로 구분해
`PublishabilityJudgment.ruleIds`를 재구성한다.

```text
publishability.audience.*
publishability.board716.*
publishability.temporal_role.*
publishability.reason.*
publishability.verdict.*
```

현재 runtime candidate에는 `ruleIds`와 `publishabilityJudgment`를 S24-D부터 직렬화한다.
두 판단 객체의 동시 직렬화와 전수 projection 검증은 S24-D 범위다.

## compatibility 경계

S24-C에서 유지되는 값:

```text
candidate ID
normalizedStart / normalizedEnd
eventType / actionType / temporalRole
targetActor / audienceRules
status / includeInCalendarFeed / feedScopes
reasonCodes / uncertaintyReasons / confidence
publishable candidate ID set
review queue
student/job ICS
```

## 전수 감사

명령:

```bash
python3 tools/audit_s24_publishability_evaluator.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```

결과:

```text
result: pass
candidate count:                               1,304
unique candidate IDs:                          1,304
PublishabilityJudgment reconstruction:         1,304 / 1,304
compatibility projection mismatches:               0
publishability contract errors:                    0
auto_confirmed:                                  909
needs_review:                                    395
deterministic temporal mentions:               1,304
valid chronology:                              1,304
temporal-role guard candidates:                   90
publishable legacy projection mismatch:            0
review queue mismatch:                             0
student/job ICS semantic diff:                     0
```

S24-D 경계:

```text
runtime publishabilityJudgment field count: 1,304
runtime wiring completed in S24-D: true
```

## 테스트

신규 집중 테스트 12개:

- composition-root wiring
- student and board 716 base rules
- mixed/unknown actor review
- reference/internal/conditional temporal-role guards
- non-deterministic temporal guard
- chronology guard
- existing review compatibility preservation
- runtime candidate compatibility projection
- evaluator-owned demotion wrapper
- full-corpus audit CLI

전체 결과:

```text
208 tests passed
```

## 다음 단계

다음 작업은 `S24-D Runtime wiring / layer audit`이다.

```text
ApplicabilityJudgment 직렬화
PublishabilityJudgment 직렬화
기존 projection과 판단 객체의 1,304건 전수 정합성 검사
S25 진입 전 layered audit 완료
```
