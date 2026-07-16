---
id: TS-0009
title: Node 24 컨테이너의 Edge 테스트 pool과 임시 디렉터리
type: troubleshooting
status: verified
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../work-records/WI-0039-shared-fork-live-security-foundation.md
  - ../development-environment.md
---

# TS-0009 Node 24 컨테이너의 Edge 테스트 pool과 임시 디렉터리

## 증상과 영향

Node 24 Bookworm 컨테이너에서 lockfile부터 다시 설치한 뒤 Edge 검증을 실행했을 때
Vitest assertion은 통과했지만 Cloudflare test pool Worker 하나가 `ECONNRESET`으로
시작하지 못했다. 병렬 실행을 줄인 뒤에는 읽기 전용 저장소에서 Wrangler dry-run이
`edge/.wrangler/tmp`를 만들 수 없어 `EROFS`로 실패했다.

첫 실패를 무시하면 일부 테스트 파일이 실행되지 않은 결과를 성공으로 오인할 수 있고,
두 번째 실패를 제품 코드 오류로 해석하면 불필요하게 저장소 쓰기 권한을 넓힐 수 있다.

## 조사 기록

첫 실행은 10개 중 9개 테스트 파일의 assertion이 성공했지만 pool 시작 오류 때문에
Vitest가 올바르게 종료 코드 1을 반환했다. 같은 코드를 Windows 호스트에서는 모두
통과했으므로 테스트 내용보다 Docker Desktop bind mount에서 여러 workerd process를
동시에 시작하는 경계를 조사했다.

`fileParallelism=false`, `maxWorkers=1`로 실행하자 10개 파일·74개 테스트가 안정적으로
통과했다. 이어진 Wrangler 오류는 bundle 검증 자체가 아니라 dry-run도 로컬 임시
디렉터리를 필요로 한다는 사실에서 발생했다. 저장소 전체를 writable로 바꾸는 대신
깨끗한 컨테이너 검증 명령에 `/workspace/edge/.wrangler` 휘발성 volume만 제공했다.

처음 사용한 writable bind mount의 `npm ci`가 Linux용 workspace link를 호스트
`node_modules`에 만든 문제도 확인했다. 이후 clean 검증은 저장소를 read-only로
마운트하고 루트·Edge `node_modules`를 별도 휘발성 volume으로 분리했다.

## 근본 원인과 해결

Cloudflare Vitest pool의 파일별 병렬 process 시작은 Docker Desktop bind mount 환경에서
간헐적인 socket reset을 만들 수 있었다. 보안 경계 테스트는 처리량보다 결정성과 전체
실행 보장이 중요하므로 Edge Vitest를 단일 Worker로 고정했다.

Wrangler는 `--dry-run`에서도 `.wrangler/tmp`를 사용하므로 read-only clean 검증에서는
해당 경로만 휘발성 volume으로 제공한다. CI checkout은 작업공간이 writable이므로 별도
권한 확장이 필요 없다. 실제 Worker 배포 권한이나 secret은 이 해결 과정에 추가하지
않았다.

## 검증과 재발 방지

Windows 호스트와 read-only Node 24 Bookworm 컨테이너에서 typecheck, 10개 파일·74개
테스트와 Release Gate·Provider Gateway 두 Wrangler dry-run이 모두 종료 코드 0으로
통과했다. `npm audit`은 취약점 0건을 보고했다.

향후 Edge 테스트 파일이나 Wrangler 설정을 바꿀 때는 assertion 개수뿐 아니라 unhandled
pool error가 없는지 확인한다. clean container 검증은 host `node_modules`를 공유하지
않고 휘발성 dependency·`.wrangler` volume을 사용한다.
