# CLAUDE.md — 밥약 매칭 서비스

Claude Code가 이 프로젝트에서 작업할 때 항상 참고해야 하는 컨텍스트 문서입니다.

## 프로젝트 개요
대학생 4명 정도가 각자 캘린더(에타/구글/애플)를 연결하면 공강 시간을 자동으로 찾아주고,
위치 + 음식 카테고리 입력 시 네이버/카카오 기반 맛집을 추천해주는 서비스.
자세한 기획은 `docs/기획서_완성본_밥약매칭서비스.md` 참고.

## 기술 스택

| 구분 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | React (Vite) | 순수 React, 필요 시 최소 라이브러리만 추가 |
| 백엔드 | Python + FastAPI | (미션 기본값인 Express 대신, 멘토 확인받고 선택) |
| DB | PostgreSQL | 로컬 Homebrew 설치 사용 |
| ORM | SQLAlchemy | Alembic으로 마이그레이션 관리 |
| 인증 | 이메일/비밀번호 + 구글 OAuth 2.0 | 구글은 로그인+캘린더 권한 동시 획득 |

## 디렉토리 구조

```
hub/
├── frontend/                # React (Vite) 앱
│   ├── src/
│   │   ├── components/      # 재사용 컴포넌트
│   │   ├── pages/           # 화면 단위 페이지
│   │   ├── api/             # 백엔드 API 호출 함수 모음
│   │   └── styles/          # 디자인시스템_문서_v2.md 기준 전역 스타일/토큰
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 진입점
│   │   ├── routers/         # 기능별 API 라우터 (auth, calendar, meetups, restaurants)
│   │   ├── models/          # SQLAlchemy 모델 (ERD 기준)
│   │   ├── schemas/         # Pydantic 스키마 (요청/응답 검증)
│   │   ├── services/        # 외부 API 연동 로직 (구글/에타/네이버/카카오)
│   │   └── core/            # 설정, DB 연결, 보안(암호화) 유틸
│   ├── alembic/              # DB 마이그레이션
│   ├── requirements.txt
│   └── .env                  # 환경변수 (커밋 금지)
└── docs/
    ├── 기획서_완성본_밥약매칭서비스.md
    ├── 디자인시스템_문서_v2.md
    └── 디자인_skill.md
```

## 라이브러리 (조사 결과)

**백엔드**
- `fastapi`, `uvicorn` — 서버
- `sqlalchemy`, `alembic` — ORM/마이그레이션
- `psycopg2-binary` — PostgreSQL 드라이버
- `python-dotenv` — 환경변수
- `authlib` 또는 `google-auth-oauthlib` — 구글 OAuth
- `icalendar` — 에타/애플 webcal 파싱
- `httpx` — 네이버/카카오 API 호출
- `passlib[bcrypt]` — 비밀번호 해싱
- `cryptography` — OAuth 토큰/앱 암호 암호화 저장

**프론트엔드**
- React (Vite 템플릿 기본)
- 추가 라이브러리는 필요할 때만 최소로 추가 (불필요한 UI 라이브러리 지양)

## 컨벤션

**코드 스타일**
- Python: PEP8, 함수/변수는 snake_case
- React: 컴포넌트는 PascalCase, 파일명은 컴포넌트명과 동일

**API 응답 규칙**
- 성공: `{ "data": ... }`
- 실패: `{ "error": { "message": "...", "code": "..." } }` (원본 에러 메시지 그대로 노출 금지)

## 개발 전 추가로 정한 것

- **환경변수 관리**: `.env`는 절대 커밋하지 않고 `.env.example`만 커밋해 필요한 키 목록만 공유
- **에러 로그**: 개발 중에는 콘솔에 상세 로그, 사용자에게는 항상 친절한 메시지로 변환해서 응답
- **테스트**: 이번 4주 프로젝트에서는 별도 테스트 코드 작성은 생략하고, 기능 동작 확인 위주로 진행 (시간 우선순위상)

## 디자인 원칙 (요약)
자세한 내용은 `docs/디자인시스템_문서_v2.md` 참고. 요약하면:
- 크림톤 배경(`--bg-warm`) + 오렌지(`--primary`) 포인트 하나로 강조 통일
- 네이버/카카오 관련 요소는 각 브랜드의 실제 컬러(초록/노랑) 사용
- 참여자 아바타는 고정 팔레트 순서로 배정해 항상 같은 사람은 같은 색

## 작업 시 참고 순서
1. `docs/기획서_완성본_밥약매칭서비스.md` — 무엇을 만드는지
2. 이 문서(`CLAUDE.md`) — 어떻게 만드는지 (스택, 구조, 컨벤션)
3. `docs/디자인시스템_문서_v2.md` — 어떻게 보이게 만드는지
