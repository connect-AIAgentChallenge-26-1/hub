# CLAUDE.md

이 프로젝트의 공통 AI 작업 지침은 @AGENTS.md를 기준으로 한다.

## 핵심 요약

- 서비스는 네이버지도 기반 식당 리뷰 서비스다.
- 차별점은 영수증 OCR 인증 리뷰, 좋아요 기반 가중 별점, 90일 부스트, 네이버지도형 업체 상세 UI다.
- 현재 저장소는 CRA 기반 React 프로젝트이며, 무단으로 Next.js 전환을 하지 않는다.
- 본격 구현 전까지 @plan.md, @checklist.md, @docs/design-system.md, @docs/dev-setup.md를 우선 참고한다.
- 디자인 작업은 @docs/skills/trusted-place-design/SKILL.md의 톤과 컴포넌트 규칙을 따른다.

## 절대 지킬 것

- 방문 인증 없는 리뷰를 집계하지 않는다.
- 예약 기능을 핵심 서비스처럼 임의 확장하지 않는다.
- 외부 UI 라이브러리나 대규모 프레임워크 변경은 먼저 합의한다.
- UI 문구는 한국어를 기본으로 작성한다.
