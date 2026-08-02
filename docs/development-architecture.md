# 개발 아키텍처

프론트엔드는 Feature-Sliced Design(FSD)을 현재 제품 범위까지 적용한다. slice 디렉터리는 기능 이름을 유지하고, TypeScript/TSX/CSS 파일명은 `snake_case`를 사용한다. 모든 public API는 named export다.

## 현재 구조

```text
src/
  app/
    app.tsx
    authenticated_workspace.tsx
    model/
      create_browser_category_repository.ts
      create_browser_insight_repository.ts
      use_category_workspace.ts
      use_insight_workspace.ts
      workspace_query_keys.ts
      workspace_seed.ts
      workspace_ui_store.tsx
    providers/
      workspace_query_provider.tsx
    styles/
      authenticated_workspace.css
      global.css
  features/
    android-share/
      index.ts
      model/
        android_share_session.ts
        extract_shared_url.ts
        use_android_share.ts
      ui/
        android_share_screen.tsx
        android_share_screen.css
    auth/
      api/
        auth_service.ts
      model/
        auth_provider.tsx
      ui/
        account_menu.tsx
    insight-import/
      api/
        browser_insight_import_service.ts
        notion_import_api.ts
      model/
        import_adapter.ts
        import_analysis.ts
        use_insight_import.ts
        use_notion_import.ts
      ui/
        insight_import_dialog.tsx
        import_field_mapping.tsx
        import_preview.tsx
    pwa-install/
      index.ts
      model/
        use_pwa_install_prompt.ts
      ui/
        pwa_install_notice.tsx
        pwa_install_notice.css
  pages/
    home/
      index.ts
      ui/
        home_page.tsx
        home_page.css
    landing/
      index.ts
      ui/
        landing_page.tsx
        landing_page.css
        onboarding_motion_preview.tsx
    library/
      index.ts
      ui/
        library_page.tsx
        library_page.css
    login/
      index.ts
      ui/
        login_page.tsx
        login_page.css
    save/
      index.ts
      ui/
        save_page.tsx
        save_page.css
  widgets/
    app-navigation/
      index.ts
      ui/
        app_navigation.tsx
        app_navigation.css
  entities/
    insight/
      api/
        browser_insight_capture_service.ts
        browser_insight_memo_service.ts
        supabase_insight_repository.ts
      index.ts
      model/
        insight.ts
        insight_repository.ts
        search_insights.ts
      ui/
        insight_grid.tsx
        insight_grid.css
  shared/
    api/
      supabase_client.ts
    capacitor/
      android_share_plugin.ts
      mobile_oauth.ts
      notion_import_callback.ts
      runtime.ts
    config/
      supabase_env.ts
      design-system/
        index.ts
        tokens.ts
        apply_design_tokens.ts
    pwa/
      index.ts
      install_prompt_event_store.ts
      register_service_worker.ts
    ui/
      index.ts
      button/
      category-filter/
      chip/
      design-system-provider/
      empty-state/
      inline-label/
      loading-state/
      navigation-bar/
      status-message/
      text-field/
  main.tsx
```

테스트는 대상 파일 가까이에 둔다. 위 트리는 제품 런타임 경계를 중심으로 표시하며 테스트 파일은 생략했다.

## 레이어 책임

| 레이어     | 책임                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `app`      | 앱 진입 상태, 로그인 workspace의 Query Provider·scoped Zustand Store, authenticated shell, 전역 reset |
| `features` | 사용자 행동 단위의 상태 정책과 UI 조합                                                                |
| `pages`    | 라우트 또는 주요 화면 단위 조합                                                                       |
| `widgets`  | 여러 화면에서 독립적으로 배치되는 큰 UI 블록                                                          |
| `entities` | 도메인 타입, 도메인 연산, 도메인 표시 UI                                                              |
| `shared`   | 비즈니스 규칙이 없는 config, UI adapter, 범용 도구                                                    |

