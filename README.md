# 아맞다! 프로젝트

> **아맞다: 필요한 순간에 다시 꺼내보는 인사이트 저장소**

발견한 링크를 저장한 뒤, 필요할 때 제목·메모·카테고리와 현재 상황을 단서로 다시 찾는 개인 보관함입니다.

![아맞다 온보딩 화면](docs/assets/amadda-onboarding-hero.png)

## 프로젝트 링크

| 구분          | 링크                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 서비스 배포   | [아맞다 Production](https://hub-ppre1udes-projects.vercel.app)                                                                                               |
| 부스 슬라이드 | [Figma](https://www.figma.com/deck/VSnnmq8V2lNaXvjN4QblGS/%EC%95%84%EB%A7%9E%EB%8B%A4--%EB%B6%80%EC%8A%A4-%EC%8A%AC%EB%9D%BC%EC%9D%B4%EB%93%9C?node-id=1-42) |
| 데모 영상     | 준비 중                                                                                                                                                      |
| 프로젝트 관리 | [Notion](https://semicolon-master.notion.site/AI-Agent-Challenge-396f551ebf238005a7fcfbe20555c4bd)                                                           |
| 소스 코드     | [GitHub 저장소](https://github.com/ppre1ude/hub)                                                                                                             |
| 제품 문서     | [Wiki](https://github.com/ppre1ude/hub/wiki)                                                                                                                 |
| 작업 이슈     | [GitHub Issues](https://github.com/ppre1ude/hub/issues)                                                                                                      |
| 백로그        | [GitHub Project](https://github.com/users/ppre1ude/projects/3)                                                                                               |
| 쇼케이스      | [showcase.json](https://github.com/ppre1ude/hub/blob/main/showcase/showcase.json)                                                                            |
| 개발 방식     | [AI Agent Workflow](https://github.com/ppre1ude/hub/blob/main/docs/ai-development-workflow.md)                                                               |

## 프로젝트 목적

유용한 링크를 저장해 두어도 시간이 지나면 왜 저장했는지, 어디에 두었는지 잊기 쉽습니다. 아맞다는 웹 URL 입력, Chrome 확장, Android 공유로 발견한 링크를 같은 개인 보관함에 저장하고, 필요한 순간 다시 꺼내 쓸 수 있게 합니다.

## 핵심 기능

| 저장                                                      | 분류                                               | 꺼내보기                                               |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| URL을 먼저 저장하고 제목·메모·카테고리를 나중에 더합니다. | 카테고리와 검색으로 보관함을 정리합니다.           | 지금 하려는 일을 입력해 다시 쓸 인사이트를 찾습니다.   |
| ![저장 화면](docs/assets/amadda-core-save.png)            | ![분류 화면](docs/assets/amadda-core-category.png) | ![꺼내보기 화면](docs/assets/amadda-core-retrieve.png) |

## 아키텍처

웹, Chrome 확장, Android 공유는 같은 저장 API를 거쳐 로그인한 사용자의 보관함에 연결됩니다. 저장된 인사이트는 브라우저에서 검색과 꺼내보기 흐름으로 다시 찾습니다.

![아맞다 아키텍처](docs/assets/amadda-architecture.png)

## AI Agent Workflow

사람이 제품 방향과 최종 판단을 맡고, AI 도구는 조사·정리·구현·검증을 돕습니다. 사용한 도구와 각 역할은 [AI Agent Workflow](docs/ai-development-workflow.md)에서 확인할 수 있습니다.

## 문서 색인

### 제품

- [아맞다! 제품 문서](https://github.com/ppre1ude/hub/wiki) - 제품 지식 전체 안내
- [제품 개요](https://github.com/ppre1ude/hub/wiki/%EC%A0%9C%ED%92%88-%EA%B0%9C%EC%9A%94) - 문제, 사용자와 제품 가치
- [도메인 언어](https://github.com/ppre1ude/hub/wiki/%EB%8F%84%EB%A9%94%EC%9D%B8-%EC%96%B8%EC%96%B4) - 제품에서 함께 사용할 용어
- [현재 MVP](https://github.com/ppre1ude/hub/wiki/%ED%98%84%EC%9E%AC-MVP) - 제품 가설, 핵심 흐름과 범위
- [제품 원칙과 결정](https://github.com/ppre1ude/hub/wiki/%EC%A0%9C%ED%92%88-%EC%9B%90%EC%B9%99%EA%B3%BC-%EA%B2%B0%EC%A0%95) - 제품 판단 기준과 현재 결정
- [제품 학습](https://github.com/ppre1ude/hub/wiki/%EC%A0%9C%ED%92%88-%ED%95%99%EC%8A%B5) - 사용자 근거에서 얻은 학습과 남은 질문

### 실행

- [아맞다! 프로젝트](https://github.com/users/ppre1ude/projects/3) - 작업 상태, 우선순위, 순서와 의존성
- [GitHub 이슈](https://github.com/ppre1ude/hub/issues) - 작업별 사용자 결과, 범위와 완료 기준

### 개발 방식

- [AI Agent Workflow](docs/ai-development-workflow.md) - 프로젝트를 개발하며 AI 도구가 맡은 역할과 확인 방식

### 구현

- [작업 컨텍스트](CONTEXT.md) - 에이전트가 지켜야 할 제품 언어와 현재 제약
- [검색 구현 계약](docs/retrieve.md) - 검색 점수, 정렬, 꺼내보기 결과와 테스트 기준
- [온보딩 기획](docs/onboarding.md) - 기존 로그인 전 화면의 문구와 동작
- [디자인 시스템](DESIGN.md) - 화면 톤, 색상, 타이포그래피와 컴포넌트 규칙
- [WDS 적용 메모](docs/wds-adoption.md) - WDS 컴포넌트 적용 기준과 도입 순서
- [개발 아키텍처](docs/development-architecture.md) - FSD 레이어, import 규칙과 저장 경계
- [Android Capacitor 개발·검증](docs/android-capacitor.md) - Android 공유 저장, OAuth, APK와 에뮬레이터 절차
- [기술 스택 및 라이브러리](docs/tech-stack.md) - 라이브러리 선정 이유와 연결 상태
- [코딩/커밋 컨벤션](docs/coding-commit-conventions.md) - 코드 스타일, 브랜치와 커밋 규칙
- [에이전트 작업 지침](AGENTS.md) - 저장소 작업 규칙
- [범용 가져오기 승인 설계](docs/superpowers/specs/2026-07-25-universal-insight-import-design.md) - 파일·Notion 범위와 보안 결정
- [범용 가져오기 구현 계획](docs/superpowers/plans/2026-07-25-universal-insight-import.md) - 증분 구현 순서와 검증 기준

### 참고

- [기획 논의 아카이브](docs/discussion.md) - 초기 논의 배경과 과거 범위
- [외부 기획서](https://semicolon-master.notion.site/plan-md-397f551ebf23800f8700f76301a15ca4)
- [프로젝트 관리 노션](https://semicolon-master.notion.site/AI-Agent-Challenge-396f551ebf238005a7fcfbe20555c4bd)

## 계획 관리

- 위키는 문제, 언어, 핵심 경험, 제품 원칙과 축적된 학습을 설명합니다.
- 이슈는 구현, 실험, 사용자 검증과 향후 기능 후보를 독립된 작업으로 관리합니다.
- [아맞다! 프로젝트](https://github.com/users/ppre1ude/projects/3)는 이슈의 상태, 우선순위, 주차와 의존성을 보여줍니다.
- 저장소 문서는 코드와 함께 바뀌는 데이터, 검색, 아키텍처와 디자인 계약을 관리합니다.

## 스크립트

- `npm install`
- `npm run dev` - Vite와 Express를 함께 실행
- `npm run dev:client` - Vite만 실행
- `npm run dev:server` - Express만 실행
- `npm run build`
- `npm test`
- `npm run lint`
- `npm run format`
- `npm run format:check`
