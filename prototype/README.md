# 🍚 밥약 매칭 서비스 — 프로토타입

> **"언제 볼까 + 어디서 볼까"를 한 번에** — 대학생 친구들의 캘린더를 모아 모두가 비는 시간을 자동으로 찾고, 그 시간에 맞는 맛집까지 추천하는 서비스

## 📄 프로젝트 문서

| 문서 | 링크 |
|---|---|
| 📋 기획서 | [온라인](https://aiden-park11.github.io/naver-ai-challenge/%EA%B8%B0%ED%9A%8D%EC%84%9C_%EB%B0%A5%EC%95%BD%EB%A7%A4%EC%B9%AD%EC%84%9C%EB%B9%84%EC%8A%A4.html) · [../docs/](../docs/기획서_밥약매칭서비스.html) |
| 🎨 웹 디자인 시안 | [온라인](https://aiden-park11.github.io/naver-ai-challenge/%EB%94%94%EC%9E%90%EC%9D%B8%EC%8B%9C%EC%95%88_%EB%B0%A5%EC%95%BD%EC%9B%B9.html) · [../docs/](../docs/디자인시안_밥약웹.html) |
| 🖥 발표자료 | [../docs/발표자료_밥약.html](../docs/발표자료_밥약.html) |

## ✅ 진행 상황

- [x] **1주차** — 회원가입/로그인 (이메일 + 구글 OAuth), ERD 기반 DB 스키마
- [x] **2주차** — 캘린더 3종 연동 (실계정 검증 완료)
  - 구글: OAuth 로그인과 캘린더 읽기 권한을 한 플로우로 통합
  - 에브리타임: 시간표 공유 링크 파싱 → 주간 시간표를 2주 일정으로 확장
  - 애플: iCloud CalDAV (Apple ID + 앱 암호)
- [ ] **3주차** — 밥약 모임 생성 + 참여자 초대 + 공통 공강 시간 자동 계산
- [ ] **4주차** — 네이버/카카오 맛집 추천 (+ AI 선별·추천 이유 생성) + UI 다듬기

## 🛠 기술 스택

| 영역 | 스택 |
|---|---|
| 백엔드 | Python · FastAPI · SQLAlchemy · Alembic · PostgreSQL |
| 프론트엔드 | React · TypeScript · Vite |
| 외부 연동 | Google Calendar API (OAuth 2.0) · 에브리타임 시간표 · iCloud CalDAV |

## 🚀 로컬 실행

```bash
# 1. PostgreSQL 준비 후 backend/.env 작성 (.env.example 참고)

# 2. 백엔드
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload   # http://localhost:8000

# 3. 프론트엔드
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

구글 로그인을 사용하려면 [../docs/구글_OAuth_설정가이드.md](../docs/구글_OAuth_설정가이드.md)를 따라 OAuth 클라이언트 ID를 발급받아 `backend/.env`에 넣어주세요.
