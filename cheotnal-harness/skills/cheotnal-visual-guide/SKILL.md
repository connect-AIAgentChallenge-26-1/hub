---
name: cheotnal-visual-guide
description: '"첫날" 앱(신입 알바 온보딩 AI 매니저)의 시각 가이드(화면 따라하기) 컴포넌트를 만들거나 수정할 때 반드시 사용하는 렌더링 규칙. 이미지 위에 빨간 마커·화살표·딤 처리·CTA를 어떤 HTML/CSS 구조로 그리는지, 컴포넌트 props가 무엇인지 고정한다. 시각 가이드, 화면 따라하기, 스텝 이미지, 포스기 절차 안내 등 이미지 위에 표시를 얹는 화면 작업이라면 항상 이 스킬을 먼저 확인한다. cheotnal-design 스킬의 3-4 원칙(1장 1클릭, 빨간 테두리, 55% 딤, CTA 5단어 이하)의 구현 방법을 이 스킬에서 담당한다.'
---

# 첫날 시각 가이드 스킬

**목적**: 시각 가이드 화면이 매번 다른 방식으로 그려지는 걸 막는다. 디자인 원칙(design 스킬 3-4)은 원칙만 있고 구현 방법이 없어서, 이 스킬이 HTML 구조·CSS·컴포넌트 API를 값으로 고정한다.

## 0. 데이터는 어디서 오나

`VisualGuide` 스키마는 **cheotnal-mock-data 스킬**에 정의돼 있다. 이 스킬은 그 데이터를 화면에 그리는 방법만 다룬다. 필드가 헷갈리면 mock-data 스킬을 먼저 본다.

핵심 필드 요약:

```js
{
  steps: [
    {
      image: "/images/pos-step1.png",
      marker: { x: 62, y: 78, w: 22, h: 10 },  // % 단위
      arrow: "down",
      cta: "우측 하단 [설정] 클릭"
    }
  ]
}
```

## 1. 컴포넌트 API (이 props를 그대로 쓴다)

**VisualGuidePage** — 전체 페이지. `visualGuideId`를 받아 mock에서 조회해 스텝을 세로로 나열.

```jsx
<VisualGuidePage visualGuideId="vg-001" />
```

**VisualGuideStep** — 스텝 하나. 카드 형태로 세로 스크롤 안에 쌓인다.

```jsx
<VisualGuideStep
  stepIndex={0}          // 0부터. "1단계"로 표시할 때 +1
  image="/images/pos-step1.png"
  marker={{ x: 62, y: 78, w: 22, h: 10 }}  // % 단위
  arrow="down"           // "up" | "down" | "left" | "right"
  cta="우측 하단 [설정] 클릭"
/>
```

## 2. HTML/JSX 구조 (이 골격을 그대로 쓴다)

한 스텝은 3층으로 쌓인다: **이미지 → 딤 오버레이(마커 구멍) → 마커·화살표·CTA**.

```jsx
// client/src/components/VisualGuideStep.jsx
export function VisualGuideStep({ stepIndex, image, marker, arrow, cta }) {
  return (
    <div className="vg-step">
      <div className="vg-step-num">{stepIndex + 1}단계</div>

      {/* 이미지 컨테이너: position: relative의 기준점 */}
      <div className="vg-image-wrap">
        <img src={image} alt="" className="vg-image" />

        {/* 딤: 이미지 전체를 55% 어둡게 (마커 영역은 CSS로 뚫음) */}
        <div className="vg-dim" />

        {/* 빨간 마커 테두리: marker 좌표 위에 절대 위치 */}
        <div
          className="vg-marker"
          style={{
            left: `${marker.x}%`,
            top: `${marker.y}%`,
            width: `${marker.w}%`,
            height: `${marker.h}%`,
          }}
        />

        {/* 화살표: 마커 옆에 방향대로 붙임 */}
        <VgArrow marker={marker} direction={arrow} />
      </div>

      <div className="vg-cta">{cta}</div>
    </div>
  );
}
```

## 3. CSS 규칙 (값을 그대로 쓴다)

