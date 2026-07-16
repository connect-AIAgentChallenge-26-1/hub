# 개발 환경 결정

## 현재 상태

- 현재 저장소는 Create React App 기반 React 프로젝트다.
- `package.json` 기준 TypeScript와 Express는 아직 도입되지 않았다.
- `checklist.md`에는 Next.js 언급이 있으나, 마스터클래스 기준 개발 환경은 React + Express다.

## 기본 결정

- 1주차: 문서, 디자인 시스템, 화면 설계, 데이터/API 설계를 고정한다.
- 2주차 구현 시작 전: CRA 유지 또는 Vite + React + TypeScript 전환 여부를 결정한다.
- 백엔드는 Express 서버를 별도 폴더로 둔다.
- 데이터베이스는 Supabase(Postgres)를 우선 후보로 둔다.

## 권장 폴더 구조

```txt
hub/
  docs/
    design-system.md
    dev-setup.md
    skills/
  src/
    app/
    components/
    features/
      map/
      places/
      reviews/
      receipts/
    lib/
    styles/
  server/
    src/
      routes/
      services/
      db/
      utils/
  supabase/
    migrations/
```

현재 CRA 구조에서는 `src/` 안에서 위 기능 폴더를 점진적으로 만든다. Express를 추가할 때 `server/`를 생성한다.

## 프론트엔드 후보 라이브러리

- 지도: 네이버지도 JavaScript API
- 상태: 초기에는 React state와 context만 사용
- 라우팅: `react-router-dom`
- 폼: 초기에는 제어 컴포넌트로 시작, 복잡해지면 `react-hook-form` 검토
- 검증: 프론트/백 공통 스키마가 필요해지면 `zod` 검토
- UI: 외부 UI 라이브러리는 사용하지 않고 디자인 시스템 CSS로 시작

## 백엔드 후보 라이브러리

- API 서버: Express
- 환경 변수: `dotenv`
- CORS: `cors`
- 업로드: `multer`
- DB 클라이언트: `@supabase/supabase-js`
- OCR 연동: CLOVA OCR HTTP API

## 환경 변수 초안

```env
REACT_APP_NAVER_MAP_CLIENT_ID=
REACT_APP_NAVER_MAP_NCP_KEY_ID=
REACT_APP_API_BASE_URL=http://localhost:4000
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=

PORT=4000
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CLOVA_OCR_INVOKE_URL=
CLOVA_OCR_SECRET_KEY=
```

CRA에서는 브라우저에 노출되는 값에 `REACT_APP_` 접두사가 필요하다. 서버 전용 비밀키는 프론트엔드에 두지 않는다.
네이버 지역 검색 `Client Secret`은 브라우저에 노출하지 않고 `server.mjs` 프록시 서버에서만 사용한다.

## 데이터 모델 초안

- `places`: 업체 기본 정보, 위치, 업종, 외부 지도 ID
- `reviews`: 업체 ID, 작성자 ID, 별점, 내용, 인증 상태, 작성일
- `receipts`: 리뷰 ID, 이미지 해시, 승인번호, 결제일, OCR 결과
- `review_likes`: 리뷰 ID, 사용자 ID, 생성일
- `place_rating_snapshots`: 업체별 가중 별점 집계 결과

## API 초안

- `GET /api/places?bbox=...`: 지도 범위 내 업체 조회
- `GET /api/naver/local?query=...`: 네이버 지역 검색 프록시
- `GET /api/places/search?q=...`: 업체명/업종 검색
- `GET /api/places/:placeId`: 업체 상세
- `GET /api/places/:placeId/reviews?tab=positive|critical&sort=helpful`: 리뷰 조회
- `POST /api/places/:placeId/receipts/verify`: 영수증 OCR 검증
- `POST /api/places/:placeId/reviews`: 인증 통과 후 리뷰 작성
- `POST /api/reviews/:reviewId/like`: 리뷰 좋아요

## 구현 전 결정할 것

- CRA 유지 vs Vite + TypeScript 전환
- 네이버지도 API 사용 범위와 과금/쿼터
- 공공데이터 상가 정보 수집 방식
- Supabase Auth 사용 여부
- OCR 실패 시 UX와 재시도 제한

## 테스트 기준

- 가중 별점 계산은 단위 테스트를 먼저 작성한다.
- OCR 검증 로직은 성공/실패/중복 케이스를 분리한다.
- 리뷰 탭 필터링은 4~5점, 1~3점 경계를 테스트한다.
- 네이버지도형 업체 상세 UI는 실제 지도 API 연결 전에도 목업 데이터로 먼저 검증한다.
