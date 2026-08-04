# 오늘 할 일 — PDF 첨부파일 텍스트 추출을 pdfjs-dist로 전환 (이슈 #132)

> 작성일: 2026-08-04 (화) · 대상 이슈: [#132 PDF 첨부파일 텍스트 추출을 pdfjs-dist로 전환](https://github.com/syd348/hub/issues/132)

## 오늘의 목표 (한 줄)

**PDF 첨부파일을 base64로 통째로 Gemini에 넘기던 방식을, `hwpx.ts`처럼 로컬에서 먼저
텍스트를 추출해 `{type: 'text', text}` 경로로 전달하는 방식으로 바꾼다.**

## 현재 상태 (전환 전)

- `crawler/src/ai-enrichment.ts`(34~38행)가 `attachment.format === 'pdf'`면
  `{ type: 'pdf', base64: buffer.toString('base64') }`를 만들어 그대로
  `extractStructuredFields`에 넘긴다. HWPX만 `extractHwpxText`로 로컬 텍스트 추출을 거친다.
- `gemini-extract.ts`의 `buildContentParts`(108~113행)는 `document.type === 'pdf'`면
  `createPartFromBase64(base64, 'application/pdf')`로 멀티모달 파트를 만든다.
- 실측(이슈 본문, 2026-08-04): bizinfo PDF 샘플(`PBLN_000000000125087` /
  `FILE_000000000767590`, 5페이지)은 스캔 이미지가 아니라 글꼴 임베딩된 텍스트 PDF였고,
  `pdfjs-dist`의 `getTextContent()`로 완벽한 한글 텍스트 추출을 로컬 스파이크로 확인함.
- `crawler/src/hwpx.ts`가 참고 구조: zip/버퍼 → 텍스트 문자열 반환하는 순수 함수 +
  `hwpx.test.ts`에서 `fflate`로 최소 픽스처를 직접 만들어 테스트.

## 범위

### 포함 (오늘)
- `crawler` workspace에 `pdfjs-dist` 의존성 추가
- `crawler/src/pdf-text.ts`: PDF 버퍼 → 텍스트 추출 함수(`extractPdfText`) 작성
  - `pdfjs-dist`의 legacy(node) 빌드 사용 (worker 없이 동작하는 엔트리)
  - 페이지 순서대로 `getTextContent()` 결과를 이어붙임
- `crawler/src/pdf-text.test.ts`: `pdfjs-dist`로 생성 가능한 최소 PDF를 픽스처로 만들거나,
  알려진 최소 PDF 바이너리를 인라인으로 사용해 유닛 테스트
- `crawler/src/ai-enrichment.ts`: PDF attachment도 `extractPdfText`로 로컬 추출 후
  `{ type: 'text', text }`로 `extractStructuredFields`에 전달하도록 변경
- 텍스트 레이어가 없는(추출 결과 빈 문자열) PDF에 대한 폴백: 기존 `{type: 'pdf', base64}`
  경로로 graceful fallback (아래 리스크 표 참고 — 완전히 막히지 않게 하는 게 안전)
- `npm test` / `npm run lint` 통과 확인

### 제외 (오늘 아님)
- Gemini 호출 "횟수" 자체를 줄이는 것(무료 티어 하루 20건 한도) — 이슈 본문에 명시된 대로
  이 이슈의 범위가 아님. `docs/production-readiness-plan.md`의 별도 P1 항목.
- CLOVA OCR/HyperCLOVA X 등 대체 서비스 조사 — 이슈 본문의 "참고"일 뿐 이번 구현과 무관.
- `gemini-extract.ts`의 `{type: 'pdf', base64}` 경로 자체를 완전히 삭제하는 것 — 폴백 용도로
  유지(아래 리스크 표 참고).

## 실행 순서

### 묶음 1 — pdfjs-dist 의존성 추가 + 텍스트 추출 함수 + 테스트 (30분)
- [x] `npm install pdfjs-dist -w @hub/crawler`
- [x] `crawler/src/pdf-text.ts` 작성 (`extractPdfText(buffer: Buffer): Promise<string>`)
- [x] `crawler/src/pdf-text.test.ts` 작성 — 합성 PDF 픽스처(오프셋 직접 계산)로 텍스트 추출 검증 +
      텍스트 레이어 없는 PDF(빈 content stream)에서 빈 문자열 반환하는지 검증 (4개 테스트)

### 묶음 2 — ai-enrichment.ts 연결 + 폴백 처리 (20분)
- [x] `ai-enrichment.ts`에서 PDF도 `extractPdfText` 호출 → 결과 있으면 `{type:'text'}`,
      비어있으면 기존 `{type:'pdf', base64}`로 폴백
- [x] 관련 로그 메시지(폴백 발생 시 console.warn) 추가 — 텍스트 레이어 없음 케이스와
      추출 중 예외(손상된 PDF 등) 케이스 둘 다 base64로 폴백하도록 범위를 넓힘

### 묶음 3 — 검증 (20분)
- [x] `npm test` (204 passed)
- [x] `npm run lint` (oxlint 통과, 신규 warning 없음)
- [x] `npm run build -w @hub/crawler` / `-w @hub/server` (tsc 타입체크 통과)
- [x] 실제 bizinfo PDF 샘플 3건(이슈 본문의 `FILE_000000000767590` 포함)으로 수동 추출
      결과 확인 — 네트워크 접근 가능해 실제 API로 검증 완료, 세 건 모두 완전한 한글
      텍스트 추출 성공 (검증용 임시 스크립트는 확인 후 삭제, 커밋 대상 아님)

## 완료 기준

- [x] `pdfjs-dist` 추가, PDF 텍스트 추출 함수 + 테스트 작성
- [x] `ai-enrichment.ts`가 PDF도 텍스트로 변환해 Gemini에 전달
- [x] 텍스트 레이어 없는 PDF(스캔본) 케이스 처리 방침 결정 및 반영 (base64 폴백으로 결정,
      추출 중 예외 발생 케이스도 동일하게 폴백하도록 범위 확장)
- [x] `npm test` / `npm run lint` 통과
- [x] 실제 샘플 PDF 3건으로 추출 결과 검증 (네트워크 가능해 유닛 테스트 + 실제 API 검증 둘 다 수행)

## 리스크 / 결정 필요

| 항목 | 내용 | 기본 방침 |
|------|------|-----------|
| 스캔 이미지형 PDF 폴백 | `getTextContent()` 결과가 비어있으면(텍스트 레이어 없음) 완전히 처리 불가 상태가 되면 안 됨 | 추출 텍스트가 빈 문자열(공백 제거 후)이면 기존 `{type:'pdf', base64}` 경로로 폴백해 Gemini 멀티모달에 맡긴다. `gemini-extract.ts`의 `pdf` 경로는 삭제하지 않고 유지 |
| pdfjs-dist worker 설정 | 브라우저 기본 빌드는 Web Worker를 요구해 Node 환경에서 그대로 안 돌 수 있음 | `pdfjs-dist/legacy/build/pdf.mjs` 등 node 호환 엔트리 사용, 필요 시 `disableWorker`/`legacy` 옵션 확인 후 실제 동작 검증 |
| 실제 bizinfo PDF 샘플 검증 | worktree 환경에서 외부 네트워크로 bizinfo 다운로드가 가능한지 불확실 | 가능하면 실제 샘플로 검증, 안 되면 유닛 테스트(합성 PDF 픽스처)로 대체하고 PR에 한계를 명시 |

## 오늘 끝나면 다음 (참고)

- 없음 (이 이슈로 완결)
