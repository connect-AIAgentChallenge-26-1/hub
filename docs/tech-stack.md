# 기술 스택 및 라이브러리

이 문서는 아맞다 프로젝트에서 사용할 기술 스택과 후보 라이브러리를 정리한다. 버전은 2026-07-26 기준 `package-lock.json`을 기준으로 한다.

## 결정 기준

- 현재 설치된 라이브러리와 도입 예정 라이브러리를 구분한다.
- 패키지만 설치하고 실제 코드에 연결하지 않은 항목은 `설치됨, 미연동`으로 표시한다.
- UI 라이브러리는 중복 도입 비용이 크므로 WDS와 Tailwind CSS/shadcn UI 중 장기 기준을 선택한다.
- 상태 관리는 클라이언트 상태와 서버 상태를 분리한다.
- FSD 구조에서는 공통 API 클라이언트, 공통 UI, 환경 설정을 `src/shared`에 둔다.

## 스택 목록

| 이름                        | 버전                                             | 카테고리             | 사용 여부      | 선정 이유                                                                                                | 대체 가능 라이브러리                                     | 메모                                                                                                                  |
| --------------------------- | ------------------------------------------------ | -------------------- | -------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| React                       | 19.2.7                                           | UI 라이브러리        | 사용 중        | 컴포넌트 기반 설계로 화면을 재사용하기 쉽고, 생태계가 넓어 협업과 유지보수에 유리하다.                   | Vue, Svelte, Solid                                       | 현재 Vite React 앱의 기본 런타임이다.                                                                                 |
| TypeScript                  | 6.0.3                                            | 개발 언어            | 사용 중        | 타입 안정성으로 오류를 초기에 발견하고, 도메인 타입과 API 응답을 명확하게 표현할 수 있다.                | JavaScript                                               | npm 최신은 7.0.2지만 현재 프로젝트는 6.0.3을 사용한다.                                                                |
| Vite                        | 8.1.3                                            | 빌드 툴              | 사용 중        | 빠른 개발 서버와 HMR을 제공하고 설정이 단순하다.                                                         | Webpack, Parcel, Rollup, Next.js                         | npm 최신은 8.1.4다. 현재 버전을 유지해도 무방하다.                                                                    |
| Capacitor                   | core/cli/android 8.4.2, app 8.1.1, browser 8.0.4 | Android 앱 셸        | 사용 중        | 기존 React 앱을 Android에서 실행하고 공유 Intent·딥링크·시스템 브라우저를 작은 네이티브 경계로 연결한다. | React Native, Kotlin·Compose                             | `shared/capacitor`와 Kotlin AndroidShare 플러그인에 연결되어 있으며 상세 절차는 `docs/android-capacitor.md`를 따른다. |
| Express                     | 5.2.1                                            | API 서버             | 사용 중        | 여러 저장 채널이 공유하는 인증·입력 검증과 안전한 오류 응답 경계를 제공한다.                             | Fastify, Hono, NestJS                                    | `/api/health`, 인증된 캡처 API와 Chrome 확장 메모 API를 제공한다.                                                     |
| Web Storage API             | 브라우저 내장                                    | 로컬 데이터 저장     | 보조 구현      | 역사적 로컬 MVP의 저장 계약과 이전 데이터 호환 경계를 보존한다.                                          | IndexedDB                                                | 현재 제품 저장소는 아니다. `schemaVersion`을 가진 교체 가능한 어댑터와 테스트만 유지한다.                             |
| @wanteddev/wds              | 3.11.0                                           | UI 시스템            | 사용 중        | 현재 화면은 WDS 컴포넌트와 전역 스타일을 기반으로 구현되어 있다.                                         | shadcn/ui, MUI, Chakra UI, Ant Design                    | Tailwind CSS/shadcn UI로 전환할 경우 점진 제거 대상이다.                                                              |
| @wanteddev/wds-icon         | 3.11.0                                           | 아이콘               | 사용 중        | WDS와 같은 버전으로 맞춰 UI 일관성을 유지한다.                                                           | lucide-react, React Icons                                | shadcn UI 도입 시 lucide-react와 역할이 겹칠 수 있다.                                                                 |
| Tailwind CSS                | 4.3.2                                            | CSS 프레임워크       | 설치됨, 미연동 | 유틸리티 클래스 기반으로 빠르게 스타일링하고, 디자인 토큰을 코드 가까이에서 관리할 수 있다.              | CSS Modules, Emotion, Styled Components, Vanilla Extract | WDS와 병행하면 스타일 기준이 갈라질 수 있으므로 전환 범위를 먼저 정한다.                                              |
| @tailwindcss/vite           | 4.3.2                                            | Tailwind/Vite 연동   | 설치됨, 미연동 | Tailwind CSS v4의 Vite 공식 플러그인으로 설정을 단순화한다.                                              | PostCSS plugin                                           | 아직 `vite.config.ts`에는 연결하지 않았다.                                                                            |
| shadcn/ui                   | CLI 4.13.0                                       | UI 컴포넌트 소스     | 설치됨, 미연동 | 컴포넌트를 패키지처럼 숨기지 않고 프로젝트 코드로 가져와 커스터마이징하기 쉽다.                          | WDS, MUI, Chakra UI, Ant Design                          | `shadcn` CLI만 설치했으며 컴포넌트 생성은 별도 작업이다.                                                              |
| class-variance-authority    | 0.7.1                                            | 스타일 variant 유틸  | 설치됨, 미연동 | shadcn UI 컴포넌트의 variant 구성을 명확하게 관리한다.                                                   | tailwind-variants                                        | shadcn 컴포넌트 추가 시 함께 사용할 수 있다.                                                                          |
| clsx                        | 2.1.1                                            | className 유틸       | 사용 중        | 조건부 className 조합을 간결하게 작성할 수 있다.                                                         | classnames                                               | 공통 UI와 인사이트·보관함 화면의 조건부 className 조합에 사용한다.                                                    |
| tailwind-merge              | 3.6.0                                            | Tailwind class 병합  | 설치됨, 미연동 | 충돌하는 Tailwind 클래스를 안전하게 병합한다.                                                            | 직접 병합                                                | shadcn UI와 Tailwind CSS를 쓴다면 사실상 기본 유틸이다.                                                               |
| lucide-react                | 1.23.0                                           | 아이콘               | 사용 중        | 일관된 SVG 아이콘을 React 컴포넌트로 제공한다.                                                           | WDS Icon, React Icons                                    | 앱 내비게이션, 공통 UI, 저장·보관함 화면에 사용한다.                                                                  |
| Zustand                     | 5.0.14                                           | 클라이언트 상태 관리 | 사용 중        | 화면 이동 뒤에도 유지할 UI 상태를 적은 보일러플레이트로 관리할 수 있다.                                  | Redux Toolkit, Jotai, Recoil, Context API                | 선택 카테고리·검색어, 꺼내보기 입력·추천 상황 등 클라이언트 UI 상태만 소유한다.                                       |
| TanStack Query              | 5.101.2                                          | 서버 상태 관리       | 사용 중        | API 요청, 캐싱, 로딩/에러 상태, refetch를 표준화할 수 있다.                                              | SWR, 직접 fetch, Apollo Client                           | Supabase Repository의 목록·mutation 캐시와 가져오기 뒤 무효화·재조회를 소유한다.                                      |
| TanStack Query Devtools     | 5.101.2                                          | 개발 도구            | 사용 중        | 쿼리 캐시와 refetch 상태를 개발 중 확인하기 쉽다.                                                        | 브라우저 로그                                            | 개발 환경에서만 지연 로드한다.                                                                                        |
| Motion                      | 12.42.2                                          | UI 애니메이션        | 설치됨, 미연동 | 화면 전환, 버튼 인터랙션, 등장 애니메이션을 React 컴포넌트 상태와 함께 선언적으로 구현할 수 있다.        | CSS transition, GSAP                                     | 앱 내부 micro interaction 기본값이다. 로그인 전 서비스 온보딩의 브랜드 시퀀스에는 사용하지 않는다.                    |
| GSAP                        | 3.15.0                                           | 온보딩 애니메이션    | 사용 중        | 로그인 전 Hero의 핵심 문구와 시작 행동을 첫 진입 때 한 번 순서대로 보여준다.                             | Motion, CSS keyframes                                    | 로그인 전 Hero 시퀀스 한 곳에만 사용한다. 앱 내부 UI 전환에는 연결하지 않는다.                                        |
| @gsap/react                 | 2.1.2                                            | GSAP React 연동      | 사용 중        | React 컴포넌트 안에서 Hero timeline의 범위와 해제 시 정리를 관리한다.                                    | 직접 `gsap.context()` 사용                               | `useGSAP()`과 `gsap.matchMedia()`로 데스크톱에서만 재생하고 모바일과 `prefers-reduced-motion`은 정적으로 보여준다.    |
| dnd-kit                     | core 6.3.1, sortable 10.0.0, utilities 3.2.2     | 드래그 앤 드롭       | 설치됨, 미연동 | 카테고리 정렬이나 카드 순서 변경이 필요해질 때 접근성과 확장성을 갖춘 드래그 앤 드롭을 구현할 수 있다.   | react-beautiful-dnd, react-dnd                           | 실제 정렬/드래그 화면을 만들 때 연결한다.                                                                             |
| pnpm                        | 11.10.0                                          | 패키지 매니저        | 전환 예정      | 설치 속도와 디스크 효율이 좋고, 의존성 구조가 엄격해 장기 유지보수에 유리하다.                           | npm, yarn, bun                                           | 현재 repo는 npm lockfile을 사용한다. 전환 시 `package-lock.json` 제거와 `pnpm-lock.yaml` 생성이 필요하다.             |
| Supabase JS                 | 2.110.1                                          | BaaS 클라이언트      | 사용 중        | Google OAuth, Postgres 저장과 사용자별 RLS를 브라우저·서버·확장에서 같은 인증 경계로 사용한다.           | Firebase, 직접 Express API, Appwrite                     | `src/shared/api`, 인사이트 저장 어댑터, Express 캡처 서비스와 Chrome 확장 인증에 연결되어 있다.                       |
| csv-parse                   | 7.0.1                                            | CSV 파서             | 사용 중        | 따옴표·개행·구분자를 포함한 CSV를 문자열 분할 없이 구조적으로 파싱한다.                                  | Papa Parse, 직접 파서                                    | 범용 가져오기의 헤더 감지와 필드 매핑 전 구조 파싱에 사용한다.                                                        |
| htmlparser2                 | 12.0.0                                           | HTML 파서            | 사용 중        | 외부 HTML을 DOM에 실행하지 않는 inert SAX 방식으로 링크와 북마크 계층을 읽는다.                          | parse5, DOMParser                                        | Chrome bookmark HTML과 범용 HTML 어댑터에 사용한다.                                                                   |
| @zip.js/zip.js              | 2.8.34                                           | ZIP 처리             | 사용 중        | entry metadata를 먼저 검사하고 허용된 파일만 순차 해제해 traversal과 zip bomb 위험을 제한한다.           | fflate, JSZip                                            | 중첩 archive와 symlink를 거부하고 파일·총 해제 크기 제한을 적용한다.                                                  |
| @notionhq/client            | 5.23.2                                           | Notion API SDK       | 사용 중        | 최신 Notion API 타입과 data source·page·block 요청 경계를 제공한다.                                      | 직접 fetch                                               | 서버 전용 OAuth token으로 `2026-03-11` API를 호출하며 브라우저 번들에는 포함하지 않는다.                              |
| React Router                | 8.2.0                                            | 라우팅               | 설치됨, 미연동 | URL 기반 화면 전환, 딥링크, 인증 보호 라우트가 필요해지면 표준 라우터가 필요하다.                        | TanStack Router, wouter, Next.js App Router              | 현재는 탭 상태 기반 화면이므로 라우트 설계 확정 후 연결한다.                                                          |
| Zod                         | 4.4.3                                            | 스키마 검증          | 설치됨, 미연동 | 환경 변수, API 응답, 폼 입력을 런타임에서 검증해 TypeScript의 빈틈을 보완한다.                           | Valibot, Yup, ArkType                                    | `src/shared/config`, `src/shared/api`, 폼 검증에 유용하다.                                                            |
| React Hook Form             | 7.81.0                                           | 폼 상태 관리         | 설치됨, 미연동 | 저장/온보딩/편집 폼이 복잡해질 때 렌더링 비용과 검증 코드를 줄일 수 있다.                                | Formik, TanStack Form, 직접 state                        | 폼 설계가 생기면 Zod resolver와 함께 연결한다.                                                                        |
| @hookform/resolvers         | 5.4.0                                            | 폼 검증 연동         | 설치됨, 미연동 | React Hook Form과 Zod schema를 연결한다.                                                                 | 직접 resolver 작성                                       | 폼 도입 시 사용한다.                                                                                                  |
| MiniSearch                  | 7.2.0                                            | 검색/유사도          | 후속 검토      | 데이터가 커졌을 때 여러 필드의 full-text relevance와 field boosting을 제공할 수 있다.                    | Fuse.js, Lunr, Meilisearch, Algolia                      | 현재 MVP는 결정적 토큰·필드 점수로 시작하고 측정된 실패가 있을 때만 비교한다.                                         |
| Fuse.js                     | 7.4.2                                            | fuzzy search         | 후속 검토      | 오타 허용 검색이나 작은 데이터셋 검색에 적합하다.                                                        | MiniSearch, Lunr                                         | 실제 사용자 쿼리에서 오타·부분 일치 실패가 반복될 때 비교한다.                                                        |
| ESLint                      | 10.6.0                                           | 정적 분석            | 사용 중        | 코드 컨벤션 문서에 ESLint 기준이 있으므로 실제 검사 도구도 맞춰야 한다.                                  | Biome, oxlint                                            | `eslint.config.js`와 `npm run lint`로 검사한다.                                                                       |
| typescript-eslint           | 8.63.0                                           | TypeScript lint      | 사용 중        | TypeScript 코드의 타입/문법 기반 lint 규칙을 적용한다.                                                   | Biome                                                    | ESLint flat config에 함께 설정되어 있다.                                                                              |
| Prettier                    | 3.9.4                                            | 코드 포맷터          | 사용 중        | 코드 스타일을 자동 정리해 리뷰 비용을 줄인다.                                                            | Biome formatter, dprint                                  | 현재 문서와 코드 포맷 검증에 사용 중이다.                                                                             |
| prettier-plugin-tailwindcss | 0.8.0                                            | Tailwind class 정렬  | 사용 중        | Tailwind class 순서를 자동 정렬해 스타일 diff를 줄인다.                                                  | 수동 정렬                                                | `prettier.config.js`에 연결되어 있다.                                                                                 |
| Vitest                      | 4.1.10                                           | 테스트 러너          | 사용 중        | Vite 기반 프로젝트와 궁합이 좋고 빠른 단위 테스트 실행이 가능하다.                                       | Jest, Node test runner                                   | 현재 서버와 app public API 테스트에 사용 중이다.                                                                      |
| Testing Library             | React 16.3.2, jest-dom 6.9.1, user-event 14.6.1  | 컴포넌트 테스트      | 사용 중        | 사용자 관점에서 인증, 저장, 보관함과 꺼내보기 흐름을 검증한다.                                           | Playwright component test, Cypress Component Testing     | Vitest와 함께 앱·페이지·기능 컴포넌트 테스트에 사용한다.                                                              |
| jsdom                       | 29.1.1                                           | 브라우저 테스트 환경 | 사용 중        | Node 환경에서 DOM과 브라우저 API 기반 컴포넌트 테스트를 실행한다.                                        | happy-dom                                                | Vitest의 기본 컴포넌트 테스트 환경이다.                                                                               |
| Supertest                   | 7.2.2                                            | API 테스트           | 사용 중        | Express API를 실제 HTTP 요청처럼 테스트할 수 있다.                                                       | 직접 fetch, undici                                       | health, 인증된 캡처와 메모 API 계약 테스트에 사용한다.                                                                |
| tsx                         | 4.23.0                                           | TypeScript 실행기    | 사용 중        | Express 서버를 빌드 없이 개발 모드에서 실행할 수 있다.                                                   | ts-node, swc-node, vite-node                             | `npm run dev:server`에서 사용한다.                                                                                    |
| concurrently                | 10.0.3                                           | 개발 프로세스 실행   | 사용 중        | Vite와 Express 개발 서버를 한 명령으로 함께 실행한다.                                                    | npm-run-all, Turbo, concurrently 대체 스크립트           | `npm run dev`에서 사용한다.                                                                                           |
| Sonner                      | 2.0.7                                            | 토스트 UI            | 설치됨, 미연동 | shadcn UI 생태계와 잘 맞는 토스트 컴포넌트다.                                                            | react-hot-toast, WDS SectionMessage                      | 저장 완료/오류 알림이 필요해질 때 연결한다.                                                                           |

