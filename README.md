# CareerSignal

CareerSignal은 여러 채용공고의 반복 요구를 통계로 정리하고, 직무 공통 기대치와 기업군·개별 공고의 추가 요구를 해석해 취업 준비 전략으로 연결하는 대학생 진로탐색 리서치 에이전트입니다.

사용자는 `통계 분석 → 채용공고 해석 → 합격 전략 → 준비 로드맵` 순서로 요구 수준과 근거를 확인하고, 체크리스트의 미보유 항목을 채우는 프로젝트·학습 순서를 받습니다. 일반 화면은 미리 생성·검증한 분석 결과를 조회하며, 에이전트는 데이터 갱신과 사용자 공고 직접 입력 때 실행합니다.

## 데모

- [서비스](https://careersignal-iota.vercel.app): React 화면은 Vercel, Express API는 Render, 저장소는 Supabase에 둡니다.
- [정적 프로토타입](https://careersignal-prototype.vercel.app/): 화면 구성만 담은 HTML/CSS 배포입니다.
- 목표 직무는 아홉 종입니다. 현재 아홉 직무 화면이 조회하는 분석 산출물은 모두 `dataset_version = ds_demo_v1`로 구분한 생성 데이터이며, 백엔드 실 공고 44건은 같은 분석 경로가 실제 자료에서 동작하는지 검증한 표본입니다.
- 최종 서비스는 출처와 이용 조건을 확인한 실제 자료를 직무별로 축적하고, 정기 갱신과 사용자 공고 직접 입력 때 배포된 에이전트를 실행합니다. 생성 데이터는 이 실행 경로와 화면 계약을 먼저 완성하기 위한 단계입니다.

## 핵심 구조

- 화면: 직무 선택, 통계 분석, 채용공고 해석, 합격 전략, 준비 로드맵
- 분석 범위: 직무 전체, 기업군, 개별 공고, 사용자가 직접 입력한 공고
- 실행 계층: 오케스트레이터, 여섯 도메인 에이전트, 결정적 helper 파이프라인
- 오케스트레이션: `careersignal.orchestration`이 실행 순서·상태 공유·재시도를 직접 정의([ADR 0016](docs/adr/0016-no-orchestration-framework.md))
- 실행 방식: 데이터 갱신 시 에이전트가 분석 결과를 생성하고 검증을 통과한 버전만 활성화
- 요구 분류: 직무별 요구 차원을 자료에서 발견하고 검증·승격한 뒤 결정적으로 집계
- 일반 조회: React가 Express를 통해 활성 분석 버전을 조회
- 체크 상태: 준비 현황과 프로젝트 로드맵·학습 전략만 규칙으로 재조합
- 검색 구조: 키워드·벡터 검색의 순위 융합과 지식 그래프 탐색
- 근거 추적: 모든 주장이 원문 청크까지 이어지는 계보를 가짐

전체 구조와 흐름은 [아키텍처](docs/architecture.md), 에이전트의 입출력과 내부 루프는 [에이전트 설계](docs/agent-design.md), 데이터 계층과 저장 구조는 [지식·저장 구조](docs/knowledge-schema.md)에서 확인할 수 있습니다.

## 프로젝트 구조

```text
hub/
  prototype/       HTML/CSS 정적 프로토타입
  project-intro/   프로젝트 소개용 독립 React 앱
  product/         실제 서비스 React 앱(다섯 화면과 공고 직접 분석 패널)
  server/          product 전용 Express API
  agent/           Python·FastAPI 에이전트 서비스와 데이터베이스 마이그레이션
  docs/            기획·아키텍처·데이터·에이전트·디자인 문서
```

`agent/src/careersignal/`는 API·계약·도메인·오케스트레이션·도메인 에이전트 여섯 종·파이프라인·검색·검증·분류체계·그래프·Wiki·지표·저장소·모델 제공자·평가·계측으로 나뉩니다. 내부 구조와 경계는 [AGENTS.md](AGENTS.md)에 있습니다.

각 디렉터리는 독립 실행 환경이며 코드와 `node_modules`를 공유하지 않습니다.

## 기술 스택

- Frontend: React, Vite
- Backend: Express, Supabase JS 클라이언트
- Agent: Python, FastAPI, Uvicorn, Pydantic, SQLAlchemy, Alembic, httpx
- Database: Supabase Postgres, pgvector
- LLM: OpenAI API(생성·임베딩), 교차 모델 검사용 NVIDIA Build API
- 배포: Vercel(React), Render(Express), Supabase(저장소)

FastAPI 서비스 정의는 `server/render.yaml`에 있습니다. 화면 조회와 체크 상태 재조합, 캐시가
적중하는 공고 입력은 Express만으로 끝나며, FastAPI는 캐시가 없는 공고의 온디맨드 분석과
`/api/extract`에 쓰입니다. 경로별 의존은 [server/README.md](server/README.md)에 있습니다.

## 로컬 실행

PowerShell에서는 실행 정책 충돌을 피하기 위해 `npm.cmd`를 사용합니다.

### 실제 제품 화면

```powershell
cd product
npm install
npm.cmd run dev
```

Vite 개발 서버는 `/api` 요청을 `http://localhost:4000`의 Express로 전달합니다.

### Express 서버

`server/.env`에 Supabase 접속 정보와 에이전트 주소를 설정합니다. 생성 모델 키는 Express가 보유하지 않습니다.

```powershell
cd server
npm install
npm.cmd start
```

### FastAPI 에이전트 서비스

`agent/.env`에 Supabase 접속 정보와 생성 모델 키를 설정합니다.

```powershell
cd agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

데이터베이스 스키마의 기준은 `agent/migrations/`입니다.

`server/`나 `agent/` 코드를 변경하면 해당 프로세스를 재시작합니다.

## 검증

```powershell
cd product
npm.cmd run lint
npm.cmd run build
```

Express의 조회·정규화·재조합 규칙은 vitest로 검증합니다. 시험은 데이터베이스에 접속하지 않습니다.

```powershell
cd server
npm.cmd test
```

`GET /api/stats?job=backend`는 활성 분석 버전에 저장된 `statistics` payload를 돌려줍니다. 화면 조회 경로가 저장된 산출물을 읽는 근거는 [ADR 0013](docs/adr/0013-serving-stored-analysis-outputs.md)에 있습니다.

## 문서

각 문서는 하나의 주제에 대한 기준 문서입니다. 다른 문서는 같은 내용을 반복하지 않고 기준 문서를 링크합니다.

- [기획서](docs/plan.md): 문제·사용자·핵심 기능·화면 흐름
- [아키텍처](docs/architecture.md): 실행 계층·구성요소 경계·버전 활성화·계측
- [에이전트 설계](docs/agent-design.md): 공통 루프·도구·검증·신뢰도·종료
- [지식·저장 구조](docs/knowledge-schema.md): 데이터 계층·테이블·지식 그래프·Wiki
- [ERD](docs/erd.md): 컬럼 타입·기본키·외래키·인덱스·제약
- [온톨로지](docs/ontology-v1.md): 그래프 노드·엣지 유형·엣지별 필수 근거
- [통계 모델](docs/statistics-model.md): 요구 차원 발견과 승격·화면 블록 연결
- [지표 명세](docs/metric-spec.md): 지표 수식·결측 처리·불확실성·정책 버전
- [권한 매트릭스](docs/permission-matrix.md): 구성요소별 읽기·쓰기 범위와 강제 수단
- [데이터 전략](docs/data-strategy.md): 자료 계층·출처·허용 용도·평가 세트
- [디자인 컨셉](docs/design-concept.md): 화면 구조와 정보 위계
- [디자인 토큰](docs/design-tokens.md): 색상·레이아웃·컴포넌트 규칙
- [개발 백로그](docs/backlog.md): 개발 순서·이니셔티브·완료 조건
- [검증 체크리스트](docs/checklist.md): 활성화·배포·최종 결과물 수용 기준
- [결정 기록](docs/adr/): 주요 설계 결정의 맥락과 근거
- [평가 세트](docs/eval/): 파일 목록·정답 구조·루브릭 정책
- [GitHub Projects](https://github.com/users/joo-hyun/projects/2): Issue 실행 상태와 일정

구성요소별 문서는 각 디렉터리에 있습니다.

- [server/README.md](server/README.md): `/api/*` 경로별 FastAPI 의존, 재조합, 배포·교차 출처 설정
- [product/README.md](product/README.md): 화면 파일 구성과 API 주소·배포 설정
- [agent/data/demo_seed/CONTRACT.md](agent/data/demo_seed/CONTRACT.md): 생성 데이터의 식별자·테이블·응답 형태 규약

## 개발 범위

목표 직무는 아홉 종(backend, frontend, fullstack, mobile, data_engineer, ai_engineer, devops, security, game_client)입니다. 백엔드 직무는 실제 채용공고로 파이프라인을 검증한 범위이며, 데이터·화면·에이전트 계약은 직무 식별자를 입력으로 사용해 나머지 직무를 같은 구조로 다룹니다. 세부 진행 상태는 [개발 백로그](docs/backlog.md)를 따릅니다.
