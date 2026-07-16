# 진행상황 일지

## Day 9 (7/16)

- 완료: 계획·검증 서브에이전트를 실행 가능한 형태로 전환(`.claude/agents/task-planner.md`, `feature-verifier.md` — docs/agents/의 산문 설계를 frontmatter+시스템 프롬프트로 변환, 검증용은 Edit/Write 제외로 읽기 전용), feature-verifier로 2주차 수직슬라이스 11개 체크리스트 실검증(curl 실호출 + npm test 4/4 — 전 항목 통과, 근거 포함 보고서), 수직슬라이스 재확인(health/checkins 조회 정상), 루트 handoff-context.md 구버전 표시

- 다음: 새 세션에서 feature-verifier가 에이전트 목록에 뜨는지 확인 후 직접 호출해보기. Supabase env 누락·연결 실패 케이스는 코드상 안전하지만 실동작 미검증(⚠️) — 시간 나면 재현. 검증 중 생긴 `[검증테스트]` 행 1건은 삭제 기능(Week 3) 만들 때 지우기

- 막힌 것/배울 것: 서브에이전트 = 직무기술서(md 파일)를 넘겨 spawn하는 워커 — 세션 시작 시 로드되므로 만든 직후엔 인식 안 됨(이번엔 general-purpose에 지침을 읽혀 대체 실행). 검증 에이전트에 도구를 읽기 전용으로만 주는 이유: 검증자가 코드를 고치기 시작하면 심판이 선수를 겸하게 됨

## Day 8 (7/15)

- 완료: 결과 카드·기록 카드 컴포넌트 분리(SummaryCard/RecordCard, formatDate는 utils로), 기록 상세 화면(pages/RecordDetail — screen state에 'detail' 추가, selectedCheckin으로 전달), 화면·데이터 흐름도(docs/screen-flow.md), 데이터 모델 초안(docs/data-model.md — 논의 후 확정), 백로그 Week 2 갱신

- 다음: 데이터 모델 논의 포인트 확정(태그 컬럼 vs 테이블, user_id not null 시점) 후 schema.sql 반영, 2주차 데모 준비. 미룬 것: 기록 삭제, 감정 태그 선택, 주간 모아보기 (Week 3)

- 막힌 것/배울 것: 조건부 렌더링이 화면 2개(삼항)에서 3개가 되면서 `&&` 나열 방식으로 바꾼 이유, 클릭 이벤트를 자식(RecordCard)에서 부모(App)로 올리는 패턴(onSelect) 복습

## Day 3 (7/8)

- 완료: 사용자 시나리오 3개로 구체화(기본/수정/재정리 흐름), 화면구조 설계(S1 입력/S2 결과, 와이어프레임), 프로토타입 제작(docs/prototype.html — 입력→로딩→결과카드3장→저장), 벤치마킹(무디/마인디/Reflectly/Daylio), 프로토타입 비주얼 개선(저녁 그라데이션 배경, 카드 뒤집기 인터랙션), 문제정의 근거 보강(대교협 2025.9·통계청 2024 사망원인통계), 이론적 근거 절 추가(Lieberman 2007 affect labeling, Pennebaker 1986~ expressive writing), 위키(기획서/벤치마킹) 정리

- 다음: 동료 피드백 받기, 체크리스트 3~4번(AI 실제 연동, 결과 수정·저장) 착수, 루카스 폼 제출

- 막힌 것/배울 것: 예전에 정리해둔 리서치 자료 중 존재하지 않는 학술 인용(fabricated citation)을 발견해서 웹서칭으로 재검증 — 로컬 자료를 그대로 믿지 말고 직접 검증하는 습관 필요. 위키가 로컬 레포와 별도 git 저장소라는 것도 이번에 알게 됨

## Day 2 (7/7)

- 완료: 주제 확정(하루 체크아웃), docs/plan.md 기획서, README 정비, docs/intro.html 소개 페이지, 환경 점검(.gitignore/node_modules/dev서버), Vite+React 학습 노트 정리

- 다음: 프로토타입 첫 화면 (입력창 + 정리하기 버튼 + 카드 3장, 목데이터) — plan.md 체크리스트 1~2번

- 막힌 것/배울 것: 입력창/버튼/결과 카드 컴포넌트 분리, React 상태 관리

## Day 1 (7/6)

- 완료: Fork/clone/브랜치(N114_유승혁), Vite+React 세팅, ProjectIntro 컴포넌트, 첫 PR

- 시행착오: Agent 경로 오류로 중첩 폴더 스캐폴딩 → 복구
