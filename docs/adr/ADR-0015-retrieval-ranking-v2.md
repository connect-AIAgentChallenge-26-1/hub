---
id: ADR-0015
title: 적응형 검색·점수 v2와 부분 결과·다른 추천
type: adr
status: accepted
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../contracts.md
  - ../roadmap.md
  - ../work-records/WI-0046-recommendation-quality-v2.md
---

# ADR-0015 적응형 검색·점수 v2와 부분 결과·다른 추천

## 맥락

Naver Local은 `display=5`, `start=1`이 상한이므로 단일 요청의 크기를 늘릴 수 없다. 현재
한두 검색과 link 필수 identity, 취약한 위치 suffix 처리 때문에 Provider가 정상이어도 후보가
세 개보다 적을 수 있다. Provider 순위도 CandidateKey 정렬 전에 소실돼 결과의 관련성 근거가
약하다.

## 결정

기본 추천은 최대 여섯 Local 호출에서 `지역+유형` 정확도·리뷰 정렬과 독립 선호·유형·위치
변형을 합치고 유효 후보 열 개에서 멈춘다. 다른 추천은 최대 여덟 호출에서 이전 후보를
제외하고 사용하지 않은 변형을 우선한다. 기본 결과는 결정적으로 유지하며 다양성은 명시적
대체 추천 요청에서만 제공한다.

link는 표시 출처이지 identity의 필수값이 아니다. 이름·주소·좌표 조합으로 안정적인 내부
fingerprint를 만들고, 공통 홈페이지를 쓰는 지점은 주소·좌표가 충돌하면 병합하지 않는다.
행정구역은 exact/alias를 요구하고 생활권·랜드마크는 Provider 관련성을 인정하되 근사 위치
경고를 반환한다.

점수는 위치 신뢰도 15, weighted RRF 30, 선호 근거 30, 근거 품질 25의 0~100으로 바꾼다.
유형과 확인된 제외 조건은 통과 규칙이며 예산·인원은 증거 없이 점수화하지 않는다. 최종
후보가 한두 개면 `partial=true`로 완료하고 0개만 실패한다. 완료된 추천은 같은 세션의
`POST /api/v1/recommendations/{jobId}/alternatives`로 다른 후보를 요청할 수 있다.

## 결과와 재검토

호출 수와 처리 시간은 늘지만 Provider의 공식 pagination 부재 안에서 회수율과 설명 가능성을
함께 높인다. 호출 예산은 설정 가능하며 quota 보호 metric으로 관찰한다. paired benchmark에서
hard constraint 위반, candidate success와 evidence precision이 승인 기준을 충족하지 못하면
v2를 production 기본값으로 전환하지 않는다.