현재 도메인 모델·Supabase 저장 어댑터·목록 UI는 `entities/insight`, Android 공유의 URL 추출·상태·결과 화면은 `features/android-share`, Google 로그인 정책은 `features/auth`, PWA 설치 안내 정책은 `features/pwa-install`, 고정 앱 내비게이션은 `widgets/app-navigation`, Supabase 공통 클라이언트는 `shared/api`, Capacitor 런타임·공유 플러그인·모바일 OAuth 어댑터는 `shared/capacitor`, 공개 환경 검증은 `shared/config`, PWA 브라우저 수명 주기 어댑터는 `shared/pwa`, 런타임 토큰은 `shared/config/design-system`, 공통 UI 경계는 `shared/ui`가 소유한다.

- `features/insight-import`는 출처별 입력을 표준 후보로 바꾸는 어댑터, 분석·반영·Undo 사용자 행동과 UI를 소유한다.
- 원본 파일은 브라우저에서만 읽으며 Notion OAuth와 Provider 호출은 `server/insight_import`에 둔다.
- `pages/library`는 feature를 직접 import하지 않고 진입 callback만 노출하며 `app`이 다이얼로그와 원격 목록 재조회를 조합한다.

## import 경계

- 외부 사용자는 slice의 `index.ts` public API만 import한다.
- `app`은 `features`, `pages`, `widgets`, `entities`, `shared`를 조합할 수 있다.
- `features`는 `entities`와 `shared`의 public API만 사용한다.
- `pages`와 `widgets`는 `entities`와 `shared`의 public API만 사용한다.
- `entities`는 `shared`만 import할 수 있다. 같은 entity 내부 구현은 상대 경로를 사용한다.
- `shared`는 상위 레이어를 import하지 않는다.
- 같은 레이어의 다른 slice 내부 경로를 직접 import하지 않는다.
- alias는 `@/*`만 사용한다.
- 화면과 domain UI는 외부 UI 패키지를 직접 import하지 않고 `@/shared/ui` adapter를 사용한다.
- `export default`를 사용하지 않는다.

`src/main.tsx`는 token injector를 실행하고 `DesignSystemProvider`로 `App`을 감싸는 bootstrap만 담당한다. `tokens.ts`가 값의 단일 원천이며 `apply_design_tokens.ts`만 DOM에 CSS custom property를 주입한다.

로그인한 workspace는 `app` 계층의 `WorkspaceQueryProvider`와 scoped `WorkspaceUiProvider` 안에서 동작한다. 인사이트·카테고리의 서버 상태와 mutation 결과, 가져오기 뒤 무효화·재조회는 TanStack Query가 소유한다. Query key는 Repository 객체를 넣지 않고 사용자 scope와 도메인 이름으로 구성한다. 보관함의 선택 카테고리·검색어, 꺼내보기 입력·추천 상황처럼 화면 이동 뒤에도 유지할 UI 상태만 Zustand가 소유한다.

## 스타일 경계

- `global.css`에는 reset, 전역 typography 기반, focus, visually-hidden 같은 접근성 utility만 둔다.
- 화면·widget·entity 스타일은 각 `ui` 디렉터리의 `snake_case.css`에 colocate한다.
- 제품 CSS는 주입된 design token 변수만 사용하며 raw 색상과 화면 전역 selector를 추가하지 않는다.
- 공통 UI의 vendor DOM 보정은 해당 `shared/ui` adapter CSS가 소유한다.

## 서버와 저장 경계

Express 서버는 FSD 대상이 아니므로 `server/`에 둔다. `/api/health` 외에 모바일·웹·Chrome 확장이 공유하는 인증된 캡처 API와 확장 메모 API를 제공한다. 캡처 API는 Bearer access token을 검증 경계로 사용하며 Supabase RLS가 최종 사용자 데이터 경계를 강제한다.