## 현재 런타임과 배포 경계

- 브라우저 앱은 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`로 Supabase 공개 클라이언트를 만들고 Google OAuth 세션을 구독한다.
- Android 앱은 같은 React 런타임과 Supabase 클라이언트를 사용하고, `VITE_CAPACITOR_API_ORIGIN`의 HTTPS API에 캡처·메모 요청을 보낸다. 시스템 브라우저 PKCE 콜백만 Capacitor 딥링크 어댑터가 처리한다.
- 로그인한 사용자 ID에 묶인 Supabase 인사이트 저장 어댑터가 원격 목록과 수정·삭제를 담당한다.
- 웹·PWA·Chrome 확장의 저장은 Express 캡처 API를 거쳐 같은 Supabase 테이블과 RLS 경계를 사용한다. Chrome 확장 메모도 별도 인증 API로 같은 인사이트를 갱신한다.
- `insights` 테이블은 사용자별 정규화 URL 중복 제한과 RLS 조회·생성·수정·삭제 정책을 가진다.
- 브라우저와 확장에는 publishable key만 둘 수 있다. secret key와 service role key는 공개 설정에서 거부한다.
- Vite 웹과 Express API는 Vercel 단일 프로젝트에서 같은 HTTPS 출처로 배포한다. Pull Request는 미리보기, `main`은 운영 배포를 만들며 상세 계약은 [운영 배포 문서](./deployment.md)와 [#54](https://github.com/ppre1ude/hub/issues/54)에서 관리한다.
- 범용 가져오기의 파일 파싱은 브라우저에서 끝내고 표준 후보만 Supabase RPC로 보낸다. Notion SDK와 OAuth secret은 Express 서버 경계에만 두며 연결 token은 AES-256-GCM으로 암호화한다.
- Supabase GitHub 연동은 `ppre1ude/hub`의 `main`과 `supabase/migrations/`를 운영 프로젝트에 자동 반영한다. Google OAuth와 허용 Redirect URL은 Supabase Dashboard에서 별도로 관리한다.

현재 전환 순서는 [#21](https://github.com/ppre1ude/hub/issues/21), 다중 기기 캡처 진행 상황은 [#36](https://github.com/ppre1ude/hub/issues/36)을 기준으로 관리한다.

## 우선순위 제안

1. `Supabase JS`, Express, RLS: 현재 인증·저장·캡처 경계를 유지하고 남은 수직 슬라이스와 운영 배포를 완성한다.
2. `Testing Library`, `jsdom`, `Supertest`, Supabase SQL 테스트: 인증, 사용자 격리, 저장 채널과 재발견 회귀를 사용자 행동과 계약 기준으로 검증한다.
3. `@wanteddev/wds`: 현재 화면과 디자인 토큰을 유지한다. MVP 중 UI 시스템 전환 작업은 만들지 않는다.
4. `MiniSearch`, `Fuse.js`: 실제 사용자 검증에서 현재 결정적 검색이 실패한 원인을 측정한 뒤 비교한다.
5. `TanStack Query`: 로그인한 workspace의 목록·mutation 상태와 가져오기 뒤 재조회를 유지한다. `Zod`는 현재 검증 경계에 도입하지 않고 별도 이슈로 검토한다.
6. `GSAP`, `Motion`, `dnd-kit`: 현재 구현을 유지하되 MVP 핵심 흐름에 새 요구가 생기지 않으면 범위를 확장하지 않는다.

## 아직 코드에 연결하지 않은 항목

- `pnpm`: 현재 npm 기반 lockfile이 있으므로 별도 전환 작업으로 처리한다. 프로젝트 의존성으로 설치하지 않는다.
- `Tailwind CSS`, `@tailwindcss/vite`: 설치되어 있지만 아직 Vite 설정과 CSS 엔트리에 연결하지 않았다.
- `shadcn/ui`: CLI는 설치되어 있지만 컴포넌트 생성과 `components.json` 초기화는 하지 않았다.
- `MiniSearch`, `Fuse.js`: 아직 설치하지 않았다. 현재 검색의 실패 데이터와 비교 실험이 생긴 뒤에만 선택한다.
- `class-variance-authority`, `tailwind-merge`, `React Router`, `Zod`, `React Hook Form`, `@hookform/resolvers`, `Motion`, `dnd-kit`, `Sonner`: 설치되어 있지만 현재 코드에 연결하지 않았다.

## 참고 자료

- [Tailwind CSS Vite 설치 문서](https://tailwindcss.com/docs)
- [shadcn/ui Vite 설치 문서](https://ui.shadcn.com/docs/installation/vite)
- [TanStack Query React 설치 문서](https://tanstack.com/query/v5/docs/framework/react/installation)
- [Motion for React 문서](https://motion.dev/docs/react)
- [GSAP 설치 문서](https://gsap.com/docs/v3/Installation/)
- [React & GSAP 문서](https://gsap.com/resources/React/)
- [Zustand 문서](https://zustand.docs.pmnd.rs/)
- [dnd-kit 문서](https://dndkit.com/)
- [pnpm 문서](https://pnpm.io/)
- [React Router 문서](https://reactrouter.com/)
- [MiniSearch 문서](https://github.com/lucaong/minisearch)
- [Fuse.js 문서](https://www.fusejs.io/)
