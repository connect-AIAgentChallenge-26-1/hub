# Claude 작업 보고 (append-only)

규칙: 이 파일은 읽지 말고 shell append(`cat >> docs/report/claude.md`)로 하단에만 추가한다. 기존 내용 수정·삭제 금지. 형식:

```text
## YYYY-MM-DD HH:MM | Task ID | 한 줄 요약
- 작업: 무엇을 했는지 2~3줄
- 검증: verify/테스트 결과, 커밋 해시
- 미결: BLOCKED·후속 작업·리뷰 요청 사항 (없으면 "없음")
```

---
## 2026-07-12 16:53 | T00 (harness.md H1~H7) | frontend 검증 하네스 구축
- 작업: docs/harness.md 지시서대로 H1~H7 구현. package.json에 lint/test/verify script 추가, ESLint flat config, Vitest+RTL+jsdom 테스트(추천 문구 부재 검사 2건, CLAUDE.md 절대 원칙 1과 연결), gitleaks secret scan, .github/workflows/ci.yml(frontend/secret-scan job + backend 주석 슬롯), auto-merge.yml에 CI 성공+리뷰 승인 게이트 추가·충돌 자동 close 제거·반복 코멘트 방지(commentOnce) 적용.
- 검증: npm run verify(lint+test+build) 전체 통과. H7 red→green 4건 모두 실측 확인 — lint(no-unused-vars 위반 주입 → 실패 → 원복 후 통과), test(금지 문구 "분할매수" 주입 → 2 테스트 실패 → 원복 후 통과), build(구문 오류 주입 → esbuild 실패 → 원복 후 통과), secret-scan(gitleaks를 별도 fixture repo에서 fake key로 탐지 확인 → 실제 저장소는 "no leaks found"). auto-merge.yml/ci.yml은 YAML 파싱(js-yaml)과 내장 JS 구문(node --check) 검증 통과, 단 GitHub Actions 런타임(GraphQL 응답 기반 로직)은 실제 PR로 미검증.
- 미결: checklist.md C0의 4개 항목은 frontend+backend+type check가 한 문장에 묶여 있어 backend(T01 이후)가 생기기 전까지는 정직하게 체크 불가 — 그대로 미체크 유지. backlog.md T00은 schema/envelope/Claim·Fact·Evidence schema/문서 정책 등 하네스 밖 항목이 남아 "진행중" 유지(변경 없음). gitleaks는 로컬에 brew로 신규 설치됨(사용자 확인 필요). esbuild/vite 관련 moderate dev-server 취약점(npm audit)은 하네스 범위 밖으로 미조치 — 필요시 별도 검토 권장. GPT 리뷰 요청: auto-merge.yml의 predicate 순서·commentOnce 로직, ProjectIntro.test.jsx의 금지 문구 목록 충분성.
