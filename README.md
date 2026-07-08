# hub

N167 프로젝트 모노레포 (npm workspaces).

## 구조

```
apps/
  intro/    프로젝트 소개 사이트 (Vite + React)
  showup/   ShowUp — 노쇼·악성 고객 이력 관리 서비스 (진행 중, Hermes Agent 4세션)
    docs/   기획서(plan.md) · 작업 체크리스트(checklist.md)
    sessions/  Hermes Agent 세션 가이드 (LEAD/FE/BE/SECURITY)
```

## 실행

```bash
npm install          # 루트에서 1회
npm run dev          # intro 개발 서버
npm run build        # intro 빌드
npm run lint
```

워크스페이스 직접 지정: `npm run dev -w intro`

## ShowUp

소상공인을 위한 노쇼·악성 고객 이력 관리 및 위험도 경고 웹서비스.
상세: [apps/showup/README.md](apps/showup/README.md)
