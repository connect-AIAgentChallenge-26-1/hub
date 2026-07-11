# 구글 OAuth 클라이언트 ID 설정 가이드

구글 로그인 + 캘린더 연동을 실제로 동작시키려면 Google Cloud Console에서 OAuth 클라이언트를 만들어
`backend/.env`에 넣어야 합니다. 한 번만 하면 됩니다. (약 10분 소요)

## 1. 프로젝트 만들기

1. https://console.cloud.google.com 접속 → 구글 계정으로 로그인
2. 상단 프로젝트 선택 드롭다운 → **새 프로젝트** → 이름 예: `bapyak` → 만들기

## 2. Calendar API 활성화

1. 왼쪽 메뉴 **API 및 서비스 → 라이브러리**
2. "Google Calendar API" 검색 → 선택 → **사용** 클릭

## 3. OAuth 동의 화면 구성

1. **API 및 서비스 → OAuth 동의 화면**
2. User Type: **외부(External)** 선택 → 만들기
3. 앱 이름(예: 밥약), 사용자 지원 이메일, 개발자 이메일만 채우고 저장
4. 범위(Scopes) 단계: **범위 추가 또는 삭제** →
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/calendar.readonly` (Calendar API 활성화 후 목록에 보임)
5. **테스트 사용자** 단계: 본인 구글 계정 이메일 추가
   - 테스트 사용자로 등록된 계정만 로그인 가능하지만, 구글 심사 없이 바로 쓸 수 있습니다.

## 4. OAuth 클라이언트 ID 만들기

1. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
2. 애플리케이션 유형: **웹 애플리케이션**
3. 승인된 리디렉션 URI에 추가:
   ```
   http://localhost:8000/auth/google/callback
   ```
4. 만들기 → **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 복사

## 5. backend/.env에 붙여넣기

```
GOOGLE_CLIENT_ID=복사한_클라이언트_ID
GOOGLE_CLIENT_SECRET=복사한_클라이언트_시크릿
```

저장 후 백엔드 서버를 재시작하면 로그인/회원가입 화면의 "Google로 계속하기" 버튼이 동작합니다.

## 동작 흐름 (참고)

1. 버튼 클릭 → `GET /auth/google/login` → 구글 동의 화면으로 리다이렉트
   (로그인 + 캘린더 읽기 권한을 한 번에 요청)
2. 동의 완료 → `GET /auth/google/callback` → 유저 생성/연결 + 캘린더 토큰 저장 → 프론트로 리다이렉트
3. 홈 화면에서 **지금 동기화** → 앞으로 2주간의 구글 캘린더 일정을 가져와 DB에 저장
