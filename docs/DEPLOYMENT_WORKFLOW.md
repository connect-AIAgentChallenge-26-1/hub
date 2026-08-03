# Later 배포 및 검증 워크플로

## 현재 운영 배포

- Production: <https://later-theta-fawn.vercel.app>
- 구성: Vercel Next.js UI + Vercel Serverless Express API + Supabase + Gemini
- 상태 확인: `GET /api/health` → `{ "status": "ok" }`

기존 Render 분리안은 현재 운영 구조가 아닙니다. `render.yaml`은 별도 Express 서버로
이전할 때 사용할 수 있는 선택 자산이며, 운영 서비스는 same-origin `/api`를 사용합니다.

## 배포 전 품질 게이트

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
git diff --check
git status --short
```

현재 저장소는 ESLint 설정 파일이 없어 `npm run lint`가 초기 설정 질문을 표시합니다.
자동화 게이트에 lint를 넣기 전에 비대화형 구성을 커밋합니다.

## Vercel 환경변수

| 변수 | 용도 |
| --- | --- |
| `SUPABASE_URL` | 서버의 Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 DB·Storage 권한 |
| `SUPABASE_STORAGE_BUCKET` | 기본값 `later-images` |
| `GEMINI_API_KEY` | Gemini API 인증 |
| `GEMINI_MODEL` | 사용할 Gemini 모델 |
| `NEXT_PUBLIC_API_BASE_URL` | 별도 API 서버 사용 시에만 설정 |

비밀 값은 GitHub, 문서, 빌드 로그와 `NEXT_PUBLIC_*`에 노출하지 않습니다. Node.js 버전은
`package.json`의 `engines`를 기준으로 합니다.

## Supabase 준비

다음 migration을 순서대로 적용하고 `items` 테이블과 `later-images` bucket을 확인합니다.

```text
202607230001_add_item_images.sql
202607230002_add_item_summary.sql
202607260001_add_item_archive.sql
```

운영 DB에는 자동 테스트 데이터를 넣거나 전체 삭제·truncate를 실행하지 않습니다.

## Production 배포

```bash
npx vercel --prod --yes
```

배포 결과의 `readyState=READY`, production alias와 빌드 성공을 확인합니다. Git 연동이
자동 배포를 시작하지 않는 경우에도 `main` 반영 여부와 실제 Vercel deployment를 별도로
확인해야 합니다.

## 배포 후 smoke test

1. 홈, 카테고리, 아카이브가 모바일·데스크톱에서 열립니다.
2. `/api/health`가 `200`입니다.
3. 명확한 테스트 텍스트를 저장하고 제목·핵심 요약·분류를 확인합니다.
4. 공개 URL을 저장하고 출처 아이콘·사이트명·원문 링크를 확인합니다.
5. 테스트 이미지를 저장하고 Storage URL과 화면 표시를 확인합니다.
6. 아카이브 후 해당 화면에서 상세를 펼치고 복원합니다.
7. 만든 테스트 항목 ID만 삭제합니다.

실제 Instagram·YouTube 결과를 점검할 때는 “메타데이터를 가져옴”과 “영상 원문을
분석함”을 구분합니다. 플랫폼이 영상 데이터를 제공하지 않으면 캡션 수준 결과임을
검증 기록에 남깁니다.

## 쇼케이스 제출

- `showcase/showcase.json`의 링크와 구현 범위를 확인합니다.
- `showcase/thumbnail.webp`와 스크린샷 11개가 존재하는지 검사합니다.
- 리마인더처럼 미구현 기능은 로드맵으로 명시합니다.
- 중앙 쇼케이스는 PR이 병합된 뒤 central `main`이 배포되어야 갱신됩니다.

## 롤백

애플리케이션은 Vercel에서 직전 정상 deployment를 Promote합니다. DB 변경은 자동
rollback하지 않고 백업과 영향 범위를 확인한 뒤 별도 보정 migration으로 복구합니다.

## 최신 검증 기록

2026-08-02 KST 기준 production 배포는 `READY`이며 홈과 same-origin API가 함께
배포되었습니다. 최신 변경에는 구체적 핵심 요약 지침, URL Context와 플랫폼별 회색
출처 아이콘 UI가 포함됩니다.
