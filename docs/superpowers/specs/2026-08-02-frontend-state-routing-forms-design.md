# 프론트엔드 상태, 라우팅과 폼 아키텍처 설계

## 배경

현재 앱은 서버에서 읽은 인사이트와 카테고리 목록을 `useInsightWorkspace`, `useCategoryWorkspace`가 직접 관리한다. 두 Hook은 로딩 상태, 가장 늦게 시작한 요청 판정, 변경 중 잠금, 성공 결과 병합과 재조회를 모두 구현한다. 이 방식은 동작하지만 서버 상태 정책이 Hook마다 반복되고 캐시 갱신과 무효화 기준을 한눈에 파악하기 어렵다.

`AuthenticatedWorkspace`는 화면 전환, 검색 조건, 꺼내보기 입력, 저장 후속 흐름과 다이얼로그 상태를 함께 관리한다. 화면 전환은 URL이 아닌 `activeTab`에 의존하므로 새로고침, 브라우저 뒤로 가기와 특정 화면 딥링크를 지원하지 않는다. 저장과 카테고리 폼은 입력, 검증, 서버 오류와 제출 상태를 개별 `useState`로 조합한다.

Zustand, TanStack Query, React Router, React Hook Form, Zod와 resolver는 이미 설치되어 있지만 실제 코드에는 연결되지 않았다. 이 설계는 라이브러리를 사용했다는 흔적을 만드는 것이 아니라 현재 책임을 더 명확한 경계로 옮기는 것을 목표로 한다.

## 목표

- 인사이트와 카테고리 서버 상태를 TanStack Query로 표준화한다.
- 화면 이동 뒤에도 유지할 가치가 있는 클라이언트 UI 상태만 Zustand가 관리한다.
- 주요 화면을 URL에 연결해 새로고침, 뒤로 가기와 딥링크를 지원한다.
- 저장 및 카테고리 폼의 입력과 검증을 React Hook Form과 Zod로 통합한다.
- 현재 사용자 흐름, 문구, 접근성, Android 공유와 Notion 콜백 동작을 보존한다.
- 각 라이브러리의 사용 근거를 코드, 테스트와 문서로 설명할 수 있게 한다.

## 비목표

- 화면 레이아웃, 디자인 토큰이나 UX 문구를 변경하지 않는다.
- Supabase 저장 계약, Express API, RLS와 도메인 타입을 변경하지 않는다.
- 인증 서비스 내부를 TanStack Query로 옮기지 않는다.
- 가져오기와 Android 공유의 상태 머신을 React Hook Form이나 Zustand로 대체하지 않는다.
- 사용 근거가 없는 Tailwind CSS, shadcn/ui, Motion, dnd-kit과 Sonner를 억지로 연결하지 않는다.

## 전체 구조

작업은 세 단계로 분리한다. 각 단계는 기존 동작을 보존하는 테스트를 먼저 추가하고 독립 커밋으로 완료한다.

1. TanStack Query와 Zustand로 서버 상태와 클라이언트 상태의 경계를 분리한다.
2. React Router로 인증 진입점과 주요 작업 화면을 URL에 연결한다.
3. React Hook Form과 Zod로 저장 및 카테고리 폼을 리팩터링한다.

세 단계를 한 번에 바꾸지 않는다. 각 단계가 통과한 뒤 다음 단계로 이동해 회귀 원인을 좁힌다.

## 1단계: TanStack Query와 Zustand

### Query Provider

`app` 계층에 `QueryClientProvider`를 둔다. Query Client는 앱 수명 주기 동안 한 번만 생성하고 테스트에서는 매 테스트마다 새 인스턴스를 사용한다. 테스트 Query Client는 자동 재시도를 끄고 캐시 수명을 짧게 설정해 테스트 간 상태가 섞이지 않게 한다.

쿼리 키는 직렬화할 수 있는 값만 사용한다.

- `['workspace', userId, 'insights']`
- `['workspace', userId, 'categories']`

