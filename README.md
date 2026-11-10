# confiSort
# AI 분리배출 도우미 (AI Recycling Assistant for South Korea)

> **사진 한 장으로, 한국의 올바른 분리배출 방법을 공식 데이터와 AI를 통해 쉽고 정확하게 안내하는 서비스**

* 프로젝트 소개(배경/목표/핵심 컨셉/기능/아키텍처/기술 스택)는 [`./docs/ABOUT_PROJECT.md`](./docs/ABOUT_PROJECT.md) 참고.
* 개발 컨벤션(코드 스타일, 커밋 메시지 규칙)은 [`./docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) 참고.
* 현재 구현 진행 상황은 [`./docs/TASK.md`](./docs/TASK.md) / [`./docs/backlog.md`](./docs/backlog.md) 참고.

---

# 서비스 흐름

```mermaid
flowchart TD
    A[홈 화면] --> B{사진 촬영 또는 검색}
    B -->|사진 촬영·업로드| C[AI 물체 인식]
    B -->|품목명 검색| D[검색 결과 목록]
    C --> E[인식 결과 확인 화면]
    D --> E
    E -->|일치하는 품목 없음| D
    E -->|일치하는 품목 확인| F[배출 방법 안내 화면]
    F --> G{지역 설정 여부}
    G -->|미설정| H[지역 선택: 시/도 → 구/군 → 동]
    H --> I[지역별 배출 규정 확인]
    G -->|설정됨| I
    A --> J[대형폐기물 신고 / 주변 수거함 안내]
```
