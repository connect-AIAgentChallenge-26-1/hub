# S24-B — ApplicabilityEvaluator Extraction

완료일: 2026-07-12  
패키지: `0.4.4-observation.3-policy.15-foundation.5`  
ApplicabilityEvaluator: `0.1.0`  
Policy pipeline compatibility version: `0.1.15`

## 목적

Policy.15 pipeline 내부에 있던 다음 책임을 독립 applicability 계층으로 분리한다.

```text
notice actor inference
academic audience-rule extraction
profile scope classification
conditional selected-participant scope
subscription-profile matching
```

게시 판정은 변경하지 않는다. `status`, `includeInCalendarFeed`, `feedScopes` 및
게시 reason code의 소유권은 S24-C `PublishabilityEvaluator`로 넘긴다.

## 구현

신규 모듈:

```text
noticepilot_applicability_evaluator.py
```

주요 API:

```text
ApplicabilityEvaluator.infer_notice_audience(...)
ApplicabilityEvaluator.build_audience_rules(...)
ApplicabilityEvaluator.evaluate_candidate(...)
ApplicabilityEvaluator.evaluate_projection(...)
ApplicabilityEvaluator.matches_subscription_profile(...)
```

pipeline의 기존 공개 함수는 compatibility wrapper로 유지한다.

```text
infer_audience(...)
build_audience_rules(...)
candidate_matches_subscription_profile(...)
```

따라서 기존 호출자는 수정하지 않아도 되며, 실제 actor/audience projection은
새 evaluator를 거쳐 생성된다.

## 판단 범위

`ApplicabilityJudgment.scope`는 다음과 같이 분리된다.

```text
unrestricted   명시적 profile 제한이 없는 확정 actor
profile_scoped 학년·학위과정·학적·입학유형 차원이 명시됨
conditional    선발·합격·허가 등 사전 상태를 충족한 참여자 후속 행동
unknown        actor가 unknown 또는 mixed
```

현재 명시적 profile dimension:

```text
degreeLevels
studentYears
enrollmentStatuses
admissionTypes
```

Generic scholarship/program eligibility 문구는 기존 Policy.15 원칙대로 candidate를
과도하게 제한하지 않는다. 안정적인 academic action에 한해 profile scope를 만든다.

## compatibility 경계

S24-B는 runtime candidate에 `applicabilityJudgment` 필드를 S24-D부터 기록한다.
S24-D에서 `ApplicabilityJudgment`와 `PublishabilityJudgment`를 함께 연결하고 전수
projection 정합성을 검사한다.

현재 candidate 출력은 그대로 유지한다.

```text
targetActor
audienceRules
candidate ID
status
includeInCalendarFeed
feedScopes
reasonCodes
ICS projection
```

## 전수 감사

명령:

```bash
python3 tools/audit_s24_applicability_evaluator.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```

결과:

```text
result: pass
candidate count:                              1,304
unique candidate IDs:                         1,304
ApplicabilityJudgment reconstruction:         1,304 / 1,304
compatibility projection mismatches:              0
applicability contract errors:                    0
publishable legacy projection mismatches:         0
review queue mismatch:                            0
student/job ICS semantic diff:                    0
```

scope 분포:

```text
unrestricted:       990
unknown:             282
profile_scoped:       12
conditional:          20
```

target actor 분포:

```text
student:             720
job_applicant:       300
unknown:             216
mixed:                68
```

S24-D 경계 검증:

```text
runtime applicabilityJudgment field count: 1,304
runtime wiring completed in S24-D: true
```

## 테스트

신규 집중 테스트 11개:

- composition-root wiring
- board actor compatibility
- mixed/unknown scope
- explicit academic profile scope
- generic eligibility over-scoping 방지
- leave/return enrollment-status ownership
- selected-participant conditional scope
- result-announcement conditional 오분류 방지
- compatibility candidate projection
- full-corpus audit CLI

전체 결과:

```text
196 tests passed
```

## 다음 단계

다음 작업은 `S24-C PublishabilityEvaluator extraction`이다. S24-C에서는 다음 책임만
분리한다.

```text
status
includeInCalendarFeed
publication reason/rule IDs
temporalRole guard
chronology/determinism guard
```

`applicabilityJudgment`의 candidate 직렬화는 S24-D에서 완료한다.