```css
/* client/src/components/VisualGuideStep.css */
.vg-step {
  background: var(--surface);
  border: 0.5px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}

.vg-step-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand);
  background: var(--brand-soft);
  padding: 3px 10px;
  border-radius: 6px;
  display: inline-block;
  margin-bottom: 12px;
}

.vg-image-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  /* 크롭 금지 원칙: 이미지의 1/4~1/2 맥락 유지. 
     너무 좁게 자른 스크린샷을 받으면 그대로 렌더링하되 편집자에게 경고. */
}

.vg-image {
  width: 100%;
  display: block;
}

/* 딤: 55% 어둡게. 마커 위치를 뚫는 게 아니라 마커를 위에 얹는 방식 */
.vg-dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

/* 빨간 마커: 4px 테두리, --mark 토큰 (design 스킬 1번) */
.vg-marker {
  position: absolute;
  border: 4px solid var(--mark);   /* #E4322B */
  border-radius: 6px;
  box-shadow: 0 0 0 2px rgba(228, 50, 43, 0.25);  /* 아주 옅은 후광, 딤 위에서 눈에 띄게 */
  pointer-events: none;
}

/* CTA: 5단어 이하, 스텝 카드 하단 */
.vg-cta {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
  letter-spacing: -0.02em;
}
```

## 4. 화살표 (VgArrow 구현)

방향별로 마커 바깥쪽에 붙는다. 마커 좌표에서 계산.

```jsx
function VgArrow({ marker, direction }) {
  // 마커 바깥으로 12% 떨어진 위치에 화살표 아이콘을 얹는다
  const pos = {
    up:    { left: `${marker.x + marker.w / 2}%`, top: `${marker.y - 12}%`, rotate: 180 },
    down:  { left: `${marker.x + marker.w / 2}%`, top: `${marker.y + marker.h + 2}%`, rotate: 0 },
    left:  { left: `${marker.x - 8}%`,             top: `${marker.y + marker.h / 2}%`, rotate: 90 },
    right: { left: `${marker.x + marker.w + 2}%`,  top: `${marker.y + marker.h / 2}%`, rotate: -90 },
  }[direction];

  return (
    <div
      className="vg-arrow"
      style={{
        left: pos.left,
        top: pos.top,
        transform: `translate(-50%, -50%) rotate(${pos.rotate}deg)`,
      }}
    >
      ▲  {/* 실제로는 SVG 삼각형 권장. 색은 --mark */}
    </div>
  );
}
```

```css
.vg-arrow {
  position: absolute;
  color: var(--mark);
  font-size: 22px;
  font-weight: 900;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.4);  /* 딤 위에서 화살표가 죽지 않게 */
  pointer-events: none;
}
```

## 5. 원칙 → 구현 매핑 (design 스킬 3-4의 4원칙이 여기서 어떻게 지켜지는지)

| 원칙 (design 스킬) | 어디서 강제되는가 |
|---|---|
| 1장 1클릭 | `VisualGuideStep`은 `marker`를 배열이 아닌 객체로만 받는다. 2개 못 넣게 타입이 막는다. |
| 굵은 빨간 테두리 + 화살표 | `.vg-marker`의 `border: 4px solid var(--mark)`, `VgArrow` 컴포넌트가 항상 렌더 |
| 55% 딤 | `.vg-dim`의 `rgba(0, 0, 0, 0.55)` 고정값 |
| 크롭 금지 | 이미지 컨테이너는 `overflow: hidden`이지만 스케일링 없이 원본 비율 유지 |
| 세로 스텝 | `VisualGuidePage`가 `steps.map`을 flex-column으로 쌓음 |
| CTA 5단어 이하 | `cta` prop을 렌더할 때 공백 기준 단어 수를 검사, 6단어 이상이면 콘솔에 경고 (개발 편의) |

CTA 검증 예시:

```jsx
if (cta.trim().split(/\s+/).length > 5) {
  console.warn(`[VisualGuide] CTA는 5단어 이하여야 합니다: "${cta}"`);
}
```

## 6. 하면 안 되는 것

- 한 스텝에 마커를 2개 이상 넣지 않는다. 필요하면 스텝을 나눈다.
- 마커 위치를 px로 지정하지 않는다. 항상 %. (mock-data 스키마 규칙)
- 딤을 60%나 50%로 조정하지 않는다. 55% 고정 (원칙 지키는 게 우선).
- CTA에 이모지 붙이지 않는다 (design 스킬 4번 어투 규칙, "이모지 남발 금지").
- 이미지를 `background-image`로 넣지 않는다 (스크린 리더·crop 계산 문제). 항상 `<img>` 태그.

## 7. 체크리스트

1. 이미지 컨테이너에 `position: relative`가 있는가?
2. 마커 좌표가 % 단위인가?
3. `--mark` 토큰(빨강)을 마커·화살표 이외의 용도로 쓰고 있지 않은가?
4. 한 스텝에 마커가 정확히 1개인가?
5. CTA가 5단어 이하인가?
6. 데이터를 mock-data 스킬의 `VisualGuide` 스키마에서 가져오는가?
