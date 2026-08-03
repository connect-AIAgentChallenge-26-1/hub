import { Navigate, Route, Routes } from "react-router-dom";
import ProjectIntro from "./ProjectIntro.jsx";
import LandingPage from "./pages/m/LandingPage.jsx";
import StoreStatusPage from "./pages/m/StoreStatusPage.jsx";
import OwnerDashboard from "./pages/owner/OwnerDashboard.jsx";
import OwnerGate from "./pages/owner/OwnerGate.jsx";

/* 메인(/)은 사장님 대시보드다 — 배포 시 루트로 들어오면 바로 운영 화면을 본다.
   단, 배포 주소를 아는 사람이 아무나 대시보드를 보지 못하도록 OwnerGate(패스코드 잠금)로
   감싼다. 멀티 매장 로그인이 아니라 매장 1곳 전제의 단일 패스코드 잠금이다.
   프로젝트 소개(ProjectIntro)는 /intro로 옮겨 발표·심사용으로 보존한다.
   /owner는 기존 링크 호환을 위해 같은 (게이트+대시보드)로 남겨둔다.

   고객 화면은 기본이 /m/:machineId 하나다 — QR을 한 번 찍으면 신청·진행 확인·수거 확인이
   전부 그 화면에서 일어난다. /m/store(T-27)는 예외다 — QR 없이 "지금 갈 만한가"를 보는
   매장 현황 화면이라 특정 기계에 묶이지 않는다.
   /m/store는 정적 경로라 :machineId보다 먼저 정의하지 않아도 react-router가 우선 매칭하지만,
   같은 뜻이라 순서도 위쪽에 둔다.
   /progress는 예전 링크가 돌아다닐 수 있어 리다이렉트로만 남긴다. */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<OwnerGate><OwnerDashboard /></OwnerGate>} />
      <Route path="/intro" element={<ProjectIntro />} />
      <Route path="/m/store" element={<StoreStatusPage />} />
      <Route path="/m/:machineId" element={<LandingPage />} />
      <Route path="/m/:machineId/progress" element={<Navigate to=".." relative="path" replace />} />
      <Route path="/owner" element={<OwnerGate><OwnerDashboard /></OwnerGate>} />
    </Routes>
  );
}