Repository 객체나 함수를 쿼리 키에 넣지 않는다. 사용자 ID가 없는 주입 테스트는 명시적인 테스트 scope를 사용한다. 로그아웃하거나 사용자가 바뀌면 이전 사용자의 `workspace` 쿼리를 제거해 사용자 간 캐시가 공유되지 않게 한다.

### 서버 상태 Hook

기존 `useInsightWorkspace`와 `useCategoryWorkspace`의 외부 반환 계약은 우선 유지한다. 내부 조회는 `useQuery`, 생성과 수정 및 삭제는 `useMutation`으로 옮긴다. 페이지와 컴포넌트가 TanStack Query를 직접 알 필요는 없다.

- Repository의 구조화된 warning과 실패 결과를 기존 UI 계약으로 변환한다.
- 서버가 성공 결과를 반환하면 `queryClient.setQueryData`로 캐시를 불변 갱신한다.
- 가져오기 완료처럼 외부 기능이 목록을 바꾼 경우 해당 쿼리를 무효화하고 재조회한다.
- 동일 도메인의 변경은 기존 정책처럼 동시에 하나만 실행한다.
- 실패한 변경은 기존 캐시를 보존한다.
- Repository 또는 사용자 scope가 바뀌면 이전 scope의 늦은 응답이 현재 화면을 덮지 않는다.

Query Devtools는 개발 환경에서만 지연 로드한다. 프로덕션 렌더 트리와 번들 진입점에는 상시 노출하지 않는다.

### Zustand Store

Zustand는 서버 데이터, 폼 필드와 URL이 소유해야 하는 화면 위치를 저장하지 않는다. 로그인한 workspace마다 vanilla store를 생성하고 React Context로 범위를 제한한다.

Store가 소유할 상태는 다음으로 제한한다.

- 보관함 선택 카테고리
- 보관함 검색어
- 꺼내보기 입력값
- 선택한 추천 상황

이 값들은 화면을 오가도 유지할 가치가 있지만 서버 캐시나 URL 경로 자체는 아니다. 카테고리 생성 callback 같은 함수, 저장 폼 초안, 비동기 오류와 제출 상태는 Store에 넣지 않는다. 로그아웃 또는 사용자 교체 시 Store 인스턴스를 폐기한다.

## 2단계: React Router

### 라우트 계약

React Router의 브라우저 라우터를 앱 진입점에 연결하고 다음 경로를 사용한다.

- `/`: 로그인 전 서비스 소개
- `/login`: Google 로그인 진입
- `/app/home`: 로그인 후 홈과 꺼내보기
- `/app/library`: 보관함
- `/app/save`: URL 저장과 저장 후속 입력
- `/app`: `/app/home`으로 대체 이동
- `/import`: 기존 Notion 브라우저 callback을 받는 호환 경로

알 수 없는 경로는 인증 상태에 따라 `/` 또는 `/app/home`으로 대체 이동한다.

### 인증과 이동

- 로그인하지 않은 사용자가 `/app/*`에 접근하면 `/login`으로 이동하고 원래 목적지를 보존한다.
- 로그인에 성공하면 보존한 앱 내부 목적지로 이동하고, 목적지가 없으면 `/app/home`으로 이동한다.
- 로그인한 사용자가 `/` 또는 `/login`에 접근하면 `/app/home`으로 이동한다.
- 로그아웃하면 `/`로 이동하고 사용자 범위 Query 캐시와 Zustand Store를 폐기한다.
- Android 공유 Intent가 활성 상태이면 기존처럼 공유 전용 화면이 라우트보다 우선한다.

### 기존 특수 진입 보존

- PWA 공유 fragment에서 읽은 URL은 `/app/save`의 초기 저장값으로 전달하고 fragment를 제거한다.
- Notion OAuth callback의 `import`, `connection`, `error` query는 `/app/library`에서 가져오기 다이얼로그를 열고 처리 후 URL에서 제거한다.
- 현재 서버가 사용하는 `/import?import=notion...`과 기존 `/?import=notion...` 진입은 query를 보존한 채 `/app/library`로 정규화한다. 이를 위해 서버 callback 계약은 변경하지 않는다.
- 내비게이션은 `NavLink` 또는 `useNavigate`를 사용하고 현재 화면의 접근성 상태를 유지한다.
- 브라우저 뒤로 가기는 이전 앱 화면으로 이동하며 저장이나 삭제 mutation을 다시 실행하지 않는다.

