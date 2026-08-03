# UniBoard - 대학생 기회 큐레이션 대시보드

## 📌 프로젝트 소개

대학생의 전공, 학년, 거주지역, 소득분위를 기반으로 맞춤형 공모전·대외활동·정책 정보를 자동으로 큐레이션하고 추천하는 통합 대시보드입니다.

**핵심 기능:**
- 🎯 **맞춤형 필터링**: 프로필 기반 관련성 높은 공고만 추천
- 📅 **통합 캘린더**: 공모전 마감일과 개인 일정을 한눈에 관리
- 🤖 **AI 기반 요약**: Ollama LLM으로 GitHub 저장소의 README를 한국어 요약
- 🔔 **스크랩 & 알림**: 관심 공고를 저장하고 마감 N일 전 알림 수신
- 📂 **카테고리 관리**: 공모전, 대외활동, 정책/지원금, 교내행사 분류

---

## 🚀 로컬 실행 방법

### 필수 설치
- Node.js 18+ (프론트엔드, 백엔드)
- Python 3.9+ (크롤러)
- PostgreSQL 또는 Supabase 계정
- Ollama (LLM 기반 요약 기능 사용 시)

### 실행 단계
```bash
# 1. 저장소 클론
git clone https://github.com/Playedwell03/hubb.git
cd hubb

# 2. 환경 변수 설정
# backend/.env, frontend/.env, crawler/.env 파일 생성 (예시는 .env.example 참고)

# 3. 프론트엔드 실행
cd frontend
npm install
npm run dev

# 4. 백엔드 실행 (새 터미널)
cd backend
npm install
npx prisma migrate dev
npm run dev

# 5. 크롤러 실행 (새 터미널, 선택사항)
cd crawler
pip install -r requirements.txt
python main.py
```

---

## 🛠️ 기술 스택

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: Zustand
- **Form & Validation**: React Hook Form + Zod
- **Calendar**: FullCalendar.js
- **API Client**: React Query
- **Router**: React Router
- **Authentication**: Supabase Auth

### Backend
- **Runtime**: Node.js + Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Validation**: Zod
- **Database**: PostgreSQL (Supabase)
- **Authentication**: JWT
- **Scheduling**: node-cron
- **Task Scheduler**: cron-based background jobs

### Crawler & Data Processing
- **Language**: Python 3.9+
- **Web Scraping**: BeautifulSoup, Playwright
- **Database**: Prisma ORM (Python client)

### LLM & AI
- **Local LLM**: Ollama (Qwen2.5 7B)
- **Alternative Providers**: Claude, OpenAI, LlamaCPP (환경 변수로 선택)

### Deployment
- **Frontend**: Vercel
- **Backend**: Render
- **Database**: Supabase
- **Version Control**: GitHub

---

## 👤 작성자

**곽호영** (Playedwell03)
- GitHub: [@Playedwell03](https://github.com/Playedwell03)
- Email: khy05300@gmail.com

---

## 📸 스크린샷 & 데모

**Live Demo**: [https://hub-213-8f4f.vercel.app](https://hub-213-8f4f.vercel.app)

**Demo Video**: [YouTube](https://youtu.be/51_ouUXHfVA)

---

## 📄 라이선스

MIT License

---

## 📚 문서

- [프로젝트 계획](docs/plan.md)
- [개발 체크리스트](docs/checklist.md)
- [디자인 시스템](docs/design.md)
