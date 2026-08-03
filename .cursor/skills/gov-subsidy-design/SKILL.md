---
name: gov-subsidy-design
description: >-
  소상공인 정부지원금 큐레이터 UI/UX 디자인·구현 가이드. Pretendard 기반 모바일 퍼스트
  디자인 시스템, 와이어프레임 화면(온보딩·홈·상세)을 React 컴포넌트로 옮길 때 사용.
  Use when implementing UI, creating screens, matching wireframe design, styling
  components, or when the user mentions gov subsidy curator, 정부지원금, wireframe,
  or src/prototype/gov_subsidy_home_wireframe.html.
---

# 소상공인 정부지원금 큐레이터 — 디자인 제작

## 필수 참조

구현 전 반드시 읽을 것:

| 파일 | 용도 |
|------|------|
| `src/prototype/gov_subsidy_home_wireframe.html` | 화면·CSS·인터랙션 단일 소스 |
| `docs/plan.md` | 기능 범위, MVP 제외 항목, 입력 조건 |
| [design-tokens.md](design-tokens.md) | 색상·타이포·간격·컴포넌트 토큰 |
| [screens.md](screens.md) | 화면별 구조·상태·데이터 필드 |

## 디자인 원칙

1. **모바일 퍼스트**: 기본 뷰포트 390×844px. PC(≥480px)에서는 중앙 프레임 + 24px radius + shadow.
2. **신뢰감**: Navy(`#0A2540`) 헤더 + Blue(`#2563EB`) CTA. 관공서 톤이 아닌 **친근한 사장님 대화체** UI 카피.
3. **30초 온보딩**: 4스텝 조건 입력 → 완료 요약 → 홈. 각 스텝에서 **다음 버튼은 선택 완료 전 disabled**.
4. **정보 밀도**: 홈 카드는 제목·기관·금액·D-day·매칭도만. 상세는 섹션(자격·서류·신청방법)으로 분리.
5. **MVP 범위 준수**: 저장·알림·로그인 UI는 와이어프rame에 있어도 **비활성/placeholder** 처리. `docs/plan.md` MVP 제외 항목 참고.

## 디자인 → React 워크플로우

```
Task Progress:
- [ ] 1. 대상 화면을 screens.md에서 확인
- [ ] 2. design-tokens.md CSS 변수를 src/styles/tokens.css에 반영
- [ ] 3. 와이어프rame HTML 해당 섹션의 class·구조를 컴포넌트로 1:1 매핑
- [ ] 4. 화면 전환은 React Router로, 온보딩 state는 context 또는 URL 쿼리
- [ ] 5. PC 프레임(.app 390px)은 AppShell 레이아웃으로 감싸기
- [ ] 6. Pretendard CDN 또는 npm 패키지 로드 확인
```

### 컴포넌트 매핑 (와이어프레임 → React)

| 와이어프레임 class | React 컴포넌트 | 비고 |
|-------------------|----------------|------|
| `.welcome` | `WelcomeScreen` | 진입·기능 소개 |
| `.screen` + progress | `OnboardingStep` | step 1~4 공통 레이아웃 |
| `.opt` / `.options-grid` | `OptionButton` | 단일/복수 선택 공용 (이슈 #92부터 step1 지원분야는 복수선택) |
| `.home-header` | `HomeHeader` | 프로필 요약 + 알림(placeholder) |
| `.home-chip` | `FilterChip` | 정렬 필터 |
| `.home-card` | `SubsidyCard` | 리스트 아이템 |
| `.home-tabbar` | `TabBar` | 홈/지난기록/마이(후순위) |
| `.detail-top` + `.detail-body` | `SubsidyDetail` | sticky 하단 CTA |

### 화면 라우트 (권장)

```
/                     → WelcomeScreen (또는 온보딩 완료 시 /home 리다이렉트)
/onboarding/:step(1-4) → OnboardingStep
/onboarding/complete  → CompleteScreen
/home                 → HomeScreen
/subsidies/:id        → SubsidyDetailScreen
```

## plan.md vs 와이어프레임 차이 (구현 시 통합)

| 항목 | plan.md | 와이어프레임 | 구현 결정 |
|------|---------|-------------|-----------|
| 업력(연차) | 필수 | 없음 (연매출만) | **1차: 와이어프레임(연매출)**, plan 업력은 API 매칭 필드로 별도 추가 예정 |
| 신용도 | 선택 | 없음 | MVP UI 미노출, API 스키마만 optional |
| 알림·탭바 | MVP 제외 | UI 존재 | 시각만 유지, 클릭 시 toast "준비 중" |
| 정렬 | 매칭도>마감>금액 | 칩 4개 | 기본 매칭도순, 칩은 sort 파라미터 |

## 스타일 구현 규칙

- CSS 변수명은 와이어프레임 `:root`와 동일하게 유지 (`--navy`, `--blue`, `--bg` 등).
- 컴포넌트별 CSS Module (`ComponentName.module.css`) 또는 co-located `.css` — 기존 `ProjectIntro.css` 패턴 따름.
- 이모지 아이콘: 와이어프레임과 동일하게 유지 (별도 icon lib 도입 전까지).
- `:active { transform: scale(0.97) }` 등 터치 피드백 유지.
- `@keyframes fadeIn`, `popIn` 전환 애니메이션 유지.

## D-day 뱃지 색상 (와이어프레임 JS 기준)

```css
/* ddayClass(d): d <= 7 urgent, d <= 14 soon, else normal */
.dday-urgent { background: var(--danger-bg); color: var(--danger); }
.dday-soon   { background: #FEF3C7; color: #D97706; }
.dday-normal { background: var(--success-bg); color: var(--success); }
```

## 접근성·UX 체크

- 버튼·선택지: `<button type="button">` 사용 (div 클릭 금지)
- disabled CTA: `cursor: not-allowed` + 시각적 회색 (`--border`)
- select·input: focus ring `box-shadow: 0 0 0 3px var(--blue-soft)`
- 한국어 UI 카피는 와이어프레임 문구 그대로 — 임의 변경 시 plan.md 톤과 맞출 것

## 추가 리소스

- 상세 토큰·spacing: [design-tokens.md](design-tokens.md)
- 화면별 필드·상태·샘플 데이터: [screens.md](screens.md)
