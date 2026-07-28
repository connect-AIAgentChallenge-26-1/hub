# 갓생러 플래너 — 지식재산권 보관용 최종 코드

보관 기준일: 2026-07-28 (Asia/Seoul)

이 폴더는 현재 실제 구동되는 갓생러 플래너의 프론트엔드, 백엔드 서버, 선택적 Supabase 스키마와 향후 확장용 Next.js 소스를 한곳에 정리한 보관본입니다. 실제 API 키, OAuth 비밀키, 사용자 대화와 일정이 담긴 SQLite 파일, 로그, `node_modules`는 포함하지 않았습니다.

## 폴더 구조

```text
frontend/
  플래너.html             현재 서버가 제공하는 최종 화면
  planner-core.js         공용 플래너 계산 로직
backend/
  server.js               HTTP·AI·OAuth·캘린더·SQLite API 서버
  autonomous-decision-engine.js
                          근거·충돌·신뢰도·실행가치·위험도를 산출하는 자율 의사결정 엔진
  cloud-memory.js         선택적 Supabase 장기기억/RAG 연동
  fcm-push.js             선택적 FCM 푸시 발송 모듈
  package.json            Node.js 실행 정보
  scripts/windows-ocr.ps1 Windows 이미지 OCR 보조 스크립트
database/
  supabase-schema.sql     Supabase 테이블·RLS 스키마
supplementary/nextjs/
  src/                    Next.js/TypeScript 확장 소스
  capacitor.config.json   모바일 패키징 설정
```

## 실행 준비

1. Node.js 24 이상을 설치합니다.
2. 루트의 `.env.example`을 `backend/.env`로 복사합니다.
3. `backend/.env`에 `OPENAI_API_KEY` 등 실제 사용하는 서버 설정만 입력합니다.
4. `START_PLANNER.cmd`를 실행합니다.
5. 브라우저에서 `http://127.0.0.1:3001`을 엽니다.

별도 npm 패키지 의존성은 없으며 현재 서버는 Node.js 내장 모듈과 `node:sqlite`를 사용합니다. Supabase, Firebase, Google·카카오 OAuth는 환경변수가 있을 때만 활성화됩니다.

## 자율 AI 비서 핵심 구조

- 365일 연속성 페이스메이커가 연간 진행도, 최근 7일 이행 기록, 에너지, 완료율을 결합해 오늘 지킬 최소 실행량을 10·15·25분으로 조절합니다.
- 하루를 놓쳐도 연속 기록을 초기화하지 않고 회복 모드로 전환해 복귀 마찰을 낮추며, 실제 완료 기록으로 연속성 예비력을 계산합니다.

- 요청·현재 일정·사용자 상태를 결합해 최대 3개의 실행 후보만 만듭니다.
- 일정 충돌, 누적 지연, 중복 작업, 하루 수용량 초과를 감지하고 판단 근거를 함께 보존합니다.
- 각 제안에 신뢰도, 실행 가치, 위험도, 예상 절약 시간, 되돌리기 가능 여부를 부여합니다.
- 사용자가 승인한 결정만 일회성 서명으로 반영하며, 적용 전 상태를 저장해 한 번에 되돌릴 수 있습니다.
- 도움 됨·아쉬움 피드백을 결정 유형별로 축적해 이후 제안 순위에 반영합니다.
- 알림 후보를 하루 최대 3회로 제한해 과도한 개입을 방지합니다.
- 현재 요청에 첨부되지 않은 과거 자료를 새 판단 근거로 오인하지 않도록 출처를 분리합니다.

## 보안 원칙

- `.env`, `work.env`, DB, 로그, 인증서 파일을 저장소나 PR에 올리지 않습니다.
- `SUPABASE_SERVICE_ROLE_KEY`, OAuth Client Secret, Firebase Private Key는 브라우저 코드에 넣지 않습니다.
- 공개용 설정 예시는 키 이름만 유지하고 값은 비워둡니다.
- 비밀값이 한 번이라도 공개되었다면 삭제만 하지 말고 공급자 콘솔에서 폐기·재발급합니다.

## 권리 보관 참고

`SOURCE_RECORD.md`는 보관 일자와 원본 경로를, `SHA256SUMS.txt`는 각 파일의 무결성 해시를 기록합니다. 이 기록은 특정 시점의 파일 동일성을 확인하는 보조자료이며 저작권 등록이나 특허 출원을 대신하지 않습니다.
