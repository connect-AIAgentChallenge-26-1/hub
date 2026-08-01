// API 클라이언트 — 서버 REST 엔드포인트 호출.
// 모든 응답은 서버 컨벤션대로 { data, error } 로 고정 래핑되어 그대로 반환한다.

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000'

// Render 무료 플랜은 슬립 상태에서 깨어나는 데 최대 1분 정도 걸릴 수 있어
// 넉넉히 90초로 잡는다 (콜드 스타트를 정상 실패로 오인하지 않도록).
const REQUEST_TIMEOUT_MS = 90000

async function request(path, options) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...options,
    })
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return { data: null, error: '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요' }
    }
    return { data: null, error: '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요' }
  }

  const body = await res.json().catch(() => ({ data: null, error: '응답을 읽을 수 없어요' }))
  return body
}

// POST /api/letters — 모임 생성(초대장 작성)
export function createLetter(payload) {
  return request('/api/letters', { method: 'POST', body: JSON.stringify(payload) })
}

// GET /api/letters/:token — 공유 링크로 모임 조회
export function getLetterByToken(token) {
  return request(`/api/letters/${token}`)
}

// POST /api/letters/:token/responses — 참여자 응답(이름·가능 시간대) 저장
export function createResponse(token, payload) {
  return request(`/api/letters/${token}/responses`, { method: 'POST', body: JSON.stringify(payload) })
}

// GET /api/letters/:token/responses — 참여자 응답 목록 조회
export function getResponses(token) {
  return request(`/api/letters/${token}/responses`)
}

// PATCH /api/letters/:token/close-responses — 참여자 응답 마감
export function closeResponses(token) {
  return request(`/api/letters/${token}/close-responses`, { method: 'PATCH' })
}

// GET /api/letters/:token/roles — 역할 목록 조회
export function getRoles(token) {
  return request(`/api/letters/${token}/roles`)
}

// POST /api/letters/:token/roles — 역할 생성
export function createRole(token, payload) {
  return request(`/api/letters/${token}/roles`, { method: 'POST', body: JSON.stringify(payload) })
}

// PATCH /api/letters/:token/roles/:roleId — 역할에 참여자 배정(또는 필드 수정)
export function updateRole(token, roleId, payload) {
  return request(`/api/letters/${token}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

// GET /api/letters/:token/roles/:roleId/tasks — 역할의 업무 목록 조회
export function getRoleTasks(token, roleId) {
  return request(`/api/letters/${token}/roles/${roleId}/tasks`)
}

// POST /api/letters/:token/roles/:roleId/tasks — 업무 일괄/단건 생성
export function createRoleTasks(token, roleId, labels) {
  return request(`/api/letters/${token}/roles/${roleId}/tasks`, { method: 'POST', body: JSON.stringify({ labels }) })
}

// PATCH /api/letters/:token/roles/:roleId/tasks/:taskId — 업무 완료 토글·수정
export function updateRoleTask(token, roleId, taskId, payload) {
  return request(`/api/letters/${token}/roles/${roleId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

// DELETE /api/letters/:token/roles/:roleId/tasks/:taskId — 업무 삭제
export function deleteRoleTask(token, roleId, taskId) {
  return request(`/api/letters/${token}/roles/${roleId}/tasks/${taskId}`, { method: 'DELETE' })
}

// PATCH /api/letters/:token/confirm — 시간·장소 확정 저장
export function confirmLetter(token, payload) {
  return request(`/api/letters/${token}/confirm`, { method: 'PATCH', body: JSON.stringify(payload) })
}

// POST /api/letters/:token/suggest — 시간·장소·역할 추천
export function getSuggestions(token) {
  return request(`/api/letters/${token}/suggest`, { method: 'POST' })
}

// POST /api/letters/:token/harvest-reviews — 결산 평가 제출(재제출 시 갱신)
export function createHarvestReview(token, payload) {
  return request(`/api/letters/${token}/harvest-reviews`, { method: 'POST', body: JSON.stringify(payload) })
}

// GET /api/letters/:token/harvest-reviews — 결산 평가 목록 조회
export function getHarvestReviews(token) {
  return request(`/api/letters/${token}/harvest-reviews`)
}

// POST /api/letters/:token/expenses — 지출 항목 추가
export function createExpense(token, payload) {
  return request(`/api/letters/${token}/expenses`, { method: 'POST', body: JSON.stringify(payload) })
}

// GET /api/letters/:token/expenses — 지출 항목 목록 조회
export function getExpenses(token) {
  return request(`/api/letters/${token}/expenses`)
}
