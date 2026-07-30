import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import ComparisonApp from "./ComparisonApp";
import BackgroundGuideBatchApp from "./BackgroundGuideBatchApp";

const currentPath = window.location.pathname.replace(/\/+$/, "");
const RootApp = currentPath.endsWith("/background-guides")
  ? BackgroundGuideBatchApp
  : currentPath.endsWith("/compare")
    ? ComparisonApp
    : App;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