`activeTab`과 수동 탭 전환 함수는 라우팅 완료 후 제거한다. 현재 화면 이름은 경로에서 계산한다.

## 3단계: React Hook Form과 Zod

### 저장 폼

저장 화면의 기본 URL 폼과 저장 후속 정보 폼은 별도 `useForm` 인스턴스를 사용한다. 두 폼의 성공과 오류 수명 주기가 다르기 때문이다.

- 기본 폼은 URL과 공유 제목을 소유한다.
- 후속 폼은 제목, 메모와 카테고리를 소유한다.
- 클립보드 입력과 Android 공유 초기값은 `reset` 또는 `setValue`로 주입한다.
- 사용자가 제출 이후 값을 바꾸면 이전 성공 및 오류 피드백을 지운다.
- 저장 성공 후 서버가 반환한 인사이트 ID는 폼 값이 아니라 저장 흐름 상태로 유지한다.

Zod는 필수 입력, 문자열 길이, URL 형식과 허용 프로토콜을 폼 경계에서 검증한다. 도메인 정규화와 서버 검증은 그대로 유지해 클라이언트 검증이 보안 경계를 대체하지 않게 한다. 서버에서 받은 permission, duplicate와 write 실패는 기존 사용자 문구로 매핑한다.

### 카테고리 폼

카테고리 생성과 수정은 하나의 Zod schema와 `useForm`을 공유한다. 모드가 바뀔 때 `reset`으로 초기값을 바꾼다.

- 이름과 색상 값을 폼이 소유한다.
- 로컬 길이 오류는 submit 전에 필드 오류로 표시한다.
- 서버 duplicate와 permission 오류는 `setError` 또는 폼 상단 상태로 매핑한다.
- 삭제 확인은 폼이 아니므로 현재 명시적인 확인 상태를 유지한다.
- 가져오기 다이얼로그와 Android 공유 상태 머신은 RHF 적용 범위에서 제외한다.

### Schema 위치

저장 schema는 `pages/save/model`, 카테고리 schema는 `features/category-management/model`에 둔다. 공통이라는 이유만으로 `shared`에 올리지 않는다. 외부 사용자는 각 slice의 public API로만 접근한다.

## 데이터 흐름

1. Auth Provider가 로그인 사용자를 결정한다.
2. 사용자 ID가 Query key와 workspace Store 범위를 결정한다.
3. 라우터가 현재 페이지를 결정한다.
4. 페이지는 Query 기반 workspace Hook에서 서버 상태와 mutation 함수를 받는다.
5. 페이지 검색 조건은 Zustand selector로 읽고 필요한 UI만 다시 렌더링한다.
6. 폼은 RHF가 관리하고 Zod resolver가 제출 전 입력을 검증한다.
7. mutation 성공 결과는 Query 캐시에 반영되고 모든 구독 화면이 같은 데이터를 받는다.
8. 외부 가져오기 완료는 쿼리 무효화로 최신 서버 목록을 다시 읽는다.

## 오류 처리

- Query 조회가 예외를 던지면 기존 `read-failed` warning으로 변환한다.
- Repository가 반환한 `permission-denied`, `not-found`, `write-failed` 계약을 유지한다.
- mutation 실패 시 캐시를 낙관적으로 지우지 않고 사용자가 입력한 폼 값도 유지한다.
- 라우트 guard는 허용된 앱 내부 경로만 복귀 대상으로 사용해 외부 URL 이동을 막는다.
- Zod 오류와 서버 오류를 구분하고 동일 필드에서 충돌하면 서버 오류를 사용자가 수정하는 즉시 해제한다.
- 디버그 로그나 원시 서버 응답을 사용자 화면과 콘솔에 추가하지 않는다.

