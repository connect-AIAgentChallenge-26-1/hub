# AGENTS.md

대학생 소액 투자자를 위한 **근거 검증 Agent**의 범용 개발 지침. 안전 원칙과 제품 경계는 [CLAUDE.md](CLAUDE.md), 전체 범위는 [docs/plan.md](docs/plan.md), 스킬 계약은 [docs/skills.md](docs/skills.md), 완료 조건은 [docs/checklist.md](docs/checklist.md), 작업 순서는 [docs/backlog.md](docs/backlog.md)를 따른다.

## 제품 범위

기능 A~D, S1~S23, 감사 개선안 I1~I11, 인증·FastAPI·React UI·평가·배포·운영은 모두 최종 완료 범위다.

- A: 종목 공부
- B: 가치 범위·중립 가격 위치
- C: Structured Claim 기반 근거 검증
- D: 사용자 직접 입력 기반 개인 주문

단계는 의존 순서일 뿐 기능 포함 여부를 바꾸지 않는다. 작업이 차단되면 삭제하거나 “나중”으로 돌리지 말고 `BLOCKED`, 원인, 해제 조건을 기록한다.

## 절대 원칙

1. **추천 금지** — 목표가·매수·매도·관망·분할매수·보류 지시를 출력하지 않는다.
2. **환각 금지** — 원문에 없는 수치·사실·출처를 생성하지 않고 결측을 0으로 채우지 않는다.
3. **기준시점 필수** — 데이터에 `as_of`, 접수일, 대상 기간을 포함한다.
4. **출처 필수** — 수치·판정은 공식 원천으로 추적 가능해야 한다.
5. **결정론 우선** — 숫자·단위·기간·verdict 계산은 코드가 수행한다.
6. **정합성 강제** — 다른 기업·기간·단위·CFS/OFS·누적/단일 값을 섞지 않는다.
7. **보안·격리** — 사용자·문서 입력을 신뢰하지 않고 사용자별 데이터·secret을 격리한다.
8. **주문 분리** — 분석 결과에서 S12를 자동 호출하거나 가격·수량을 채우지 않는다.

## Source of Truth

1. `CLAUDE.md`: 안전·제품 경계
2. `docs/plan.md`: 전체 요구사항 R01~R15
3. `docs/skills.md`: S1~S23 typed 계약
4. `docs/checklist.md`: C0~C16 완료 조건
5. `docs/backlog.md`: T00~T15 순서·상태
6. 코드와 자동 테스트: 실제 구현 상태

감사 보고서와 보관 문서는 변경 근거이며 현재 범위를 직접 재정의하지 않는다.

## 작업 규칙

- 스킬 입력·출력·제약을 바꾸면 `docs/skills.md`를 먼저 수정한다.
- 제품 범위를 바꾸면 `docs/plan.md`, checklist, backlog, CLAUDE/AGENTS를 같은 변경에서 동기화한다.
- 모든 기능은 코드 + 정상/실패/공격 테스트 + 문서 + 로그·metrics가 있어야 완료다.
- provider 응답은 공식 문서와 immutable record/replay fixture로 검증한다.
- 데이터 없음, 지원 불가, 외부 장애와 구현 오류를 구분한다.
- raw 값과 정규화·파생 값을 분리하고 계산 공식·rule version을 남긴다.
- LLM 출력은 Structured Outputs와 S23 allowlist 검사를 통과해야 한다.
- 수치 판정을 LLM 자유 텍스트에 맡기지 않는다.
- auto-merge와 릴리스는 테스트·lint·type·security·I9 평가 gate를 모두 통과해야 한다.

## 작업 보고

- 모든 작업·리뷰 세션 종료 시 `docs/report/`에 보고를 남긴다. 구현 agent는 `claude.md`, 리뷰 agent는 `gpt.md`.
- 보고 파일은 **읽지 않는다**. `cat >> docs/report/<파일>.md` shell append로 하단에만 추가하고 기존 내용을 수정·삭제하지 않는다.
- 형식은 각 보고 파일 상단의 템플릿을 따른다 (날짜·Task·요약·검증 결과·미결 사항).

## 기술 아키텍처

- React + Vite frontend
- FastAPI + Pydantic backend
- 일반 Python deterministic core
- LangGraph conditional retrieval loop
- Upstage Solar(solar-pro3) Structured Outputs
- PostgreSQL + migration
- Chroma + metadata filtering
- OpenDART, 공식 시세·외부 근거 provider, 증권사 adapter
- pytest·lint·type check·security scan·CI
- 인증·권한·secrets·관측·backup/restore·rollback

LangGraph는 단순 계산 파이프라인을 감싸기 위해 쓰지 않는다. S8·S17~S20의 상태·재검색·반증 분기가 필요할 때만 사용한다.

## 기능 D 경계

- S12는 A/B/C와 분리된 guarded command 경로다.
- paper와 broker sandbox가 필수다.
- live adapter는 구현하되 기본 비활성·개인 전용이다.
- 공개·데모 build는 paper-only다.
- 사용자 직접 입력, 2단계 확인, idempotency, 한도, kill switch, reconciliation과 감사 로그가 필수다.
- 실제 live 활성화는 코드 완료와 별도의 법률·컴플라이언스·운영 승인 대상이다.

## 현재 상태

현재 실행 코드는 React 소개 페이지뿐이고 Backend·S1~S23은 미구현이다. 목표 문서에 적혔다는 이유로 구현 완료로 간주하지 않는다.

```bash
npm install
npm run dev
npm run build
npm run preview
```

Backend 명령은 T01에서 추가한다.
