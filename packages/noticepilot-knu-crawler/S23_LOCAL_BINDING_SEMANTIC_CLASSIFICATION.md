# S23 — Local Binding and Semantic Classification

## 목적

S23은 Policy.15 후보 생성 과정에서 날짜와 구조 단위의 관계, 일정의 의미 판정을 독립 레이어로 분리한다.

```text
ScheduleSegment
+ TemporalMention
→ BoundTemporalFact
→ SemanticClassification
```

기존 applicability, publishability, reconciliation 결과는 변경하지 않는다.

## 신규 컴포넌트

### `noticepilot_local_binder.py`

입력:

- `sourceNoticeId`
- S22 `ScheduleSegment`
- S21 `TemporalMention`

출력:

- S21 `BoundTemporalFact`

지원 binding 종류:

```text
same_segment
same_table_row
continuation_owner
same_list_item
same_paragraph
title_context
unresolved
```

`title_context`와 `unresolved`는 locally grounded로 승격할 수 없다.

### `noticepilot_semantic_classifier.py`

입력:

- `BoundTemporalFact`
- 구조 segment
- 결정적 date resolution
- Policy.15 lexical configuration

출력:

- `eventType`
- `actionType[]`
- `temporalRole`
- semantic confidence
- rule ID
- action-label grounding 결과

## temporalRole

S23부터 실제 런타임 후보에 다음 값이 기록된다.

```text
user_action_period
event_occurrence
result_announcement
reference_date
internal_process
conditional_followup
unknown
```

S23에서는 이 값을 감사 및 후속 레이어 입력으로 사용한다. 기존 publishability 정책을 temporalRole 기반으로 교체하는 작업은 S24 범위다.

## Candidate 확장 필드

기존 candidate ID, 이벤트 의미, 피드 결과는 유지하면서 다음 감사 필드를 추가한다.

```json
{
  "temporalRole": "user_action_period",
  "temporalMention": {},
  "boundTemporalFact": {},
  "semanticClassification": {}
}
```

Policy.15 baseline comparator는 기존 의미 projection을 엄격히 유지하며, 위 신규 감사 필드는 별도 S23 테스트에서 검증한다.

## 런타임 경계

S23 이후 candidate extraction은 다음 함수를 직접 조합하지 않는다.

```text
classify_event_type
refine_event_type
infer_academic_action_types
```

대신 `SEMANTIC_CLASSIFIER` facade를 호출한다. Policy.15 lexical regex와 rule은 baseline 보존을 위해 composition root에서 주입된다.

## 감사 CLI

```bash
python3 tools/export_s23_layer_documents.py \
  --input normalized-notice.json \
  --output /tmp/notice.s23-layers.json
```

산출물:

- `segments`
- `temporalMentions`
- `boundTemporalFacts`
- `semanticClassifications`
- temporalRole 통계

포함하지 않는 값:

- applicability verdict
- publishability verdict
- feed inclusion
- reconciliation 결과

## 완료 조건

- LocalBinder와 SemanticClassifier가 실제 런타임 composition root에 연결
- publishable 후보에 S23 감사 필드 생성
- 기존 Policy.15 semantic projection 변화 없음
- 기존 테스트 및 신규 S23 테스트 통과
- 독립 ZIP 해제 후 동일 검증 통과
