# API 문서

모든 엔드포인트는 `/api/letters` 아래에 마운트되어 있습니다. 모든 응답은 `{ data, error }` 형태로 고정 래핑됩니다(성공 시 `error: null`, 실패 시 `data: null`).

`/api/letters` 하위 쓰기 요청은 IP당 60초에 30회로 제한됩니다.

## 모임(Letter)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/letters` | 모임(초대장) 생성 |
| GET | `/api/letters/:token` | 공유 링크 토큰으로 모임 조회 |
| PATCH | `/api/letters/:token/close-responses` | 참여자 응답 마감 처리 |
| PATCH | `/api/letters/:token/confirm` | 시간·장소 확정 저장 |

## 참여자 응답(Responses)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/letters/:token/responses` | 참여자 응답(이름·가능 시간대·선호 장소·성향) 제출 |
| GET | `/api/letters/:token/responses` | 참여자 응답 목록 조회 |

## 역할(Roles)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/letters/:token/roles` | 역할 목록 조회 |
| POST | `/api/letters/:token/roles` | 역할 생성(참여자가 직접 추가) |
| PATCH | `/api/letters/:token/roles/:roleId` | 역할에 참여자 배정 또는 필드 수정 |

## 역할별 업무(Role Tasks / 체크리스트)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/letters/:token/roles/:roleId/tasks` | 역할의 업무(체크리스트) 목록 조회 |
| POST | `/api/letters/:token/roles/:roleId/tasks` | 업무 생성(단건 또는 일괄) |
| PATCH | `/api/letters/:token/roles/:roleId/tasks/:taskId` | 업무 완료 토글 또는 수정 |
| DELETE | `/api/letters/:token/roles/:roleId/tasks/:taskId` | 업무 삭제 |

## AI 추천(Suggest)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/letters/:token/suggest` | Groq LLM 기반 시간·장소·역할 배정 추천 (호출 시에만 실행, 응답 없으면 미호출, 실패 시 폴백+10초 타임아웃) |

## 결산(Harvest Review)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/letters/:token/harvest-reviews` | 결산 리뷰 생성 또는 수정 |
| GET | `/api/letters/:token/harvest-reviews` | 결산 리뷰 목록 조회 |

## 정산(Expenses)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/letters/:token/expenses` | 지출 항목 등록 |
| GET | `/api/letters/:token/expenses` | 지출 목록 및 정산(분배) 결과 조회 |

## 공유 미리보기(Share)

| Method | Path | 설명 |
|---|---|---|
| GET | `/share/:token` | 메신저(카카오톡 등) 크롤러용 정적 미리보기 HTML. `{ data, error }` 래핑의 유일한 예외 — og 태그가 채워진 HTML을 직접 반환한다. 사람이 열면 즉시 `/scr0/join?token=...`으로 리다이렉트된다. |

---

요청/응답 필드의 구체적인 스키마는 각 컨트롤러(`server/src/controllers/`)를 참고하세요. 이 문서는 엔드포인트 목록과 역할을 기준으로 정리했습니다.
