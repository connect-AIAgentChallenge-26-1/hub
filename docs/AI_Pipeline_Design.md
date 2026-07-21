# AI_Pipeline_Design.md — 간이 MBTI 추정 채팅 파이프라인 (ADR-008)

> 상태: **설계 + 1차 구현.** 백엔드 프록시(`POST /api/mbti-chat`)와 클라이언트 래퍼(`backend/src/lib/llm.js`)가 구현됐다. 이 문서는 프롬프트·입출력 스키마·단계·안전장치를 못박아 재현 가능하게 한다. 근거: [decisions.md ADR-008](./decisions.md), [llm-agent-plan.md](./llm-agent-plan.md) §3~5.

## 0. 목적과 경계

설문이 딱딱해 자기 유형을 못 고르는 사용자를 위해, 외부 LLM(Gemini)과 **동의 후 짧게(≈2회)** 대화해 MBTI 4글자를 **간이 추정**하고, 그 값을 기존 `matchMethods(mbti)`에 넣어 공부법을 매칭한다.

- **공식 판정 아님(P-B).** 결과는 "탐색적 간이 추정"으로 라벨하고 MBTI 한계 고지를 함께 둔다.
- **원문 전송은 이 경로에만** 허용(동의 사용자). 연구/분석 저장 경로(ADR-001 화이트리스트)는 여전히 **비식별 파생값만** — 대화 원문은 어디에도 저장하지 않는다.

## 1. 전체 흐름

```
프론트 채팅 UI (동의 필수)
   │  messages[] (대화 원문, 이 경로 한정)
   ▼
backend  POST /api/mbti-chat   ── consent 검증 · 키 없으면 available:false
   │
   ▼
backend/src/lib/llm.js  estimateMbtiFromChat(messages)
   │  Gemini generateContent (responseSchema JSON 강제, 모델 폴백 체인)
   ▼
서버측 출력 검증(validateEstimate): mbti ∈ 16유형, disallowed_check=true
   │  { mbti, confidence, rationale, uncertainty }  (원문 미저장)
   ▼
프론트: setMbti(추정값) + mbtiSource="ai-estimated" → 기존 matchMethods 파이프라인(불변)
```

## 2. 단계별 계약

### 1단계 — 분류 (대화 → 유형 추정)
- **입력:** `messages: [{ role: "user"|"assistant", text: string }]` (최대 12개, 각 1000자 절단).
- **처리:** 시스템 지시로 "간이 추정·비진단·가능성 언어"를 강제. `temperature=0.4`.
- **출력(JSON 강제, `responseSchema`):**
  ```json
  {
    "mbti": "INTJ 또는 \"\"(불명확)",
    "confidence": "low | mid",
    "rationale": "대화에서 관찰된 근거 1~2문장(가능성 표현)",
    "uncertainty": "한계·주의 1문장",
    "disallowed_check": true
  }
  ```
- **불명확 처리:** 근거 부족·확신 낮음이면 `mbti=""`, `confidence="low"` → 규칙 설문으로 유도.

### 2단계 — 검증·라벨 (추정 → 신뢰 사용)
- **서버측 재검증(`validateEstimate`):** `mbti`가 16유형 집합에 없으면 `null`. `disallowed_check !== true`면 폐기(폴백).
- **라벨:** UI는 항상 "간이 추정 · 공식 판정 아님"과 MBTI 한계 고지를 함께 노출한다(신뢰 패널 #27과 시너지).
- **다운스트림 불변:** 검증된 4글자는 기존 `matchMethods(mbti)`에 그대로 주입 — 매칭 로직은 바꾸지 않는다.

## 3. 안전장치 (ADR-008 유지 조항 → 코드 대응)

| 조항 | 코드 위치 |
|---|---|
| 키는 backend `.env`만, 프론트 직접 호출 금지 | `llm.js` `process.env.GEMINI_API_KEY`, 프론트는 `/api/mbti-chat`만 호출 |
| 실패·타임아웃 시 규칙 폴백 | `estimateMbtiFromChat` → `null`; 라우트 → `mbti:null`/`available:false` |
| 429/503 유한 폴백(무한루프 차단) | `MODEL_CHAIN` 고정 배열 단일 패스 + `withTimeout` |
| 연구 저장 경로 분리(원문 미저장) | 라우트가 store 를 호출하지 않음; 응답에도 원문 미포함 |
| 진단·성적예측·유형 우열 금지 | 시스템 지시 + `disallowed_check` 검증 |

## 4. 폴백·롤백

- `GEMINI_API_KEY` 미설정 → 채팅 비활성(`available:false`), 규칙 설문만 동작. 앱 흐름 유지.
- 모델 전부 429/503 이거나 계약 위반 → `fallback:true` → 프론트가 "지금은 추정이 어렵다, 설문으로 진행" 안내.

## 5. 열린 항목 (구현 시 확정)

- **모델 ID:** `MODEL_CHAIN`은 Gemini 공식 문서로 확정/조정(현재 `gemini-2.5-flash` → `gemini-2.0-flash`).
- **eval 셋:** 대화 예시 → 기대 추정/불명확 쌍 몇 개로 회귀 확인(과확신·환각 검출).
- **비용·지연 로깅·호출 상한**(llm-agent-plan §5-7).
- 제공자 교체(ChatGPT): `llm.js` 함수 경계만 바꾸면 되도록 유지.
