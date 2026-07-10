# Document Type Selection Skill

## Purpose

프로젝트와 요청에 맞는 전문 template을 선택하고 필요한 문서 구성을 추천한다.

## Catalog

- `system`: 전투, 이동, 성장, 제작 등 플레이 규칙과 상태 변화
- `world_setting`: 세계 규칙, 지역, 세력, 역사
- `narrative`: 이야기 구조, 진행, 분기, 결과
- `character`: 플레이어 캐릭터, NPC, 적, 주요 인물
- `quest`: 퀘스트, 미션, 목표 기반 콘텐츠
- `item`: 장비, 소비품, 수집품, 보상 아이템
- `level`: 맵, 스테이지, 던전, 공간·조우 흐름
- `balance_economy`: 수치 밸런스, 재화, 획득·소모, 성장 곡선
- `ui`: 화면, HUD, 메뉴, 사용자 흐름
- `generic_fallback`: 위 타입에 자연스럽게 속하지 않는 장르 고유 기획

## Aliases

- NPC, 플레이어 캐릭터, 적 캐릭터 -> `character`
- 시나리오, 스토리, 플롯 -> `narrative`
- 맵, 스테이지, 던전 -> `level`
- 밸런스, 경제, 재화 -> `balance_economy`

## Selection Rules

1. 사용자가 타입을 명시했고 내용과 모순되지 않으면 해당 타입을 사용한다.
2. 요청의 목적과 기존 관련 문서를 확인한다.
3. 한 타입이 명확하면 자동 선택하고 사용자에게 사용 template을 알린다.
4. 두 타입 이상이 자연스러우면 후보와 분리 기준을 질문한다.
5. 어느 타입에도 맞지 않으면 generic fallback 이유를 제시한다.
6. 계획 밖 타입도 차단하지 않고 Document Plan 추가 여부를 확인한다.

## Project Recommendation

장르만으로 문서 구성을 결정하지 않는다. Project Brief의 장르, 핵심 플레이
경험, 주요 콘텐츠 특징을 함께 사용한다.

- 규칙과 반복 플레이가 있으면 `system`을 검토한다.
- 서사 진행이 있으면 `narrative`, 인물이 핵심이면 `character`를 검토한다.
- 목표·미션 구조가 있으면 `quest`를 검토한다.
- 획득·사용 가능한 대상이 있으면 `item`을 검토한다.
- 공간·스테이지 진행이 중요하면 `level`을 검토한다.
- 성장 수치, 재화, 가격이 중요하면 `balance_economy`를 검토한다.
- 별도 화면·HUD 흐름이 중요하면 `ui`를 검토한다.
- 세계 규칙이 게임 이해에 필요할 때만 `world_setting`을 검토한다.

모든 타입을 강제하지 않는다. 추천 결과에는 required, recommended, excluded와
각 이유를 포함하고 사용자가 최종 결정한다.

