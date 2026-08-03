import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

let mockAuthUser = null;

jest.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockAuthUser ? { user: mockAuthUser, access_token: "test-token" } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      updateUser: jest.fn(),
    },
  },
  toAppUser: (user) => user ? { id: user.id, email: user.email, name: user.user_metadata?.display_name || user.email } : null,
}));

test("실제 장소 검색을 위한 빈 지도 화면을 표시한다", () => {
  window.history.pushState({}, "", "/");
  render(<App />);

  expect(screen.getByLabelText("식당 또는 카페 검색")).toBeInTheDocument();
  expect(screen.getByText("검색 결과가 여기에 표시됩니다")).toBeInTheDocument();
  expect(screen.getByText("지금리뷰")).toBeInTheDocument();
  expect(screen.queryByText("올드문래")).not.toBeInTheDocument();
});

test("로그인 경로에서 로그인 폼을 표시한다", () => {
  window.history.pushState({}, "", "/login");
  render(<App />);

  expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
  expect(screen.getByLabelText("이메일")).toBeInTheDocument();
  expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
});

test("검색 버튼 없이 Enter로 검색하고 X 버튼으로 검색어를 지운다", () => {
  window.history.pushState({}, "", "/");
  render(<App />);

  const searchInput = screen.getByLabelText("식당 또는 카페 검색");

  expect(screen.queryByRole("button", { name: "검색" })).not.toBeInTheDocument();

  fireEvent.change(searchInput, { target: { value: "성수 카페" } });
  const clearButton = screen.getByRole("button", { name: "검색어 지우기" });

  fireEvent.click(clearButton);

  expect(searchInput).toHaveValue("");
  expect(searchInput).toHaveFocus();
  expect(screen.queryByRole("button", { name: "검색어 지우기" })).not.toBeInTheDocument();
});

test("비로그인 사용자가 홈에서 리뷰작성을 누르면 로그인 화면으로 이동한다", async () => {
  mockAuthUser = null;
  window.history.pushState({}, "", "/");
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /리뷰작성/ }));

  expect(await screen.findByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
});

test("홈 영수증 스캔으로 업체를 찾아 인증된 리뷰 작성 화면으로 이동한다", async () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:scan-receipt");
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      place: { id: "place-scan", title: "메가MGC커피 강남중앙점", category: "카페", address: "서울 강남구", x: 127.03, y: 37.49 },
      receipt: { id: "receipt-scan", merchantName: "메가MGC커피 강남중앙점", paidAt: "2026-08-01T14:32:00+09:00", totalAmount: 5000, approvalNumber: "****5678" },
    }),
  });
  mockAuthUser = { id: "user-1", email: "test@example.com", user_metadata: { display_name: "테스터" } };
  window.history.pushState({}, "", "/");
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "영수증 스캔하기" }));
  const receiptFile = new File(["receipt"], "receipt.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("스캔할 영수증 선택"), { target: { files: [receiptFile] } });
  fireEvent.click(screen.getByRole("button", { name: "영수증 스캔하기" }));

  expect(await screen.findByRole("heading", { name: "메가MGC커피 강남중앙점" })).toBeInTheDocument();
  expect(screen.getByText("인증 완료")).toBeInTheDocument();

  global.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  mockAuthUser = null;
  sessionStorage.removeItem("jigeum-review:selected-place");
  sessionStorage.removeItem("jigeum-review:scanned-receipt");
});

test("업체 상세에서 지도로 돌아오면 이전 검색 결과를 복원한다", () => {
  sessionStorage.setItem("jigeum-review:map-screen", JSON.stringify({
    searchInput: "성수 카페",
    places: [{ id: "place-1", title: "테스트 카페", category: "카페", address: "서울 성동구", x: 127.05, y: 37.54 }],
    placeStatus: "ready",
    selectedPlaceId: "place-1",
    searchRadius: 3000,
  }));
  window.history.pushState({}, "", "/");
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "테스트 카페 상세 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "← 지도" }));

  expect(screen.getByLabelText("식당 또는 카페 검색")).toHaveValue("성수 카페");
  expect(screen.getByRole("button", { name: "테스트 카페 상세 보기" })).toBeInTheDocument();
  sessionStorage.removeItem("jigeum-review:map-screen");
  sessionStorage.removeItem("jigeum-review:selected-place");
});

test("로그인 사용자는 별점 없이 영수증 리뷰 작성 화면을 이용한다", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ analysis: { bucket: "very_positive", score: 1, confidence: 0.98, keywords: ["맛있음"] } }),
  });
  mockAuthUser = { id: "user-1", email: "test@example.com", user_metadata: { display_name: "테스터" } };
  sessionStorage.setItem("jigeum-review:selected-place", JSON.stringify({
    id: "place-1",
    title: "테스트 카페",
    category: "카페",
    address: "서울 성동구",
  }));
  window.history.pushState({}, "", "/places/place-1/reviews/new");
  render(<App />);

  expect(await screen.findByRole("heading", { name: "테스트 카페" })).toBeInTheDocument();
  expect(screen.getByLabelText("리뷰 내용")).toBeInTheDocument();
  expect(screen.queryByLabelText(/별점/)).not.toBeInTheDocument();
  expect(screen.getByText("영수증 인증 준비")).toBeInTheDocument();
  expect(screen.getByText("OCR로 상호명·결제일 추출")).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "영수증 인증 후 등록" })).toBeDisabled();

  global.fetch = originalFetch;
  mockAuthUser = null;
  sessionStorage.removeItem("jigeum-review:selected-place");
  localStorage.removeItem("jigeum-review:test-analyses");
});

