# 잇다 (Itda) — 공강 기반 대학생 밥약 매칭 서비스

> 공강 시간을 자동으로 찾아 대학생들의 밥약(밥 약속)을 쉽게 매칭하는 웹 서비스

**배포 주소:**
- 🌐 **프론트엔드**: [https://hub-g4ih.vercel.app](https://hub-g4ih.vercel.app)
- 🔧 **백엔드 API**: [https://hub-o4vk.onrender.com](https://hub-o4vk.onrender.com)

---

## 🎯 프로젝트 소개

대학 생활에서 가장 큰 고민 중 하나는 "언제 만날까?"입니다. 각자의 시간표가 다르고, 공강 시간을 맞추는 것만 해도 오래 걸립니다.

**잇다**는 이 문제를 해결합니다:
1. **시간표 자동 동기화**: 구글 캘린더, 애플 캘린더, 에브리타임에서 자동으로 시간표를 불러옵니다
2. **공강 자동 계산**: 요일별 교시별로 공강을 자동 추출합니다
3. **밥약 매칭**: 공강이 겹치는 사람들을 찾아줍니다
4. **AI 맛집 추천**: 학교 근처 맛집을 검색하고 Gemini AI가 분위기에 맞는 가게를 추천합니다

---

## ✨ 주요 기능

### 📅 다중 캘린더 연동
- **구글 캘린더**: OAuth 로그인 후 자동 동기화
- **애플 캘린더**: Apple ID + 앱 암호를 통한 CalDAV 연결
- **에브리타임**: 공유 URL로 시간표 파싱

### 🔄 재동기화 버튼
시간표가 변경되면 로그인 없이 **재동기화 버튼**만 눌러서 즉시 반영합니다.

### 🍽️ 밥약 방 및 매칭
- 호스트가 방을 만들고 공강 시간을 선택
- 참여자가 참여하면 겹치는 공강 시간 자동 계산
- 약속 시간 확정 후 맛집 검색 및 추천

### 🤖 AI 기반 맛집 추천
- **Naver Search API**: 학교 반경 3km 내 식당 검색
- **Gemini AI**: 모임 성격에 맞는 가게 추천

### 💾 이메일 인증 & 프로필 저장
- 대학 이메일로 회원가입 후 인증
- 프로필 정보(대학/학과/학년/MBTI)를 localStorage에 저장
- 재로그인 시 온보딩 스킵

---

## 🏗️ 기술 스택

### 프론트엔드
```
React 19 + TypeScript + Tailwind CSS + Vite
- Firebase Authentication (Google OAuth)
- localStorage for persistent profile storage
- Deployed on Vercel
```

### 백엔드
```
Node.js + Express.js
- MongoDB Atlas (M0 Free tier) for persistence
- CalDAV (tsdav) for Apple Calendar
- node-ical for iCal parsing
- Cheerio for Everytime HTML scraping
- Axios for external API calls
- Deployed on Render (Free tier)
```

### 외부 API
- **Google Calendar API**: 구글 캘린더 이벤트 조회
- **Naver Search API**: 식당 검색
- **Gemini AI API**: 맛집 추천
- **Gmail API**: 이메일 인증

---

## 🚀 로컬 실행

### 사전 요구사항
- Node.js 16+ 및 npm
- MongoDB Atlas 계정 (무료 M0 클러스터)
- Google Cloud 프로젝트 (Firebase + Calendar API)
- Naver Search API 클라이언트 ID/Secret
- Gemini API Key

### 설치 및 실행

#### 백엔드
```bash
cd backend

# 환경 변수 설정
cat > .env << EOF
PORT=5050
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/itda
NAVER_CLIENT_ID=your_naver_id
NAVER_CLIENT_SECRET=your_naver_secret
GEMINI_API_KEY=your_gemini_key
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
EOF

# 설치 및 실행
npm install
npm start
```

#### 프론트엔드
```bash
cd frontend

# 환경 변수 설정
cat > .env.local << EOF
VITE_API_BASE=http://localhost:5050
EOF

# 설치 및 실행
npm install
npm run dev

# 브라우저에서 http://localhost:5173 접속
```

---

## 📦 배포

### 백엔드 (Render)
1. GitHub의 `Aiden-Park11` 브랜치 자동 감시
2. Push 시 자동 배포
3. 환경 변수: Render Dashboard의 Environment 탭에서 설정

**주의**: Render 무료 티어는 15분 미사용 시 슬립 모드 진입
→ UptimeRobot 모니터링 권장 (5분 주기로 핑 전송)

### 프론트엔드 (Vercel)
1. GitHub의 `main` 브랜치 자동 감시
2. Push 시 자동 배포
3. 환경 변수: Vercel Dashboard에서 설정
4. Root Directory: `/frontend`

---

## 🔧 아키텍처

```
┌─────────────────────────────────────┐
│      User Browser (Vercel)          │
│  https://hub-g4ih.vercel.app        │
│  - React + Firebase Auth             │
│  - Calendar sync UI                  │
│  - Room creation/join UI             │
│  - Restaurant search & AI reco       │
└────────────────┬────────────────────┘
                 │ (HTTP API)
                 ▼
┌─────────────────────────────────────┐
│     Express.js Backend (Render)     │
│  https://hub-o4vk.onrender.com      │
│  - /api/auth/* (Firebase)            │
│  - /api/schedule/sync/* (Calendar)   │
│  - /api/rooms/* (Room CRUD)          │
│  - /api/restaurants/* (Search+AI)    │
└────────┬────────────────────────────┘
         │
    ┌────┴─────────────────────────────┐
    ▼                                   ▼
┌──────────────────┐          ┌─────────────────┐
│  MongoDB Atlas   │          │  External APIs  │
│  - Users         │          │  - Google Cal   │
│  - Rooms         │          │  - Naver Search │
│  - Schedules     │          │  - Gemini AI    │
│  - Profiles      │          │  - Apple CalDAV │
└──────────────────┘          └─────────────────┘
```

---

## 🐛 주요 버그 수정 이력

### Timezone Bug (UTC vs KST)
- **증상**: 배포 후 공강 계산이 9시간 틀어짐
- **원인**: Render 서버가 UTC, 한국 시간표가 KST(UTC+9)
- **해결**: `calculateFreeSlots()`에서 모든 이벤트를 +9시간 오프셋으로 변환

### MongoDB Room Persistence
- **증상**: 서버 재시작 후 모든 방 데이터 소실
- **원인**: Room ID(base36)를 ObjectId로 억지 변환하면서 저장 실패
- **해결**: Room 스키마에 `roomId` 문자열 필드 추가, 이 필드로 쿼리

### Firebase OAuth Popup Blocked
- **증상**: 임베디드 브라우저에서 Google 로그인 불가
- **원인**: Google 정책상 웹뷰에서 OAuth 차단
- **해결**: signInWithRedirect + getRedirectResult 폴백 추가

---

## 📊 프로젝트 구조

```
hub/
├── frontend/                 # React + TypeScript 프론트엔드
│   ├── src/
│   │   ├── App.tsx          # 메인 앱 (1930+ 라인)
│   │   ├── firebase.ts      # Firebase 설정
│   │   └── index.css        # 글로벌 스타일
│   ├── public/
│   └── vite.config.ts
│
├── backend/                  # Express.js 백엔드
│   ├── server.js            # 메인 서버 (762 라인)
│   ├── models/
│   │   ├── User.js
│   │   ├── Room.js
│   │   └── Schedule.js
│   ├── package.json
│   └── render.yaml          # Render 배포 설정
│
├── README.md                # 이 파일
├── package.json             # 루트 패키지 (선택사항)
└── .env.example            # 환경 변수 템플릿
```

---

## 🔐 환경 변수 예시

### 백엔드 (.env)
```env
PORT=5050
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/itda
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
GEMINI_API_KEY=your_gemini_api_key
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
```

### 프론트엔드 (.env.local)
```env
VITE_API_BASE=http://localhost:5050
```

### Vercel 배포
```
VITE_API_BASE=https://hub-o4vk.onrender.com
```

---

## 📝 API 엔드포인트

### 인증
- `POST /api/auth/send-code` — 이메일 인증 코드 발송
- `POST /api/auth/verify-code` — 코드 검증

### 시간표 동기화
- `POST /api/schedule/sync/google` — 구글 캘린더 동기화
- `POST /api/schedule/sync/ical` — 애플 캘린더 동기화 (CalDAV)
- `POST /api/schedule/sync/everytime` — 에브리타임 시간표 파싱

### 밥약 방
- `POST /api/rooms` — 방 생성
- `GET /api/rooms/:id` — 방 조회
- `POST /api/rooms/:id/join` — 방 참여
- `POST /api/rooms/:id/confirm` — 약속 확정

### 식당 검색
- `GET /api/restaurants/search` — 네이버 검색 + Gemini 추천
- `POST /api/restaurants/recommend` — AI 기반 추천

---

## 🚀 배포 체크리스트

- [x] MongoDB Atlas 설정 (M0 Free tier, Seoul region)
- [x] Render 백엔드 배포 (Aiden-Park11 브랜치 자동 감시)
- [x] Vercel 프론트엔드 배포 (main 브랜치, /frontend root)
- [x] Firebase 설정 (Google 로그인, 승인 도메인)
- [x] Naver/Gemini API 키 등록
- [x] Timezone bug 수정
- [x] MongoDB 영속성 검증 (방 데이터 재시작 후에도 유지)
- [ ] UptimeRobot 모니터 설정 (선택사항)

---

## 📖 시연 시나리오

### 1단계: 로그인
- 이메일 인증 또는 구글 OAuth

### 2단계: 온보딩
- 대학, 학과, 학년, MBTI 입력
- 프로필 저장 (localStorage)

### 3단계: 시간표 동기화
- Everytime 공유 URL 입력
- 공강 시간 자동 계산 (재동기화 버튼 작동)

### 4단계: 방 생성 (호스트)
- 방 제목, 음식 카테고리 입력
- 공강 시간 선택

### 5단계: 방 참여 (참여자)
- 다른 계정으로 로그인
- 방 링크 접속
- 자신의 공강 시간 선택

### 6단계: 맛집 추천
- "약속 시간 확정" 클릭
- 음식 카테고리로 식당 검색
- Gemini AI 추천 확인

### 7단계: 약속 확정
- 식당 선택
- 최종 약속 정보 저장 (MongoDB)

---

## 💡 기술 학습 포인트

### AI Agent와의 협업
- 이 프로젝트는 Claude Code와 함께 개발되었습니다
- AI가 코드 작성, 배포 설정, 버그 디버깅, 외부 API 연동을 담당
- 인간은 요구사항 정의와 실사용 검증 담당

### 타임존 관리
- UTC 기반 서버와 로컬 타임존의 불일치 문제 해결
- `new Date().getHours()` vs 타임존 변환 활용

### 캘린더 프로토콜
- CalDAV를 통한 Apple Calendar 연동
- 공개 iCal 형식 파싱 (node-ical, cheerio)

### 데이터베이스 설계
- MongoDB의 관계형 데이터 모델 (ref, populate)
- 무료 클러스터의 장단점 (슬립 모드, 저장소 512MB 제한)

---

## 📞 연락처 & 피드백

이 프로젝트에 대한 질문이나 버그 리포트는 GitHub Issues에서 받습니다.

---

**마지막 업데이트**: 2026-07-22  
**라이선스**: MIT
