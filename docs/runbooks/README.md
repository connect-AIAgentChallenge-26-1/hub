# Runbook 인덱스

현재 시스템에서 다른 개발자가 그대로 수행할 반복 진단·복구 절차만
[템플릿](../templates/runbook.md)으로 작성한다. 명령의 영향 범위, 중단 조건, 검증과
rollback을 포함하고 실제로 검증된 뒤 `verified`로 바꾼다.

Provider별 canary와 Split/Linked Gateway 절차는 PP-041에서 종료돼
[archive](../archive/README.md)로 이동했다. 현재 절차는 다음 문서에서 관리한다.

- [RUN-0005 직접 Provider 개발과 Live Playground](RUN-0005-direct-live-development.md)
- [RUN-0006 무료 데모 배포와 롤백](RUN-0006-free-demo-deployment-and-rollback.md)
- [RUN-0007 MVP 요청 보호·Provider 보호·관측성 대응](RUN-0007-mvp-protection-observability.md)
