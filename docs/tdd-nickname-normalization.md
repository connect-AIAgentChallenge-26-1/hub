# TDD 시도: 닉네임 정규화

## 목표

닉네임을 저장하기 전에 앞뒤 공백을 제거하고 여러 공백을 하나로 합치며, 2자 이상 30자 이하 규칙을 서버에서 보장한다.

## Red — 실패 테스트

먼저 `server/profileService.test.mjs`를 작성하고 다음 명령을 실행했다.

```bash
node --test server/profileService.test.mjs
```

구현 파일인 `server/profileService.mjs`가 없기 때문에 `ERR_MODULE_NOT_FOUND`로 실패하는 것을 확인했다.

## Green — 최소 구현

`normalizeDisplayName`을 구현하고, Express의 `PATCH /api/users/me`가 이 함수를 사용하도록 변경했다. 이후 집중 테스트와 전체 서버 테스트를 실행한다.

실행 결과:

- 집중 테스트: 2개 통과
- 전체 서버 테스트: 5개 통과
- 프론트 테스트: 6개 통과
- `node --check server.mjs`: 통과
- `npm run build`: 성공

프론트 테스트에는 기존 비동기 인증 상태 변경으로 인한 React `act(...)` 경고가 남아 있지만 테스트 실패는 없다.

## PR 확인 항목

PR에는 다음 파일을 함께 포함한다.

- `server/profileService.mjs`
- `server/profileService.test.mjs`
- `server.mjs`
