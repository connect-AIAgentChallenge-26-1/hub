# 영수증 OCR 연결 준비

## 현재 완료된 범위

- 리뷰 작성 화면의 이미지 형식·10MB 용량 검사와 미리보기
- OCR 진행 단계를 보여 주는 상태 UI
- 상호명 정규화, 업체 일치, 결제일 30일 이내 검증 함수와 테스트
- 비공개 Supabase Storage 버킷과 OCR 처리 이력 컬럼 마이그레이션
- 이미지 해시와 승인번호 기반 중복 방지 DB 구조

외부 OCR API 호출과 실제 인증 완료 처리는 아직 연결하지 않는다. 따라서 현재 화면에서 선택한 이미지는 서버나 Storage에 업로드되지 않으며, 테스트 분석 결과도 인증 리뷰로 집계하지 않는다.

## 연결할 서버 흐름

1. `POST /api/receipts`가 로그인 사용자, 업체, 이미지 메타데이터를 확인한다.
2. 서버가 이미지 SHA-256 해시로 중복 여부를 먼저 검사한다.
3. 원본을 비공개 `receipt-images` 버킷의 `{userId}/{receiptId}` 경로에 저장한다.
4. 서버에서만 OCR 제공자 API를 호출한다.
5. OCR 응답을 공통 형식 `{ merchantName, paidAt, approvalNumber }`으로 변환한다.
6. `validateOcrReceipt`로 업체 일치와 결제일을 검증하고 승인번호는 해시로 저장한다.
7. 중복이 아니면 `receipts.status`를 `verified`로 바꾼다.
8. 인증된 `receipt_id`만 리뷰 등록 API가 받도록 한다.

## 예정 API 계약

### `POST /api/receipts`

- 인증: Supabase access token 필수
- 요청: `multipart/form-data`의 `place`, `image`
- 성공: `201 { receipt: { id, status: "pending" } }`
- 중복: `409 { code: "DUPLICATE_RECEIPT", message }`

### `GET /api/receipts/:id`

- 응답: `pending`, `verified`, `rejected` 중 하나
- `rejected`일 때 사용자에게 다시 촬영할 수 있는 짧은 사유를 제공한다.

### `POST /api/reviews`

- 요청: `{ placeId, receiptId, content }`
- 서버에서 영수증 소유자·업체·인증 상태를 다시 확인한다.

## 외부 API 연결 시 필요한 설정

`.env.local`의 서버 전용 영역에 `CLOVA_OCR_INVOKE_URL`, `CLOVA_OCR_SECRET_KEY`를 추가한다. `REACT_APP_` 접두사를 붙이지 않으며 브라우저 코드에서 읽지 않는다.