test("모바일에서 직접 선택한 영수증으로 인증 과정을 완료한다", async () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:mobile-receipt");
  URL.revokeObjectURL = jest.fn();
  global.fetch = jest.fn().mockImplementation(async (url) => ({
    ok: true,
    json: async () => String(url).includes("/api/receipts/verify")
      ? { receipt: { id: "receipt-1", merchantName: "메가MGC커피 강남중앙점", paidAt: "2026-08-01T14:32:00+09:00", totalAmount: 5000, approvalNumber: "****5678" } }
      : { review: { id: "review-1", bucket: "very_positive", score: 1, confidence: 0.98, keywords: ["커피"], content: "커피가 맛있고 매장이 깔끔해서 다시 방문하고 싶어요.", createdAt: new Date().toISOString() } },
  }));
  mockAuthUser = { id: "user-1", email: "test@example.com", user_metadata: { display_name: "테스트" } };
  sessionStorage.setItem("jigeum-review:selected-place", JSON.stringify({
    id: "mega-gangnam",
    title: "메가MGC커피 강남중앙점",
    category: "카페",
    address: "서울 강남구",
  }));
  window.history.pushState({}, "", "/places/mega-gangnam/reviews/new");
  render(<App />);

  const receiptFile = new File(["demo receipt"], "mega-receipt.png", { type: "image/png" });
  fireEvent.change(await screen.findByLabelText("영수증 이미지 업로드"), { target: { files: [receiptFile] } });
  expect(screen.getByAltText("선택한 영수증 미리보기")).toHaveAttribute("src", "blob:mobile-receipt");
  fireEvent.click(screen.getByRole("button", { name: "영수증 인증" }));
  expect(screen.getByRole("status")).toHaveTextContent("영수증을 분석하고 있어요");
  expect((await screen.findAllByText("인증 완료", {}, { timeout: 2500 })).length).toBeGreaterThan(0);
  expect(screen.getByText("메가MGC커피 강남중앙점", { selector: "dd" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("리뷰 내용"), { target: { value: "커피가 맛있고 매장이 깔끔해서 다시 방문하고 싶어요." } });
  fireEvent.click(screen.getByRole("button", { name: "리뷰 등록하기" }));
  expect(await screen.findByRole("status")).toHaveTextContent("리뷰 그래프에 반영했습니다");

  global.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  mockAuthUser = null;
  sessionStorage.removeItem("jigeum-review:selected-place");
  localStorage.removeItem("jigeum-review:test-analyses");
});

test("마이페이지에서 닉네임을 변경하고 홈과 지도 탐색을 하나로 표시한다", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ user: { id: "user-1", email: "test@example.com", name: "새닉네임" } }),
  });
  mockAuthUser = { id: "user-1", email: "test@example.com", user_metadata: { display_name: "테스터" } };
  window.history.pushState({}, "", "/mypage");
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "닉네임 변경" }));
  fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "새닉네임" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  expect(await screen.findByRole("status")).toHaveTextContent("닉네임이 변경되었습니다.");
  expect(screen.getByRole("heading", { name: "새닉네임" })).toBeInTheDocument();
  expect(screen.getAllByText("홈").length).toBeGreaterThan(0);
  expect(screen.queryByText("지도 탐색")).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/users/me"), expect.objectContaining({ method: "PATCH" }));

  global.fetch = originalFetch;
  mockAuthUser = null;
});

test("사용자는 마이페이지에서 본인이 작성한 리뷰만 삭제한다", async () => {
  mockAuthUser = { id: "user-1", email: "test@example.com", user_metadata: { display_name: "테스터" } };
  localStorage.setItem("jigeum-review:test-analyses", JSON.stringify([
    { id: "review-own", userId: "user-1", placeId: "place-1", placeTitle: "내 리뷰 업체", content: "제가 작성한 리뷰 내용입니다.", bucket: "positive", confidence: 0.9, keywords: [], testOnly: true, createdAt: "2026-07-30T00:00:00.000Z" },
    { id: "review-other", userId: "user-2", placeId: "place-2", placeTitle: "다른 사용자 업체", content: "다른 사용자의 리뷰입니다.", bucket: "neutral", confidence: 0.8, keywords: [], testOnly: true, createdAt: "2026-07-29T00:00:00.000Z" },
  ]));
  window.history.pushState({}, "", "/mypage");
  render(<App />);

  expect(await screen.findByRole("heading", { name: "내 리뷰 업체" })).toBeInTheDocument();
  expect(screen.queryByText("다른 사용자 업체")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "내 리뷰 업체 리뷰 삭제" }));
  expect(screen.getByText("정말 삭제할까요?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));

  expect(screen.queryByRole("heading", { name: "내 리뷰 업체" })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("jigeum-review:test-analyses"))).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem("jigeum-review:test-analyses"))[0].id).toBe("review-other");

  localStorage.removeItem("jigeum-review:test-analyses");
  mockAuthUser = null;
});

test("로그인 사용자가 저장한 관심 장소를 조회하고 해제한다", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [{ id: "place-1", title: "저장한 카페", category: "카페", address: "서울 종로구", x: 126.98, y: 37.57 }] }),
  });
  mockAuthUser = { id: "user-1", email: "test@example.com", user_metadata: { display_name: "테스터" } };
  window.history.pushState({}, "", "/saved");
  render(<App />);

  expect(await screen.findByRole("heading", { name: "관심 장소" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "저장한 카페 상세 보기" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "저장한 카페 관심 장소 해제" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "저장한 카페 상세 보기" })).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/saved-places/place-1"), expect.objectContaining({ method: "DELETE" }));

  global.fetch = originalFetch;
  mockAuthUser = null;
});