- 인사이트 타입과 비동기 `InsightRepository` 인터페이스는 `entities/insight`가 소유한다.
- 브라우저 앱은 로그인한 사용자 ID로 `createBrowserInsightRepository`를 만들고, page와 widget은 Supabase나 Web Storage를 직접 호출하지 않는다.
- Supabase 공개 URL과 publishable key는 `shared/config`에서 검증한다. 브라우저·확장 코드에 secret key 또는 service role key를 넣지 않는다.
- `insights.user_id`와 RLS 정책은 조회·생성·수정·삭제를 현재 사용자 데이터로 제한한다. 클라이언트의 `user_id` 필터는 RLS를 대체하지 않는다.
- 웹과 외부 저장 채널은 같은 캡처 계약을 사용한다. 링크 저장이 성공한 뒤 메모·제목·카테고리를 선택적으로 갱신한다.
- Web Storage 어댑터는 역사적 로컬 MVP 및 호환 작업을 위한 보조 구현이며, 현재 런타임 저장소 선택은 Supabase다.
- 데이터 계약 버전은 Web Storage의 `schemaVersion`과 Supabase의 `schema_version`에 기록한다. Supabase 저장소와 캡처 서비스도 읽은 데이터가 현재 버전인지 검증한다.
- 보관함 검색은 브라우저가 불러온 목록에서 제목, 메모, 카테고리, 도메인과 URL의 단어를 비교한다. `꺼내보기`는 로그인 토큰을 받은 서버가 제목·메모와 현재 상황의 Gemini 벡터를 만들고, Supabase가 같은 사용자의 벡터만 비교한다. 브라우저는 서버가 반환한 인사이트 ID를 이미 불러온 보관함 데이터와 연결한다.
- 범용 파일 가져오기는 브라우저에서 파싱·정규화한 후보만 Supabase RPC로 보내고 원본 파일 body는 서버로 보내지 않는다.
- Notion 연결은 서버가 OAuth state를 단일 사용으로 검증하고 AES-256-GCM으로 토큰을 암호화한다. 사용자 bearer client는 작업·후보 RPC와 RLS에만 사용하고 service role은 callback 토큰 저장과 만료 정리에만 사용한다.
- Notion 분석은 Provider cursor를 DB에 저장해 요청 slice 단위로 재개하며 완료·취소 시 토큰 철회를 시도한다. 연결 생성 24시간 뒤에는 암호화 OAuth 토큰과 연결 row, 미완료 작업의 Provider cursor·후보·오류·컬렉션이 만료 대상이 되고 다음 일일 Cron이 Provider 응답과 무관하게 삭제한다. 이미 반영된 인사이트와 완료·Undo 작업 기록은 자동 삭제하지 않는다.
- 가져오기 반영 완료 시 전체 후보 항목은 같은 트랜잭션에서 삭제한다. 되돌리기를 위해 생성 인사이트 ID와 반영 직후 수정 시각만 24시간 동안 별도로 저장한다. 완료 후 24시간이 지나면 DB RPC가 사용을 거부하고 Supabase Cron이 다음 1분 실행에서 저장된 ID와 시각을 삭제한다. 요약 작업 기록과 생성된 인사이트는 유지한다.

현재 Supabase 전환 순서는 [#21](https://github.com/ppre1ude/hub/issues/21), 다중 기기 캡처 경계는 [#36](https://github.com/ppre1ude/hub/issues/36), 캡처 우선 제품 결정은 [#25](https://github.com/ppre1ude/hub/issues/25)를 따른다.

## 활성 제품 문서

- 로그인 전 흐름과 문구는 `docs/onboarding.md`를 따른다.
- `꺼내보기` 경험은 `docs/retrieve.md`를 따른다.
- 제품 UX Writing 계약은 `docs/ux-writing.md`를 따른다.
- 현재 범위와 우선순위는 `docs/backlog.md`와 `docs/checklist.md`를 따른다.
- 디자인 런타임 계약은 루트 `DESIGN.md`를 따른다.
