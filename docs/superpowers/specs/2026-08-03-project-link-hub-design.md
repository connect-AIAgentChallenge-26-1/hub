# README와 제출 PR 링크 허브 설계

## 목표

처음 보는 사람이 README와 제출 PR에서 서비스, 발표 자료, 제품 문서와 작업 기록을 바로 열 수 있게 한다. README는 전체 링크의 기준 문서로 사용하고, 제출 PR은 검토에 필요한 링크를 짧게 요약한다.

## 정보 구조

### README

프로젝트 소개 문단 다음, `프로젝트 목적` 앞에 `프로젝트 링크` 섹션을 추가한다. 표는 `구분`, `링크` 두 열로 구성하고 다음 항목을 제공한다.

| 구분          | 링크 또는 상태                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 서비스 배포   | `https://hub-ppre1udes-projects.vercel.app`                                                                                                           |
| 부스 슬라이드 | `https://www.figma.com/deck/VSnnmq8V2lNaXvjN4QblGS/%EC%95%84%EB%A7%9E%EB%8B%A4--%EB%B6%80%EC%8A%A4-%EC%8A%AC%EB%9D%BC%EC%9D%B4%EB%93%9C?node-id=1-42` |
| 데모 영상     | `준비 중`                                                                                                                                             |
| 프로젝트 관리 | `https://semicolon-master.notion.site/AI-Agent-Challenge-396f551ebf238005a7fcfbe20555c4bd`                                                            |
| 소스 코드     | `https://github.com/ppre1ude/hub`                                                                                                                     |
| 제품 문서     | `https://github.com/ppre1ude/hub/wiki`                                                                                                                |
| 작업 이슈     | `https://github.com/ppre1ude/hub/issues`                                                                                                              |
| 백로그        | `https://github.com/users/ppre1ude/projects/3`                                                                                                        |
| 쇼케이스      | `https://github.com/ppre1ude/hub/blob/main/showcase/showcase.json`                                                                                    |
| 개발 방식     | `https://github.com/ppre1ude/hub/blob/main/docs/ai-development-workflow.md`                                                                           |

표의 링크 문구는 URL 원문이 아니라 `Production`, `Figma`, `Notion`, `GitHub 저장소`, `Wiki`, `GitHub Issues`, `GitHub Project`, `showcase.json`, `AI Agent Workflow`처럼 목적을 드러내는 이름을 사용한다. 아직 없는 데모 영상에는 빈 링크를 만들지 않고 `준비 중`이라고 표시한다.

기존 `문서 색인`은 제품 문서와 구현 문서의 세부 탐색 경로이므로 유지한다. 링크 허브는 빠른 진입점이고 문서 색인은 세부 목차다.

### 제출 PR

PR 본문의 `주요 작업 리스트` 앞에 `최종 결과물` 섹션을 추가한다. README보다 짧게 다음 항목을 제공한다.

- 서비스 배포
- 부스 슬라이드
- 데모 영상 상태
- 소스 코드
- 제품 Wiki
- 프로젝트 관리 Notion
- GitHub Issues와 GitHub Project

PR은 제출 시점의 검토용 스냅샷이므로 쇼케이스 파일과 개발 방식 문서까지 반복하지 않는다. 해당 세부 자료는 소스 코드와 README에서 이어서 확인할 수 있다.

## 저장소 구분

- 개발 본체와 모든 공개 문서의 기준 저장소는 `ppre1ude/hub`다.
- 제출용 Fork인 `ppre1ude/hub-challenge`는 링크 허브에 노출하지 않는다.
- 원본 제출 PR은 Fork 연결 정보만으로 제출 경로를 보여준다.

## 갱신 원칙

- 배포 주소나 문서 위치가 바뀌면 README 링크 허브를 먼저 갱신한다.
- PR의 링크는 해당 제출을 설명하는 시점의 주소로 유지한다.
- 데모 영상이 완성되면 README와 열려 있는 제출 PR의 `준비 중`을 실제 링크로 교체한다.
- 공개 권한이 없는 Figma 또는 Notion 주소는 링크 허브에 두지 않는다.

## 검증

- Markdown 표가 GitHub에서 깨지지 않는지 확인한다.
- README에 추가한 URL이 의도한 서비스와 문서를 가리키는지 확인한다.
- 데모 영상 항목에 빈 링크가 없는지 확인한다.
- README의 기존 문서 색인과 계획 관리 안내가 유지되는지 확인한다.
- 제출 PR의 base와 head 브랜치, 기존 검증 결과와 주요 작업 설명이 유지되는지 확인한다.

## 제외 범위

- 데모 영상 제작과 업로드
- Figma 또는 Notion 문서 내용 수정
- 쇼케이스 JSON 구조와 문구 수정
- GitHub Wiki, Issues와 Project 내용 재구성
