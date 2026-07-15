---
id: TS-0007
title: 비대화형 k6 컨테이너의 TTY와 스크립트 디렉터리 권한
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-platform
related:
  - ../work-records/WI-0001-agentic-development-environment.md
  - ../development-environment.md
---

# TS-0007 비대화형 k6 컨테이너의 TTY와 스크립트 디렉터리 권한

## 증상과 영향

실제 앱, Prometheus와 Grafana가 healthy인 상태에서 `make load-smoke`가 k6 이미지를
정상 빌드한 뒤 출력 없이 종료 코드 255를 반환했다. 임시 컨테이너도 남지 않아 앱
응답이나 JavaScript threshold 실패인지 즉시 구분할 수 없었다.

## 조사 기록

Dev Container를 `docker compose exec -T`로 제어하는 Agent 문맥은 비대화형인데 내부
`docker compose run`은 기본적으로 TTY를 요청했다. `--no-TTY`를 명시해 실제 오류를
표시하자 k6가 `/scripts/health-smoke.js`를 stat하는 단계에서 permission denied가
발생했다.

완성 이미지를 기본 k6 사용자 UID 12345로 직접 조사한 결과 파일의 부모인 `/scripts`
디렉터리가 0444였다. 파일은 읽기 가능해도 디렉터리에 execute 비트가 없으면 경로를
탐색할 수 없다. k6를 root로 실행하는 대안은 최소 권한을 훼손하고, 스크립트를 0777로
여는 대안은 불필요한 쓰기 권한을 주므로 제외했다.

## 근본 원인과 해결

첫 원인은 중첩된 비대화형 Compose run의 암묵적 TTY였고, 실제 실행 원인은 `COPY`가
존재하지 않던 대상 경로를 만들 때 `/scripts`까지 파일용 0444 mode로 생성한 것이다.

Dockerfile에서 root 단계로 `/scripts`를 0555로 먼저 만들고 스크립트만 root 소유
0444로 복사한 뒤 최종 사용자를 다시 UID 12345로 전환했다. 실행 스크립트에는
`--no-TTY`를 추가해 VS Code 터미널, CI와 Agent 실행이 같은 동작을 갖게 했다.

## 검증과 재발 방지

완성 이미지에서 UID 12345, `/scripts` 0555와 fixture 0444를 확인했다. 이어서
`make load-smoke`가 VU 1·iteration 1, checks 2/2(100%), `http_req_failed` 0%와
종료 코드 0으로 끝났고 임시 k6·Testcontainers 컨테이너가 남지 않았다. 단일 health
요청의 약 73 ms는 실행 증거일 뿐 도메인 성능 기준이나 처리량 성과로 해석하지 않는다.

k6 기반 이미지나 fixture 경로를 바꿀 때는 이미지 build 성공만으로 완료하지 않고
최종 비-root 사용자로 실제 스크립트를 실행한다.