## 테스트 전략

모든 단계는 TDD로 진행한다.

### Query와 Store

- Query Provider가 사용자별 캐시를 분리하는 테스트
- 가장 늦은 scope의 조회 결과만 현재 화면에 노출되는 테스트
- 생성, 수정, 삭제 성공 시 캐시가 불변 갱신되는 테스트
- mutation 실패 시 기존 캐시가 유지되는 테스트
- 가져오기 완료 후 인사이트와 카테고리를 재조회하는 테스트
- Zustand selector와 사용자 교체 reset 테스트

### Router

- Memory Router를 사용한 공개 및 보호 경로 테스트
- 로그인 성공 후 원래 목적지 복귀 테스트
- 로그아웃 후 공개 경로 이동과 사용자 상태 폐기 테스트
- 뒤로 가기와 직접 URL 진입 테스트
- PWA 공유와 Notion callback 경로 보존 테스트
- 내비게이션의 현재 화면 접근성 상태 테스트

### Forms

- 유효하지 않은 URL과 카테고리 이름을 서버 호출 전에 거절하는 테스트
- 클립보드와 공유 초기값 반영 테스트
- 제출 실패 후 입력값 유지와 수정 시 오류 해제 테스트
- 저장 성공 후 후속 폼 전환 테스트
- 카테고리 생성과 수정 mode reset 테스트
- 키보드 제출, 레이블, 오류 연결과 focus 이동 테스트

각 단계에서 관련 테스트, TypeScript 검사, ESLint, 변경 파일 Prettier 검사와 프로덕션 빌드를 실행한다. 저장소 전체 테스트의 기존 실패는 별도로 기록하되 변경 범위에서 새로운 실패를 추가하지 않는다.

## 단계별 완료 조건

### 1단계 완료

- 인사이트와 카테고리 조회 및 mutation이 TanStack Query를 사용한다.
- 수동 `loadRevisionRef`, `mountedRef`와 중복 캐시 상태가 제거된다.
- 지정한 workspace UI 상태가 scoped Zustand Store를 사용한다.
- 사용자 교체 시 서버 캐시와 클라이언트 상태가 분리된다.

### 2단계 완료

- 주요 화면에 직접 URL로 접근할 수 있다.
- 새로고침과 뒤로 가기 이후 올바른 화면이 유지된다.
- 보호 경로, 로그인 복귀, PWA 공유와 Notion callback 테스트가 통과한다.
- `activeTab` 기반 화면 분기가 제거된다.

### 3단계 완료

- 저장 및 카테고리 폼이 RHF와 Zod resolver를 사용한다.
- 기존 제출, 오류 복구와 접근성 동작이 보존된다.
- 폼 필드용 중복 `useState`와 수동 제출 boilerplate가 제거된다.

## 의존성 및 문서 정리

세 단계가 끝난 뒤 실제 import와 설정을 다시 조사한다.

- Zustand, TanStack Query, Query Devtools, React Router, Zod, React Hook Form과 resolver를 `사용 중`으로 문서화한다.
- 이미 사용 중인 clsx와 lucide-react의 문서 상태를 정정한다.
- 사용 근거가 없는 Tailwind CSS, Tailwind Vite 플러그인, shadcn CLI, CVA, tailwind-merge, Motion, dnd-kit과 Sonner를 제거한다.
- Tailwind를 제거할 때 `prettier-plugin-tailwindcss`와 관련 Prettier 설정도 함께 제거한다.
- `showcase.json`에는 구현과 검증이 완료된 라이브러리만 반영한다.

## 구현 순서

이 설계는 하나의 대규모 변경이 아니라 세 개의 독립 구현 계획으로 실행한다.

1. 서버 상태와 클라이언트 상태 분리 계획
2. URL 라우팅 계획
3. 폼 상태와 검증 계획

각 계획은 앞 단계의 완료 커밋을 기준으로 작성하고, 다음 단계로 넘어가기 전에 관련 회귀 검증을 끝낸다.
