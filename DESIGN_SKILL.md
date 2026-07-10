# DESIGN_SKILL.md

# 오늘의 냉장고 UI Design Skill

이 문서는 `오늘의 냉장고` 웹 애플리케이션을 수정하거나 확장할 때 GitHub Agent와 개발자가 반드시 참고해야 하는 디자인 작업 기준입니다. 새로운 UI 방향을 만들기보다, 아래 원칙을 유지하면서 기능 화면을 일관되게 다듬습니다.

## 1. Product Identity

**서비스 이름:** 오늘의 냉장고

**핵심 컨셉:** Warm Kitchen & Fresh Management

오늘의 냉장고는 자취생이 집에 있는 재료를 등록하고, 유통기한이 임박한 재료를 먼저 확인하며, 보유 재료 기반 식단과 레시피를 추천받는 생활 밀착형 웹서비스입니다.

디자인은 전문적인 업무용 관리자 화면보다 따뜻하고 친근한 주방 대시보드에 가까워야 합니다. 정보는 명확해야 하지만 차갑거나 복잡해 보이면 안 됩니다.

## 2. Current UI Direction

현재 UI는 Google Stitch 시안을 바탕으로 한 **대시보드형 웹사이트**입니다.

첫 화면의 중심은 `내 냉장고`입니다.

구성 우선순위는 다음과 같습니다.

1. 상단 네비게이션
2. 내 냉장고 제목과 간단한 설명
3. 핵심 요약 카드 3개
4. 왼쪽 재료 추가 입력 패널
5. 오른쪽 재료 보드 그리드
6. 다른 워크스페이스: 식단 추천, 레시피, 구매 추천

이 구조를 유지하고, 불필요한 랜딩 페이지식 Hero를 다시 크게 만들지 않습니다.

## 3. Layout Rules

### Page Width

- 기본 콘텐츠 최대 폭은 `1120px` 내외를 유지합니다.
- 데스크톱 화면에서 중앙 정렬합니다.
- 좌우 여백은 최소 `28px` 이상 유지합니다.

### Header

- 상단 Header는 사이트형 네비게이션으로 구성합니다.
- 왼쪽: `오늘의 냉장고` 브랜드명
- 가운데/오른쪽: `서비스 소개`, `내 냉장고`, `식단 추천`, `레시피`, `구매 추천`
- 오른쪽 끝 CTA: `재료 등록하기`
- Header 높이는 약 `64px`를 기준으로 합니다.
- Header 배경은 따뜻한 크림 톤을 유지하고, 얇은 하단 border를 사용합니다.

### Main Dashboard

`내 냉장고` 화면은 다음 2열 구조를 유지합니다.

- 왼쪽: 재료 추가/수정 패널, 약 `300px`
- 오른쪽: 재료 보드 패널, 남은 공간 전체

요약 카드는 상단에 3열로 배치합니다.

- 임박 재료 알림
- 신선한 재료
- 추천 가능 메뉴

## 4. Color Tokens

CSS `:root`에는 아래 색상 계열을 유지합니다.

```css
--primary: #006d36;
--primary-soft: #e8f5ee;
--secondary: #ff7e47;
--secondary-soft: #ffe7dc;
--warning: #e11d48;
--warning-soft: #ffe6ea;
--bg: #fff7f1;
--panel: #fff1e9;
--surface: #ffffff;
--text: #1a1c19;
--muted: #74716c;
--line: rgba(105, 72, 52, 0.1);
```

### Color Usage

- Primary green: 냉장고, 신선함, 정상 상태, 선택 상태
- Secondary orange: 주요 CTA, 재료 등록, 추천 액션, 따뜻한 강조
- Warning red: D-2 이하 유통기한 임박 재료, 삭제/경고 상태
- Background cream: 전체 페이지 배경
- Panel peach: 입력 패널과 보드 패널 배경
- Surface white: 실제 카드, 입력 필드, 타일 배경

## 5. Typography Rules

기본 폰트는 다음 순서를 유지합니다.

```css
font-family: "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
```

### Type Scale

- Page title: 32px~36px, 900 weight
- Section title: 18px~22px, 900 weight
- Card title: 18px~20px, 900 weight
- Body text: 13px~15px, 500~700 weight
- Label/badge: 11px~12px, 900 weight

텍스트는 좌측 정렬을 기본으로 합니다.

## 6. Shape, Shadow, Spacing

### Radius

- Large panel: `22px`
- Card/tile: `16px`
- Input/button: `12px`~`999px`
- Badge: `999px`

### Shadow

그림자는 매우 부드럽게 사용합니다.

```css
--shadow: 0 10px 30px rgba(93, 58, 34, 0.06);
```

강한 그림자나 검은 그림자를 과하게 쓰지 않습니다.

### Spacing

- 섹션 사이: 26px~34px
- 카드 사이: 16px~28px
- 카드 내부 padding: 18px~24px
- 입력 필드 간격: 12px~14px

## 7. Component Rules

### Header

Header는 얇고 단정해야 합니다. 브랜드명은 과하게 크지 않게, 네비게이션은 텍스트 중심으로 구성합니다.

