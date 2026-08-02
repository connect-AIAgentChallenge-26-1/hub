# Later API

운영 환경에서는 Next.js의 `pages/api/[...path].ts`가 Express 앱을 같은 Vercel
origin에서 실행합니다. 로컬 분리 실행 시 기본 API 주소는 `http://localhost:4000`입니다.

## 공통 응답

항목 응답에는 다음 필드가 포함됩니다.

```ts
type Item = {
  id: number;
  title: string | null;
  summary: string | null;
  content: string | null;
  original_url: string | null;
  image_url: string | null;
  source_platform: string | null;
  category_main: string | null;
  category_sub: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
};
```

오류 응답은 `{ "error": "사용자에게 표시할 메시지" }` 형식입니다.

## 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/health` | `{ "status": "ok" }` 반환 |
| `GET` | `/api/items?archived=true|false` | 보관 상태별 최신순 항목 조회 |
| `POST` | `/api/items` | 텍스트·URL·이미지 분석 및 저장 |
| `PATCH` | `/api/items/:id` | 제목 수정 |
| `PATCH` | `/api/items/:id/archive` | 아카이브 또는 복원 |
| `DELETE` | `/api/items/:id` | 항목과 연결된 Storage 이미지 삭제 |

### 항목 저장

텍스트와 URL은 JSON으로 전송합니다.

```http
POST /api/items
Content-Type: application/json

{"content":"https://example.com/article"}
```

이미지는 `multipart/form-data`의 `image` 필드로 전송하며, 선택적인 설명은 `content`
필드에 넣습니다. 지원 형식은 JPEG·PNG·WebP, 최대 크기는 5MB입니다.

저장 과정은 출처 판별 → 안전한 메타데이터 추출 → Gemini 핵심 요약·분류 → 응답 검증
→ 이미지 Storage 업로드 → DB insert 순서입니다. Gemini가 실패하면 규칙 기반 제목·분류와
안전한 요약 fallback을 사용합니다.

### 아카이브

```http
PATCH /api/items/54/archive
Content-Type: application/json

{"archived":true}
```

`archived=false`이면 복원합니다. 취소·복원 결과는 갱신된 전체 `Item`입니다.

## 상태 코드

| 코드 | 의미 |
| --- | --- |
| `200` | 조회·수정·아카이브·삭제 성공 |
| `201` | 저장 성공 |
| `400` | 빈 입력, 잘못된 ID·본문·아카이브 값 |
| `404` | 대상 항목 없음 |
| `413` | 이미지 5MB 초과 |
| `415` | 지원하지 않는 이미지 MIME type |
| `500` | Supabase, Storage 또는 서버 설정 오류 |

현재 API에는 사용자 인증과 사용자별 데이터 격리가 없습니다. 공개 다중 사용자 서비스로
확장하기 전 인증, 소유권 컬럼, RLS 정책을 반드시 추가해야 합니다.
