# Photo Navigation

지도에서 포토스팟과 원하는 프레임을 고르고, 촬영 과정에서 구도를 안내하는 포토 내비게이션 서비스입니다.

## Directory Guide

- `apps/web`: 실제 React 프론트엔드 개발 공간
- `apps/api`: 실제 Express 백엔드 개발 공간
- `presentation`: 발표 HTML과 발표 전용 이미지 자산
- `tools`: 가이드 생성·구도 비교용 독립 도구 모듈
- `prototype`: 기획·사용자 흐름과 Vision Overlay Studio를 검증하는 화면
- `docs`: 아키텍처, 작업 흐름, Agent 지침

## Project Management

- [GitHub Issues](https://github.com/yf560/hub/issues)
- [GitHub Project](https://github.com/users/yf560/projects/2)
- Planning Agent: 작업 시작 전 다음 Task와 완료 기준을 정리합니다.
- Verification Agent: 구현 후 요구사항과 예외 상태를 점검합니다.

## Overlay Agent

`tools/overlay-agent` creates a transparent camera guide PNG from a reference photo and normalized coordinate JSON.

```bash
cd tools/overlay-agent
npm install
npm run generate -- --image <reference-image> --guide ./guides/example-guide.json --output <overlay-output>
```

Place reference photos in `assets/photo-guides/reference/` and review generated PNG files before uploading them to Storage.

## Tool Modules

- `prototype/vision-overlay-studio`: 관리자용 가이드 등록·촬영 비교 화면과 `guide.json` 계약
- `tools/overlay-agent`: 투명 Overlay PNG를 만드는 CLI
- `tools/yolo-sam2-overlay`: YOLO Pose·SAM2 등록 분석과 ORB/RANSAC 비교를 위한 FastAPI Vision 서버

`guide.json`은 인물 프레임, YOLO 관절점, 선택적 실루엣, 배경 대표선을 하나로 저장한다. Overlay PNG는 화면 표시용 Storage 파일이며, 기준 사진을 다시 분석하지 않도록 비교에 필요한 좌표는 `guide_json`에서 재사용한다.
