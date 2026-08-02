# Design Tokens — 소상공인 정부지원금 큐레이터

출처: `src/prototype/gov_subsidy_home_wireframe.html`

## Color

| Token | Value | Usage |
|-------|-------|-------|
| `--navy` | `#0A2540` | 헤더, 질문 제목, active chip 배경 |
| `--navy-soft` | `#1E4976` | (예비) 보조 네이비 |
| `--blue` | `#2563EB` | CTA, 선택 상태, 링크, 매칭도 |
| `--blue-soft` | `#EEF4FC` | hover/selected 배경, focus ring |
| `--bg` | `#F5F7FA` | 페이지·카드 배경 |
| `--white` | `#FFFFFF` | 앱 프레임, 카드 |
| `--border` | `#E1E5EB` | 구분선, disabled 버튼 |
| `--text` | `#1a1a1a` | 본문 |
| `--text-sub` | `#666` | 보조 텍스트 |
| `--text-muted` | `#999` | 힌트, step 번호 |
| `--danger` | `#DC2626` | 긴급 D-day, 알림 dot |
| `--danger-bg` | `#FEE2E2` | 긴급 D-day 배경 |
| `--success` | `#16A34A` | 완료 체크, 여유 D-day |
| `--success-bg` | `#DCFCE7` | 완료 아이콘 배경 |
| `--warning` | `#D97706` | 임박(soon) D-day |
| `--warning-bg` | `#FEF3C7` | 임박(soon) D-day 배경 |
| `--neutral` | `#6B7280` | D-day 없음(상시/소진시까지) 뱃지 (#82) |
| `--neutral-bg` | `#F3F4F6` | D-day 없음 뱃지 배경 |

PC 바깥 배경: `#E8ECF1`

## Typography

- **Font**: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, sans-serif`
- **CDN**: jsDelivr Pretendard v1.3.9 variable subset

| Role | Size | Weight | Color |
|------|------|--------|-------|
| Welcome H1 | 22px | 600 | white |
| Step question | 20px | 600 | navy |
| Detail title | 20px | 600 | white |
| Card title | 15px | 500 | navy |
| Body / option | 14px | 400 | text |
| Hint / meta | 13px | 400 | text-sub |
| Tab label | 11px | 400/500 | text-muted / blue |
| Step num | 12px | 400 | text-muted |

Line-height: `1.5` (body), 질문/제목 `1.4`

## Spacing & Radius

| Element | Padding / Gap | Border-radius |
|---------|---------------|---------------|
| App frame (PC) | — | 24px |
| Screen horizontal | 20px | — |
| Welcome | 40px 32px | — |
| Option button | 14px 16px | 10px |
| Grid option | 12px | 10px |
| Primary CTA | 14px vertical | 10–12px |
| Home card | 16px | 12px |
| Filter chip | 8px 16px | 8px |
| Detail stat | 14px | 10px |
| Progress bar | gap 6px, height 4px | 2px |

## Shadow

- PC app frame: `0 8px 32px rgba(10, 37, 64, 0.12)`

## Layout

- Mobile: full viewport, `.app` min-height 100vh
- Desktop (≥480px): centered 390×844px frame, scroll inside frame
- Detail bottom CTA: `position: absolute; bottom: 0` + body `padding-bottom: 100px`

## Animation

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes popIn {
  0%   { transform: scale(0); }
  70%  { transform: scale(1.15); }
  100% { transform: scale(1); }
}
```

Screen transition: `fadeIn 0.25s ease`
Complete check: `popIn 0.4s ease`
Button active: `scale(0.97)` / card active: `scale(0.98)`

## Component States

### OptionButton (`.opt`)
- default: white bg, `--border` border(1px)
- hover: `--blue` border(1px) — 배경은 안 바뀜(white 그대로), `@media (hover: hover) and
  (pointer: fine)`로 감싸 실제 마우스/트랙패드 기기에만 적용(이슈 #102 — 터치 전용 기기는
  탭이 :hover를 흉내 내고 안 풀리는 "sticky hover" 현상이 있어 이 가드가 없으면 모바일에서
  선택 해제해도 hover 스타일이 남음)
- selected: `--blue` border(1px), `--blue-soft` bg, `--blue` text, font-weight 500
- 이슈 #92 후속: 원래 hover도 `--blue-soft` bg를 같이 썼는데, 복수선택에서 같은 버튼을 다시
  눌러 해제할 때 마우스가 버튼 위에 남아있으면 hover가 selected처럼 보이는 문제가 있었다.
  배경 채움을 selected 전용 신호로 만들어 hover와 selected가 절대 겹치지 않게 함(체크마크
  아이콘, border-width 2px 둘 다 사용자 피드백으로 되돌리고 배경 채움만 남김)

### FilterChip (`.home-chip`)
- default: white, `--text-sub`
- hover: `--blue` border+text
- active: `--navy` bg, white text

### Primary Button (`.btn-next`, `.btn-start`, `.btn-apply`)
- enabled: `--blue` bg, white text
- disabled: `--border` bg, `--text-muted` text
