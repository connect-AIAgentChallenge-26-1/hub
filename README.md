# Campus Flow | 대학 버스 혼잡도 대시보드

대학 캠퍼스 정류장별 버스 혼잡도를 비교하고, 시간대별 혼잡 패턴을 한눈에 확인하는 웹 대시보드입니다.

학생이 이동 전 정류장의 혼잡도를 살펴보고 더 여유로운 정류장을 선택할 수 있도록, 캠퍼스 지도·정류장 비교·24시간 패턴을 하나의 화면에 제공합니다.

> 현재 혼잡도는 수업 시간과 이동량 패턴을 반영한 **예측 데이터**입니다. 실제 버스 위치·도착 정보 API는 향후 연동 예정입니다.

## 배포 사이트

[Campus Flow 열기](https://campus-flow-bus-dashboard-kr.kjh62879078.chatgpt.site)

사이트는 현재 공유 대상만 접근할 수 있는 비공개 설정입니다.

## 주요 기능

- **캠퍼스 전환** — 경북대, 부산대, 전남대, 충남대, 전북대 선택
- **캠퍼스 지도** — 지도 위 정류장을 선택하면 관련 그래프가 즉시 갱신
- **시간대 비교** — 드래그 슬라이더로 0시부터 23시까지 정류장 혼잡도를 비교
- **24시간 패턴** — 선택한 정류장의 시간대별 혼잡도를 색상 막대그래프로 표시
- **반응형·접근성** — 모바일 터치와 키보드 조작 지원

## 프로젝트 구성

| 경로 | 설명 |
| --- | --- |
| [`campus-bus-congestion-dashboard/`](./campus-bus-congestion-dashboard/) | Campus Flow 웹 애플리케이션 소스 |
| [`campus-bus-congestion-dashboard/src/`](./campus-bus-congestion-dashboard/src/) | 대시보드 UI·데이터·상호작용 코드 |
| [`campus-bus-congestion-dashboard/project/`](./campus-bus-congestion-dashboard/project/) | 초기 디자인 및 기획 참고 자료 |
| [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) | 기존 주간 프로젝트 계획 |

## 실행 방법

```bash
cd campus-bus-congestion-dashboard
npm install
npm run dev
```

## 기술 구성

- React 19 + TypeScript
- vinext + Cloudflare Workers 호환 배포 구성
- CSS Modules
- SVG 기반 캠퍼스 일러스트 지도

## 작성자

N056_김진영
