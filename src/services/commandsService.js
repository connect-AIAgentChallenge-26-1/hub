// searchService.js와 같은 fetch 패턴 — 네트워크 실패/응답 실패를 구분해서 에러 메시지를 던지고,
// 호출부(CategoryHomePage/CommandDetailPage)는 이 함수들이 BE를 거쳐 Supabase에서 가져온다는
// 사실을 몰라도 되게 만드는 창구.
// 배포 환경에선 BE 주소가 localhost가 아니므로, 빌드 시점에 주입되는 환경변수로 오버라이드
// 가능하게 한다(VITE_ 접두사는 Vite가 클라이언트 번들에 노출하는 규칙). 값이 없으면(로컬 개발)
// 기존처럼 localhost:4000으로 fallback.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// 경로 문자열을 호출부에 흩어놓지 않고 한 곳에 모아둔다 — BE 라우트가 바뀌어도
// 이 한 줄만 고치면 되게 하기 위함(피드백 시간에 나온 지적).
const COMMANDS_PATH = '/api/commands';

async function requestJson(path) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`);
    } catch {
        throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
    }

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error('요청 중 서버에서 오류가 발생했습니다.');
    }

    return response.json();
}

// GET /api/commands — 전체 명령어 목록 (CategoryHomePage의 카테고리별 개수 계산에 씀)
export async function fetchCommands() {
    const data = await requestJson(COMMANDS_PATH);
    // 목록 조회는 fetchCommandById와 달리 "존재하지 않는 id"라는 개념이 없어서, 404(=data가 null)는
    // 정상적인 케이스가 아니라 라우팅/배포 설정 문제 같은 진짜 오류다. 여기서 안 걸러내면 아래
    // data.results가 null.results로 터져서 사용자에게 내부 JS 에러 메시지가 그대로 노출된다.
    if (!data) {
        throw new Error('요청 중 서버에서 오류가 발생했습니다.');
    }
    return data.results;
}

// GET /api/commands/:id — 명령어 하나 상세 조회. 존재하지 않는 id면 404이고,
// 이 경우 에러를 던지지 않고 null을 돌려줘서 CommandDetailPage가 "찾을 수 없음" 화면을
// 지금처럼(에러가 아니라 정상적인 분기로) 처리할 수 있게 한다.
export async function fetchCommandById(id) {
    return requestJson(`${COMMANDS_PATH}/${id}`);
}
