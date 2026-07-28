# 에이전트 상호작용 API

## 엔드포인트

```http
POST /api/agent-interactions
Content-Type: application/json
```

기능 플래그 `AGENT_INTERACTIONS_ENABLED=true`일 때만 마운트됩니다.

## 요청

```json
{
  "browserBindingId": "44c96b3d-c657-4a41-876b-a26b53178f59",
  "clientRequestId": "5d8afe40-bdb7-4d9d-9118-c7b43174cd0e",
  "message": {
    "text": "이전 작업의 다음 단계를 계속해줘."
  },
  "sensoryObservations": []
}
```

- `browserBindingId`: 브라우저별 에이전트 인스턴스 UUID
- `clientRequestId`: 멱등 처리를 위한 요청 UUID
- `message.text`: 1~1,000자의 요청
- `sensoryObservations`: 최대 6개의 제한 관찰값, 생략 시 빈 배열

클라이언트는 내부 상태, 상태 변화량, 선택 행동, 응답 문장, 원본 이미지·영상·음성을
보낼 수 없습니다.

## 성공 응답

신규 저장은 `201`, 같은 요청 ID의 재생은 `200`입니다.

```json
{
  "success": true,
  "data": {
    "interaction": {
      "id": "87e6bf42-523e-45ef-93ad-2046a4f493bd",
      "agentId": "fced6a86-e668-4184-96bb-102fb925ab35",
      "sequenceNumber": 1,
      "requestId": "5d8afe40-bdb7-4d9d-9118-c7b43174cd0e",
      "userMessage": "이전 작업의 다음 단계를 계속해줘.",
      "response": {
        "actionType": "continue_task",
        "text": "요청한 작업을 이어서 처리할게."
      },
      "createdAt": "2026-07-28T00:00:00.000Z"
    }
  },
  "meta": {
    "replayed": false
  }
}
```

내부 상태 벡터와 판단 추적은 공개 응답에서 제외됩니다.

## 오류

- `400 VALIDATION_ERROR`: 요청 계약 위반
- `409 STATE_VERSION_CONFLICT`: 제한된 재계산 후에도 상태 버전 충돌
- `429 RATE_LIMIT_EXCEEDED`: 요청 횟수 초과
- `502 AGENT_REPOSITORY_FAILED`: 저장소 작업 실패
- `503 SUPABASE_NOT_CONFIGURED`: 서버 DB 설정 누락
