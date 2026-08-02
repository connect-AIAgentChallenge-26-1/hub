# Project Link Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** README와 원본 제출 PR에서 아맞다의 서비스, 발표 자료, 제품 문서와 작업 관리 링크를 바로 열 수 있게 한다.

**Architecture:** README를 전체 링크의 기준 문서로 사용하고, 제출 PR에는 검토에 필요한 링크만 요약한다. 데모 영상은 빈 링크 대신 `준비 중`으로 표시하며 개발 본체 저장소 `ppre1ude/hub`만 공개한다.

**Tech Stack:** Markdown, GitHub README, GitHub Pull Request

---

### Task 1: README 프로젝트 링크 허브 추가

**Files:**

- Modify: `README.md`

- [ ] **Step 1: 프로젝트 소개 다음에 링크 표 추가**

`README.md`의 첫 소개 문단과 `## 프로젝트 목적` 사이에 다음 내용을 추가한다.

```markdown
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
```

- [ ] **Step 2: README 포맷과 변경 범위 확인**

Run:

```powershell
npx prettier --check README.md
git diff --check
git diff -- README.md
```

Expected: Prettier와 `git diff --check`가 통과하고 기존 문서 색인과 계획 관리 섹션은 유지된다.

- [ ] **Step 3: README 변경 커밋**

```powershell
git add -- README.md
git commit -m "docs: README 프로젝트 링크 허브 추가"
```

Expected: README 한 파일만 새 커밋에 포함된다.

### Task 2: 제출 PR 최종 결과물 링크 추가와 배포

**Files:**

- Modify externally: `connect-AIAgentChallenge-26-1/hub#2583`

- [ ] **Step 1: 현재 브랜치를 제출 Fork에 push**

Run:

```powershell
git push origin HEAD:N176_최재원
```

Expected: `ppre1ude/hub-challenge`의 `N176_최재원`이 로컬 HEAD와 일치한다.

- [ ] **Step 2: PR 본문 상단에 최종 결과물 표 추가**

`주요 작업 리스트` 앞에 다음 내용을 한 번만 추가한다.

```markdown
## 최종 결과물

| 구분          | 링크                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 서비스 배포   | [아맞다 Production](https://hub-ppre1udes-projects.vercel.app)                                                                                               |
| 부스 슬라이드 | [Figma](https://www.figma.com/deck/VSnnmq8V2lNaXvjN4QblGS/%EC%95%84%EB%A7%9E%EB%8B%A4--%EB%B6%80%EC%8A%A4-%EC%8A%AC%EB%9D%BC%EC%9D%B4%EB%93%9C?node-id=1-42) |
| 데모 영상     | 준비 중                                                                                                                                                      |
| 소스 코드     | [GitHub 저장소](https://github.com/ppre1ude/hub)                                                                                                             |
| 제품 문서     | [Wiki](https://github.com/ppre1ude/hub/wiki)                                                                                                                 |
| 프로젝트 관리 | [Notion](https://semicolon-master.notion.site/AI-Agent-Challenge-396f551ebf238005a7fcfbe20555c4bd)                                                           |
| 작업 관리     | [GitHub Issues](https://github.com/ppre1ude/hub/issues) / [GitHub Project](https://github.com/users/ppre1ude/projects/3)                                     |
```

PR 제목, 주요 작업, 설명 가능한 부분, 남은 검증, 학습 내용과 검증 결과는 그대로 유지한다.

- [ ] **Step 3: PR과 Git 상태 검증**

Run:

```powershell
gh pr view 2583 --repo connect-AIAgentChallenge-26-1/hub --json title,state,isDraft,url,baseRefName,headRefName,body
git status -sb
git rev-parse HEAD
git ls-remote origin "refs/heads/N176_최재원"
```

Expected: PR은 `N176_최재원` base와 head를 사용하는 열린 비초안 PR이며, 본문에 `최종 결과물` 표가 한 번 존재한다. 작업 트리는 깨끗하고 로컬 HEAD와 원격 브랜치 SHA가 같다.
