# CareerSignal 디자인 토큰

이 문서는 색·간격·타이포 값과 레이아웃 기준값을 기록한다. 화면 구성과 정보 구조는 [디자인 컨셉](design-concept.md)에 있다.

토큰은 `product/src/index.css`와 `prototype/style.css`의 `:root`에 같은 값으로 정의한다. 두 파일은 실행 환경이 달라 코드를 공유하지 않으므로, 값을 바꿀 때는 두 파일과 이 문서를 함께 갱신한다.

이 문서는 실제 서비스 `product/`와 정적 화면 검증용 `prototype/`에 적용한다. 독립적인 프로젝트 소개 화면인 `project-intro/`에는 적용하지 않는다.

## 색상·형태·글래스 토큰

```css
:root {
  --color-bg: #ECF5FF;
  --color-surface: rgba(255, 255, 255, 0.88);
  --color-surface-solid: #FFFFFF;
  --color-surface-soft: rgba(238, 246, 255, 0.86);
  --color-border: rgba(178, 204, 230, 0.68);
  --color-border-strong: rgba(150, 183, 215, 0.82);
  --color-text-primary: #111827;
  --color-text-secondary: #64748B;
  --color-text-muted: #94A3B8;

  --color-primary: #4F46E5;
  --color-primary-dark: #3730A3;
  --color-primary-light: #EEF2FF;
  --color-accent-blue: #0EA5E9;
  --color-accent-green: #16A34A;
  --color-accent-amber: #D97706;
  --color-accent-rose: #E11D48;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;

  --shadow-card: 0 14px 38px rgba(58, 91, 132, 0.11);
  --shadow-float: 0 18px 50px rgba(15, 23, 42, 0.12);
  --color-topbar: #171A46;
  --color-topbar-text: #FFFFFF;
  --color-topbar-muted: #C9CCE3;
  --glass-surface: rgba(255, 255, 255, 0.76);
  --glass-surface-strong: rgba(255, 255, 255, 0.88);
  --glass-border: rgba(255, 255, 255, 0.92);
  --glass-blur: 18px;

  --font-sans: "Pretendard", "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif;
}
```

기본 글꼴은 `Pretendard`, `Apple SD Gothic Neo`, `Segoe UI`, `Roboto` 순서다.

## 레이아웃 기준

- `.top-bar`는 `position: sticky`로 상단에 고정하며 최소 높이는 `72px`이다.
- `.app-shell`은 가운데 정렬 컨테이너이며 폭은 `min(1180px, calc(100% - 48px))`이다.
- `.reader-layout`은 통계 분석·채용공고 해석·합격 전략·준비 로드맵의 본문·목차 레이아웃이다. 폭은 `min(1500px, calc(100% - 48px))`, 열은 본문 `980px`과 목차 `220px`, 열 간격은 `32px`이다.
- 본문 컨테이너는 `.page`가 최대 폭 `760px`, 목차를 곁에 두는 `.page--wide`가 최대 폭 `980px`이다.
- `.floating-nav`는 `position: sticky`로 상단에서 `96px` 떨어진 자리에 고정한다.
- 화면 폭 `1350px` 이상에서는 본문을 화면 중앙 열에 두고 `.floating-nav`를 오른쪽 열에 둔다.
- `1040px` 이하에서는 본문을 `minmax(0, 1fr)` 단일 열로 전환하고, 목차는 상단의 가로 스크롤 형태로 바꾼다.
- 넓은 표는 본문 폭을 늘리지 않고 전용 컨테이너 안에서만 가로로 스크롤한다. 모바일 히트맵은 기업군 열을 고정한다.
- `760px` 이하에서는 제목·설명·상단 단계 표시의 글자 크기를 줄이고, `360px` 이하에서 한 단계 더 줄인다.
- `1050px` 이상에서는 `html { zoom: 0.9; }`을 적용해 데스크톱 리포트의 표시 밀도를 조정한다.

## 구성 요소 규칙

- `.top-bar`: 짙은 인디고 배경과 흰색 워드마크를 사용해 앱의 전역 내비게이션을 본문과 분리한다.
- `.floating-nav`: 반투명 흰색 글래스 배경, 테두리, 블러를 사용한다.
- `.panel`, `.metric-card`, `.source-card`, `.roadmap-card`, `.job-select-card`, `.notice-card`, `.scope-switch`와 통계 그래프·세부 정보 카드는 반투명 흰색, 흰색 테두리, 블러와 `--shadow-card`를 결합한 공통 글래스 재질을 사용한다.
- 직무 선택 미리보기는 인디고·블루 계열의 저채도 면색으로 통일한다. 통계 분석·합격 전략·준비 로드맵의 상단 KPI 카드는 같은 블루 글래스 면을 사용하고, 상태 차이는 숫자·배지·그래프의 의미색으로 표시한다.
- 표와 긴 공고 원문은 `--glass-surface-strong`을 사용해 일반 본문 카드보다 불투명하게 표시한다.
- `.metric-grid`: 지표 카드를 한 줄에 5개 배치하며, 변형 `.metric-grid--4`는 4개 열을 사용한다.
- `.combination-grid`: 함께 요구되는 기술 조합 3개를 비교한다.
- `.split-grid`: 필수 요구사항과 우대사항을 나란히 보여 준다.
- 준비 로드맵 타임라인은 단계를 세로 흐름으로 쌓고, 항목마다 `30px` 원형 마커와 연결선을 둔다. 실행 환경별 클래스명은 달라도 이 형태와 크기를 따른다.
- `.scope-switch`: 범위 전환 블록이다. 각 단(`.scope-switch__tier`)은 왼쪽 `62px` 이름 열과 선택지 열로 나누고, `860px` 이하에서는 두 열을 세로로 쌓는다.
- `.notice-card`: 활성 분석 결과가 없는 직무의 안내 카드이며 최대 폭은 `620px`이다.
- 내 공고 직접 분석 섹션의 `.pa-*` 클래스는 `product/src/components/posting-analyze.css`에만 정의하고, 색·반경·그림자는 이 문서의 토큰만 사용한다.
- 채용공고 해석·합격 전략 화면에 추가되는 컴포넌트(항목 카드, 체크리스트 표)도 동일한 카드·표 규칙과 토큰을 따른다.

## 참고

- [디자인 컨셉](design-concept.md)
- [서비스 CSS](../product/src/index.css)
- [프로토타입 CSS](../prototype/style.css)
