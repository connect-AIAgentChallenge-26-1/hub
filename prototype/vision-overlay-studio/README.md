# Vision Overlay Studio Prototype

사람이 예시 사진을 승인 가능한 촬영 가이드로 만드는 화면과, 촬영 결과를 비교하는 실험용 React 앱입니다.

## 화면

- `/`: 레이아웃 등록. YOLO Pose + SAM2로 인물을 분석하고, 관리자가 배경선을 최대 5개 등록한 뒤 `overlay.png`, `guide.json`을 내려받습니다.
- `/compare/`: 촬영 비교. YOLO Pose로 촬영 사진을 분석하고, 선택하면 예시 사진의 등록 배경선 주변을 ORB/RANSAC으로 함께 비교합니다.

## 실행

먼저 `tools/yolo-sam2-overlay`의 Python 3.11 또는 3.12 가상환경을 준비합니다.

```powershell
cd prototype/vision-overlay-studio
npm install
.\start-local.ps1
```

`start-local.ps1`는 FastAPI 모델 서버(8000)와 Vite 화면을 함께 실행합니다. 화면에 표시되는 주소를 브라우저에서 엽니다.

## 제품 연결 경계

실제 서비스에서는 이 앱이 만든 승인 결과를 Storage와 DB에 저장합니다.

- Storage: 예시 사진, overlay PNG
- DB: `guide_json`, 프레임·배경선 메타데이터, 승인 상태
- 사용자 촬영 비교: 저장된 `guide_json`과 예시 사진 URL을 서버가 읽어 비교합니다. 사용자가 기준 파일을 다시 올리지 않습니다.
