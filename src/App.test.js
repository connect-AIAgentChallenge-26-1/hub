import { render, screen } from "@testing-library/react";
import App from "./App";

test("실제 장소 검색을 위한 빈 지도 화면을 표시한다", () => {
  window.history.pushState({}, "", "/");
  render(<App />);

  expect(screen.getByLabelText("식당 또는 카페 검색")).toBeInTheDocument();
  expect(screen.getByText("검색 결과가 여기에 표시됩니다")).toBeInTheDocument();
  expect(screen.queryByText("올드문래")).not.toBeInTheDocument();
});
