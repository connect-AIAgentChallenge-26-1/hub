# Later 서비스 아키텍처

## 운영 구조

Later 운영 환경은 하나의 Vercel 프로젝트에서 Next.js UI와 Express API를 함께
제공합니다. `pages/api/[...path].ts`가 `server/index.ts`의 Express 앱을 serverless
function으로 연결하고, 서버만 Supabase service-role key와 Gemini key를 사용합니다.

```mermaid
flowchart LR
  U[브라우저·PWA] --> UI[Next.js App Router]
  UI --> API[/api Next.js API Route]
  API --> E[Express]
  E --> META[Metadata Extractor]
  META --> WEB[외부 웹·SNS]
  E --> GEM[Gemini URL Context·Vision]
  GEM --> VAL[JSON Schema·런타임 검증]
  VAL -. 실패 .-> RULE[Rule-based fallback]
  E --> DB[(Supabase items)]
  E --> ST[(Supabase Storage)]
```

로컬에서는 `npm run dev`와 `npm run dev:server`를 분리해 실행할 수 있습니다.
`NEXT_PUBLIC_API_BASE_URL`이 없으면 production은 same-origin, development는
`http://localhost:4000`을 사용합니다.

## 저장 파이프라인

1. `POST /api/items`가 JSON 또는 multipart 입력을 검증합니다.
2. URL이면 hostname으로 YouTube·Instagram·X·Naver·web 출처를 판별합니다.
3. 메타데이터 수집기가 HTTP/HTTPS, DNS, 사설 IP, redirect, timeout, 최대 응답 크기와
   Content-Type을 검증합니다. YouTube는 oEmbed와 공개 설명을 별도로 시도합니다.
4. Gemini에 원본 텍스트, URL Context, 메타데이터와 선택적인 이미지 inline data를
   전달합니다.
5. Gemini는 한국어 제목, 실제 핵심을 담은 짧은 요약, 대·소분류를 Structured Output으로
   반환합니다. “무엇을 소개하는 콘텐츠” 같은 일반 소개문 대신 결론·방법·주의점을
   우선하도록 지시합니다.
6. 허용 카테고리, 필드, 길이와 한국어 조건을 런타임에서 다시 검사합니다.
7. 실패하면 도메인·키워드 규칙과 안전한 제목·요약 fallback을 사용합니다.
8. 이미지는 Storage, 분석 결과와 URL은 `items` 테이블에 저장합니다.

## 원문 확보 한계

URL Context와 HTML 메타데이터는 플랫폼이 공개한 범위만 읽을 수 있습니다. 실제 점검
결과 공개 Instagram Reel 페이지는 제목·캡션·대표 이미지는 제공했지만 `og:video`나
영상 URL은 제공하지 않았습니다. 따라서 해당 유형의 결과는 영상 장면 분석이 아니라
캡션 기반 분석입니다. 비공개 페이지, 로그인 우회와 크롤링 제한 회피는 지원하지 않습니다.

## 조회와 UI

- 홈: 저장과 결과 확인
- 카테고리: 대·소분류 집계, 검색, 카드 상세, 아카이브
- 아카이브: 날짜순 목록, 상세 요약, 복원·삭제
- `SourceLabel`: YouTube·Instagram·X 아이콘, Naver 및 일반 도메인명, 직접 저장 표시
- `BottomNav`: 홈·카테고리·아카이브 이동, 빨간 활성 표시

목록은 `GET /api/items?archived=true|false` 결과를 클라이언트에서 검색·집계합니다.

## 데이터 모델

핵심 `items` 필드는 `id`, `title`, `summary`, `content`, `original_url`, `image_url`,
`source_platform`, `category_main`, `category_sub`, `is_archived`, `archived_at`,
`created_at`입니다. 현재 사용자 소유권 필드가 없으므로 단일 데모 데이터셋을 전제로
합니다.

## 장애 처리

| 장애 | 동작 |
| --- | --- |
| 메타데이터 실패 | 원본 URL만으로 Gemini를 계속 시도 |
| Gemini 미설정·오류·검증 실패 | 규칙 기반 fallback |
| 분류 단서 없음 | `미분류 / null` |
| Storage 업로드 실패 | 업로드한 object를 정리하고 오류 반환 |
| DB 저장 실패 | 업로드한 이미지가 있으면 정리하고 `500` 반환 |
| API 연결 실패 | 사용자에게 연결 오류 표시 |

## 보안 경계

- service-role key와 Gemini key는 서버 전용입니다.
- URL 요청은 SSRF 방어를 적용합니다.
- 이미지 형식과 5MB 제한을 서버와 클라이언트에서 확인합니다.
- AI 출력은 신뢰하지 않고 구조와 허용값을 검증합니다.
- 인증·RLS가 없으므로 현재 API를 다중 사용자 공개 서비스로 간주하면 안 됩니다.

## 주요 코드

| 영역 | 파일 |
| --- | --- |
| 홈·카테고리·아카이브 | `app/page.tsx`, `app/categories/page.tsx`, `app/archive/page.tsx` |
| 카드·출처 표시 | `app/ItemCard.tsx`, `app/SwipeActionCard.tsx`, `app/SourceLabel.tsx` |
| Vercel API bridge | `pages/api/[...path].ts` |
| Express CRUD | `server/index.ts` |
| 메타데이터·SSRF 방어 | `server/metadata.ts` |
| Gemini·검증·fallback | `server/geminiClassification.ts` |
| 규칙 분류 | `server/classification.ts` |
