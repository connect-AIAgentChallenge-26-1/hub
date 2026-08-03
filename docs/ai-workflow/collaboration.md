# CareerSignal AI 협업 구조

## 1. 핵심 메시지

CareerSignal의 개발 협업은 하나의 AI가 계획부터 배포까지 결정하는 구조가 아니다. Claude와 Codex는 같은 프로젝트 규칙을 공유하고, 계획·기능 검증·코드 리뷰 Agent와 디자인·테스트 Skill을 단계별로 사용한다. 사용자는 각 승인 지점에서 작업 범위와 반영 여부를 결정한다.

## 2. 사용 관계

```mermaid
flowchart TD
    RULE[/"AGENTS.md<br/>공통 프로젝트 규칙"/]
    USER(["사용자 요구"])
    PLAN{{"Planner Agent<br/>작업 분해 · 수용 기준"}}
    MAIN{{"Claude · Codex<br/>승인 범위 구현"}}
    SKILL[["Design · Test Skills<br/>디자인 · 테스트 절차"]]
    CHECK{{"Feature Verifier · Code Reviewer<br/>기능 검증 · 코드 리뷰"}}
    RESULT(["사용자 피드백<br/>최종 판단"])

    USER -->|"요구사항"| PLAN
    RULE -->|"공통 규칙 적용"| PLAN
    PLAN -->|"사용자가 계획 승인"| MAIN
    MAIN -->|"필요 시 사용"| SKILL
    SKILL -.->|"절차 제공"| MAIN
    MAIN -->|"구현 결과"| CHECK
    CHECK -->|"검증 · 리뷰 보고"| RESULT
    RESULT -.->|"수정 피드백"| MAIN
```

| 도형 | 의미 |
| --- | --- |
| 평행사변형 | 모든 단계가 공유하는 규칙 문서 |
| 육각형 | 판단하는 Agent |
| 서브루틴 | Agent가 불러 사용하는 Skill |
| 스타디움 | 사용자 접점과 종료 상태 |

## 3. Claude와 Codex의 공통 기준

```mermaid
flowchart LR
    COMMON[(".agents<br/>공통 Agent · Skill 정의")]
    CLAUDE[".claude<br/>Claude 전용 어댑터"]
    CODEX["Codex<br/>공통 정의 직접 사용"]
    GUIDE[/"AGENTS.md<br/>프로젝트 규칙"/]

    GUIDE --> CLAUDE
    GUIDE --> CODEX
    COMMON --> CLAUDE
    COMMON --> CODEX
```

| 도형 | 의미 |
| --- | --- |
| 평행사변형 | 프로젝트 규칙 문서 |
| 원통 | 공통 Agent·Skill 정의 저장 위치 |
| 사각형 | 도구별 어댑터와 사용 주체 |

Claude와 Codex의 파일 형식은 다르지만 역할, 절차, 출력 형식은 `.agents`의 공통 정의를 따른다. `CLAUDE.md`는 `AGENTS.md`를 참조하고 `.claude`의 파일은 대응하는 `.agents` 정의를 불러온다.

## 4. 전시 설명

CareerSignal은 Claude와 Codex를 오가며 개발하므로 도구마다 계획과 검증 기준이 달라지지 않도록 공통 규칙을 둔다. Planner가 작업과 수용 기준을 정리하고 사용자가 범위를 승인한다. 주 작업 Agent는 필요할 때 디자인과 테스트 Skill을 사용하며, Feature Verifier와 Code Reviewer가 결과를 독립적으로 점검한다. 검증이나 리뷰에서 수정이 필요하면 구현 단계로 돌아가고 사용자가 최종 반영 여부를 결정한다.
