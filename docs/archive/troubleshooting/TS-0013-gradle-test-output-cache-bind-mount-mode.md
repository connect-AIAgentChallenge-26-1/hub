---
id: TS-0013
title: Windows bind mount의 Gradle task output cache mode 실패
type: troubleshooting
status: verified
date: 2026-07-15
owners:
  - placepick-platform
related:
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../adr/ADR-0001-java17-baseline.md
  - TS-0004-devcontainer-gradle-cache-permission.md
---

# TS-0013 Windows bind mount의 Gradle task output cache mode 실패

## 증상과 영향

Windows Docker Desktop이 workspace를 `/workspace`에 bind mount한 Dev Container에서
2026-07-15 baseline `make check`가 Gradle integration test output cache 복원 중
실패했다. 실패 대상은 다음 디렉터리였다.

```text
/workspace/backend/build/test-results/integrationTest/binary
```

Gradle은 cache entry의 Unix mode 755를 이 디렉터리에 복원하지 못했다. test assertion이나
Java 17 compile 오류가 아니지만 전체 검증이 중단돼 제품 회귀와 host filesystem
호환성 실패를 구분하기 어려웠다. 캐시된 테스트 output을 복원하면 테스트가 실제로
실행되지 않을 수도 있어, 이번 작업처럼 검증 증거 자체가 중요한 흐름에도 맞지 않았다.

## 조사 기록

1. 기존 local Gradle build cache를 사용하는 첫 `make check`에서 integration test의
   binary output mode 복원 실패를 관찰했다.
2. stale output과 daemon 영향을 분리하기 위해 다음 명령으로 build output을 정리했다.

   ```text
   ./gradlew --no-daemon clean
   ```

3. 이어 Dev Container에서 build cache만 임시로 비활성화해 전체 검증을 다시 수행했다.

   ```text
   GRADLE_OPTS='-Dorg.gradle.caching=false' make check
   ```

4. 같은 source·Java 17·bind mount에서 위 실행은 전체 통과했다. 따라서 application
   test 실패나 dependency 손상보다 task output cache entry의 Unix mode 복원과 Windows
   bind mount semantics 조합이 직접 원인이라는 근거를 얻었다.
5. 첫 영구안으로 모든 `Test` output만 cache에서 제외했지만, 이후 `compileJava` output을
   cache에 저장하며 `Could not get file mode`가 다시 발생했다. 따라서 장애 범위는 Test
   report가 아니라 bind mount 아래 모든 task output의 mode 저장·복원임을 확인했다.
6. 모든 Gradle cache를 영구 제거하는 방안은 dependency 해석·configuration의 유효한
   성능 이점까지 잃는다. 반대로 task 종류별 예외는 새 task마다 누락될 수 있어 제외했다.

## 근본 원인과 해결

근본 원인은 Gradle task output build cache가 Linux의 directory mode를 Windows
bind-mounted workspace의 `build/` 아래에서 저장·복원하려 했으나 filesystem 경계가
그 mode 조회·적용을 안정적으로 지원하지 않은 것이다. TS-0004의 named volume 소유권
문제와 달리 Gradle user home 권한이 아니라 workspace task output의 mode 처리에서
발생했다.

해결은 다음 두 규칙을 분리 적용하는 것이다.

- 모든 Gradle task output은 build cache에 저장하거나 그 cache에서 복원하지 않는다.
- Test task는 `make check`마다 up-to-date 결과를 재사용하지 않고 실제로 실행한다.

dependency cache와 configuration cache는 전역 비활성화하지 않는다. compile task의
일반 up-to-date와 incremental 판단도 유지한다. 따라서 의존성 다운로드·Gradle 구성과
변경 없는 compile의 재사용 이점은 유지하면서 host 간 task output build cache의 Unix
mode 교환만 막는다. unit·integration·Eval·Live Test는 매번 새 증거를 만든다.

rollback은 공통 task output cache와 Test up-to-date 비활성 설정을 제거하는 것이다.
다만 Windows bind mount에서 mode 저장·복원 문제 없이 전체 검증이 실행된다는 대체
증거가 생기기 전에는 rollback하지 않는다.

## 검증과 재발 방지

임시 진단은 `./gradlew --no-daemon clean` 뒤
`GRADLE_OPTS='-Dorg.gradle.caching=false' make check`가 통과해 원인 범위를 좁혔다.
영구 설정의 완료 기준은 별도 `GRADLE_OPTS` 없이 표준 `make check`가 같은 Dev Container
bind mount에서 통과하고 다음을 모두 만족하는 것이다.

- Gradle log에서 각 unit·integration·Eval Test task가 cache 복원이나 up-to-date skip이
  아니라 실제 실행된다.
- `backend/build/test-results/**/binary`가 현재 실행에서 새로 생성된다.
- dependency·configuration cache와 compile up-to-date 판단은 기존 정책대로 사용할 수 있다.
- Java 17 단위·통합·Eval, Linked source compile, 문서·Edge·secret scan이 통과한다.
- 일반 `make check`의 실제 Provider 호출은 0회다.

2026-07-15 같은 Dev Container에서 별도 `GRADLE_OPTS` 없이 표준 `make check`를
재실행해 통과했다. 최종 보강 뒤에도 Java 17 daemon·toolchain·test runtime, 문서 95개와
음성 fixture 8개, Edge 153개 테스트, Java unit·integration·Eval 및 Linked source
compile이 모두 성공했고 생성 report 97개 안전 scan도 통과했다. 일반 check 경로는
`.env.live.local`을
읽지 않았고 실제 Provider 호출은 0회였다. 따라서 영구 설정의 완료 기준을 충족해 이
문서를 `verified`로 전환한다.