CTA 버튼 `재료 등록하기`는 orange 배경의 pill 버튼입니다.

### Summary Card

요약 카드는 3개를 유지합니다.

각 카드에는 다음 정보만 넣습니다.

- 작은 label
- 큰 숫자/value
- 짧은 설명

`임박 재료 알림`은 warning 스타일을 사용합니다.

### Add Ingredient Panel

왼쪽 입력 패널은 항상 보이는 형태입니다.

포함 필드:

- 재료명
- 수량
- 유통기한
- 보관위치
- 분류
- 제출 버튼

수정 모드일 때는 제목을 `재료 수정`으로 바꾸고 버튼은 `수정 완료`로 표시합니다.

입력 패널 하단에는 Tip 박스를 유지할 수 있습니다.

### Ingredient Board

오른쪽 보드에는 보관 위치 필터와 재료 카드 그리드를 둡니다.

필터:

- 전체
- 냉장
- 냉동
- 실온

재료 카드는 2열 그리드를 기본으로 합니다.

카드 정보 우선순위:

1. D-day badge
2. 재료명
3. 수량 + 보관 설명
4. 보관위치 / 카테고리 / 먼저 사용 badge
5. 유통기한 날짜
6. 수정 / 삭제 버튼

### D-day Warning

D-2 이하 재료는 반드시 warning 스타일을 사용합니다.

- 카드 배경: `--warning-soft`
- D-day 배지: `--warning`
- `먼저 사용` 배지 표시

### Add Tile

재료 보드 마지막에는 `새 재료 추가` 타일을 둘 수 있습니다.

이 타일은 폼을 초기화하거나 재료 입력을 유도하는 역할입니다.

## 8. Workspace Rules

### 내 냉장고

가장 중요한 화면입니다. 정보 중심 대시보드로 구성합니다. 음식 사진이나 큰 장식 이미지는 사용하지 않습니다.

### 식단 추천

추천 카드는 3열 그리드를 유지합니다.

카드에는 다음 정보가 보여야 합니다.

- 추천 배지
- 메뉴명
- 추천 이유 요약
- 조리 시간
- 영양 균형
- 사용 재료 chip
- 부족 재료 chip
- `레시피 보기` 버튼

추천 배지는 orange 계열을 사용합니다.

### 레시피

레시피 상세는 웹 문서형으로 읽기 쉽게 구성합니다.

- 상단 요약 카드: 조리 시간, 난이도, 사용 재료
- 단계별 조리 과정은 step 카드 또는 번호 리스트
- 대체 재료 안내는 orange 안내 박스

### 구매 추천

부족 재료 카드에는 다음 정보를 표시합니다.

- 부족 재료 label
- 재료명
- 필요한 이유
- 사용될 메뉴
- 더미 구매 버튼

구매 버튼은 실제 결제처럼 과하게 보이지 않게, 프로토타입용 CTA로 유지합니다.

## 9. Interaction Rules

기존 기능은 삭제하지 않습니다.

반드시 유지할 기능:

- 재료 추가
- 재료 수정
- 재료 삭제
- 냉장/냉동/실온/전체 필터
- 유통기한 D-day 표시
- D-2 이하 강조
- 식단 추천 기준 탭
- 메뉴 카드 선택
- `레시피 보기` 클릭 시 레시피 화면 이동
- 레시피 상세 표시
- 부족 재료 구매 추천 표시

React에서는 `document.querySelector`나 직접 `addEventListener`를 사용하지 않습니다. 상태는 `useState`, 파생 데이터는 `useMemo`로 관리합니다.

## 10. Do Not

- 새로운 디자인 방향을 임의로 만들지 않습니다.
- 보라색/파란색 중심의 SaaS 대시보드처럼 바꾸지 않습니다.
- 큰 랜딩 Hero를 첫 화면의 중심으로 만들지 않습니다.
- `내 냉장고` 화면에 음식 사진이나 장식 이미지를 넣지 않습니다.
- 카드 radius를 작게 만들지 않습니다.
- D-2 이하 warning 색상을 흐리게 만들지 않습니다.
- 기존 기능을 삭제하지 않습니다.
- README, public, prototype, node_modules를 건드리지 않습니다.

## 11. Files To Edit

React UI 수정 시 기본 대상은 다음 파일입니다.

- `src/App.jsx`
- `src/App.css`

디자인 기준 수정 시 대상은 다음 파일입니다.

- `DESIGN_SKILL.md`

## 12. Quality Checklist

수정 후 아래를 확인합니다.

- `npm run build`가 성공하는가?
- 첫 화면이 Stitch 시안처럼 대시보드형으로 보이는가?
- 재료 추가 폼이 왼쪽에 고정적으로 잘 보이는가?
- 재료 카드가 오른쪽 2열 그리드로 정돈되는가?
- D-2 이하 재료가 빨간 배지와 warning 카드로 강조되는가?
- 식단 추천/레시피/구매 추천 탭 기능이 유지되는가?
- 한글 문구가 깨지지 않는가?
- Git status에서 의도한 파일만 변경되었는가?