# 오늘의 냉장고 (Today's Fridge) 디자인 가이드라인

이 문서는 `오늘의 냉장고` 서비스의 최종 확정된 디자인 방향을 정의합니다. 이후 모든 UI 개발 및 수정 시 이 문서를 우선 기술 표준으로 삼습니다.

## 1. Design Concept

**Warm Kitchen & Fresh Management**

- 자취생의 일상에 녹아드는 따뜻하고 친근한 주방 감성.
- 전문적인 도구보다는 생활 밀착형 대시보드 지향.
- 신선한 재료와 맛있는 식사가 조화를 이루는 비주얼 톤앤매너.

## 2. Layout Rule

- **Desktop Grid:** 최대 폭 1280px 중앙 정렬 레이아웃.
- **Section Spacing:** 섹션 간 80px~120px의 넉넉한 수직 여백으로 시각적 호흡 제공.
- **Navigation:** 상단 고정 헤더, height 80px 구조.
- **Card Grid:** 메인 콘텐츠는 3열 또는 4열 그리드 시스템 사용.
- **Container Margin:** 좌우 최소 24px(Mobile) / 80px(Desktop) 여백 확보.

## 3. Color Rule

- **Primary Green:** `#006D36` - 신선함, 건강, 냉장고 관리, 안정적 알림.
- **Secondary Orange:** `#FF7E47` - 추천 메뉴, 따뜻한 식사, 주요 CTA 버튼.
- **Warning Red:** `#E11D48` - 유통기한 임박(D-2 이하), 재료 부족, 경고.
- **Background:** `#FCFBF9` - 따뜻한 크림/베이지 톤의 베이스 컬러.
- **Surface:** `#FFFFFF` - 카드 및 입력 폼의 배경색.
- **Text Main:** `#1A1C19` - 깊은 차콜.
- **Text Sub:** `#5C5E5A` - 부드러운 그레이.

## 4. Typography Rule

- **Font Family:** `Plus Jakarta Sans`, `system-ui`, `sans-serif`.
- **Headline-L:** 40px / Bold.
- **Headline-M:** 32px / Bold.
- **Title-M:** 20px / Semibold.
- **Body-M:** 16px / Regular.
- **Label-S:** 12px / Bold.

## 5. Component Rule

- **Card:** `border-radius: 16px`, `box-shadow: 0 4px 20px rgba(0,0,0,0.05)`, `border: 1px solid rgba(0,0,0,0.03)`.
- **Button Primary:** Orange 배경, white 텍스트, 12px 이상 rounding.
- **Button Secondary:** Green 라인 또는 연한 green 배경.
- **Badge:** 둥근 타원형 형태, 텍스트와 배경색 대비로 상태 전달.
- **Input:** 옅은 베이지 배경 또는 1px 보더, focus 시 Primary Green 강조.

## 6. Screen Rule

1. **Home:** 서비스 아이덴티티를 보여주는 Hero와 핵심 기능 요약 카드 배치.
2. **내 냉장고:** 이미지를 뺀 정보 중심의 카드 리스트. 보관 장소별 탭 필터 제공.
3. **식단 추천:** 임박 재료 활용 메뉴를 강조 badge/border로 최상단 배치.
4. **레시피 상세:** 조리 단계를 명확한 넘버링과 함께 카드 형태로 순차 배치.
5. **구매 추천:** 부족한 재료를 한눈에 파악하고 구매 행동으로 이어지는 직관적 리스트.

## 7. AI Agent Design Rule

- 모든 UI 요소는 16px 이상의 둥근 모서리와 매우 부드러운 그림자를 사용하여 친근감을 유지한다.
- 유통기한 D-2 이하의 임박 정보는 반드시 `#E11D48` 컬러와 전용 D-day 배지를 사용하여 즉각적인 시각적 경고를 제공한다.
- 사용자의 주요 행동(등록, 보기, 구매)을 유도하는 버튼은 반드시 `#FF7E47` 주황색을 사용하여 서비스 내 액션 포인트의 일관성을 지킨다.
- 정보 밀도를 낮추기 위해 섹션 간 여백은 최소 80px 이상을 유지하며, 텍스트는 좌측 정렬을 기본으로 하여 가독성을 높인다.
- 이미지는 고품질 음식 사진을 사용하되, 대시보드성 화면인 `내 냉장고`에서는 텍스트 정보의 명확성을 위해 이미지를 생략한다.