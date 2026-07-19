# S24-A — Board 716 List-Metadata Trace Adaptation

완료일: 2026-07-12  
패키지: `0.4.4-observation.3-policy.15-foundation.4`  
파이프라인: `0.1.15`

## 목적

KNU board 716 채용 후보는 상세 본문 구조가 아니라 목록의 정확한 `접수기간`
metadata에서 생성된다. Policy.15 게시 판정은 정확했지만, 300개 후보의
`sourceSegment`, `temporalMention`, `boundTemporalFact`,
`semanticClassification`이 비어 있어 계층형 판단 trace가 불완전했다.

S24-A는 게시 의미를 변경하지 않고 이 별도 입력 경로를 S21~S23 계층형 계약에
연결한다.

## 구현

신규 모듈:

```text
noticepilot_board716_trace_adapter.py
```

변환 흐름:

```text
listMetadata.application_period_start/end
→ ScheduleSegment(segmentType=label_value, labelText=접수기간)
→ TemporalMention(resolutionKind=list_application_period)
→ BoundTemporalFact(bindingKind=same_segment)
→ SemanticClassification(eventType=job_application_period,
                          temporalRole=user_action_period)
```

명시적 rule ID:

```text
binding.board716.list_metadata.application_period
semantic.board716.exact_application_period
```

목록 metadata를 본문 추출로 위장하지 않는다. 출처는 segment ID prefix,
`resolutionKind`, binding rule ID, semantic rule ID 및 evidence로 식별된다.
기존 JSON Schema에 없는 `sourceKind` 또는 신규 `bindingKind` enum은 추가하지
않았다.

## 보존 계약

다음 값은 변경하지 않는다.

```text
candidate id / uidHint
normalizedStart / normalizedEnd
calendar all-day 및 inclusive-end 의미
eventType / actionType / temporalRole
targetActor / audienceRules
status / includeInCalendarFeed
feedScopes / campusScope
reasonCodes / uncertaintyReasons
createdBy
ICS UID 및 VEVENT 의미
```

## derived corpus 적용

제공 패키지는 2,059건의 원본 observation snapshot을 포함하지 않고 검증된
`derived/mvp-policy-v0.1` 산출물을 포함한다. 따라서 다음 deterministic migration
도구를 사용해 기존 full-corpus 산출물에 trace만 보강했다.

```bash
python3 tools/apply_s24_board716_trace_adaptation.py \
  --derived-dir derived/mvp-policy-v0.1
```

적용 결과:

```text
decision documents:                    2,059
publishable candidates:                  909
board 716 adapted candidates:            300
candidate-document adaptation entries:   600
segment documents appended:              300
```

도구는 재실행 시 이미 S24-A trace가 있는 후보를 건너뛰도록 idempotent하게
구성했다. 실제 observation snapshot이 있는 환경에서 파이프라인을 다시 실행하면
동일 adapter가 runtime 경로에서 직접 사용된다.

## 전수 감사

명령:

```bash
python3 tools/audit_s24_board716_trace_adaptation.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```

결과:

```text
result: pass
candidate count:                         1,304
unique candidate IDs:                    1,304
complete layered traces:                 1,304 / 1,304
board 716 metadata traces:                 300 / 300
trace linkage errors:                        0
legacy candidate projection mismatches:      0
review queue mismatch:                       0
student ICS semantic diff:                   0
job ICS semantic diff:                       0
```

trace 연결 검증:

```text
temporalMention.segmentId = sourceSegment.segmentId
boundTemporalFact.segmentId = sourceSegment.segmentId
boundTemporalFact.sourceNoticeId = candidate.sourceNoticeId
temporalMention.mentionId ∈ boundTemporalFact.temporalMentionIds
semanticClassification.eventType = candidate.eventType
semanticClassification.actionType = candidate.actionType
semanticClassification.temporalRole = candidate.temporalRole
```

## 기존 baseline comparator 해석

기존 `compare_policy_baseline.py`는 `sourceSegment`를 strict projection에 포함한다.
따라서 의도된 metadata segment 보강을 변경으로 보고한다.

```text
changeCount: 304
publishable candidate sourceSegment changes: 300
summary audit-counter changes:                  3
pipelineVersion change:                         1
review queue changes:                           0
candidate integrity changes:                    0
ICS report/event changes:                       0
```

이는 게시 의미 변경이 아니다. S24-A 전용 감사기는 trace 필드를 제외한 legacy
candidate projection을 strict 비교하고, 신규 trace 자체는 별도 계약으로 검증한다.
Policy.15 baseline 원본은 수정하지 않았다.

## 테스트

신규 집중 테스트 8개:

- adapter runtime wiring
- complete trace 생성
- metadata rule ID
- segment/mention/fact/semantic 연결 무결성
- candidate ID 및 게시 projection 보존
- decision segment summary 반영
- segment audit document 병합
- 누락·역전 접수기간 fail-closed

전체 결과:

```text
185 tests passed
```

## 다음 단계

S24-A는 완료했다. 다음 작업은 `S24-B ApplicabilityEvaluator extraction`이다.
S24-B에서는 board 716 특수 분기를 다시 추가하지 않고, 모든 candidate가 보유한
동일 계층형 trace를 입력으로 사용한다.
