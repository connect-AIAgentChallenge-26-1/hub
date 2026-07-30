# Presentation Assets

발표용 HTML과 발표에서만 사용하는 이미지 자산을 보관하는 폴더다. 실제 사용자 앱 코드와 분리해 관리한다.

- `photo-navigation-week2-report.html`: 현재 3주차 개발 진행 발표자료. 파일명은 기존 공유 링크 호환을 위해 유지한다.
- `assets/`: 발표자료가 참조하는 이미지와 UI 흐름 시각화 자료

GitHub Pages 배포 시 이 폴더는 `apps/web/dist/presentation/`으로 복사된다.

```text
https://yf560.github.io/hub/photo-navigation/presentation/photo-navigation-week2-report.html
```

발표 전용 이미지가 실제 서비스 화면에서 필요해지면 `apps/web`의 기능 자산으로 별도 등록하고, 이 폴더의 파일을 직접 참조하지 않는다.
