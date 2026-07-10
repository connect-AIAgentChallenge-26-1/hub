# Material Conflict Review Skill

## Purpose

입력 원본, 확정 설계, 승인 대기 항목 사이의 차이를 검토한다.

## Authority

- `reference`: 초안 작성에 사용할 수 있지만 프로젝트 사실로 자동 확정하지 않는다.
- `authoritative`: 사용자가 중요한 기준 자료로 지정했음을 뜻한다.

authority는 근거 우선순위를 설명할 뿐 승인 경계를 바꾸지 않는다. authoritative
자료도 확정 설계와 충돌하면 변경안과 사용자 판단이 필요하다.

## Review Rules

1. 원본의 주제, 명시된 사실, 모호한 표현을 분리한다.
2. 같은 주제의 확정 설계와 승인 대기 항목을 검색한다.
3. 일치, 추가 가능, 직접 충돌, 해석 불가로 구분한다.
4. 여러 원본이 다르면 source ID, authority, 근거 위치별로 차이를 표시한다.
5. 기존 문서와 자연스럽게 통합되면 update, 독립 주제면 create 후보로 둔다.
6. 충돌을 임의로 해결하거나 authoritative 자료로 확정 설계를 덮어쓰지 않는다.

## Output

- source ID와 authority
- 일치하는 기존 설정
- 충돌 내용과 근거 위치
- create 또는 update 후보와 이유
- 사용자 확인이 필요한 선택

