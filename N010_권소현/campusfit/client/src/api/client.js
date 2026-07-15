const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API 요청 실패: ${path} (${res.status})`);
  return res.json();
}

export const api = {
  health: () => request("/api/health"),
  getCategories: () => request("/api/listings/categories"),
  getListings: (categoryId) =>
    request(`/api/listings${categoryId ? `?categoryId=${categoryId}` : ""}`),
  getBoardPosts: (listingId) =>
    request(`/api/board${listingId ? `?listingId=${listingId}` : ""}`),
  getBoardPost: (id) => request(`/api/board/${id}`),
  addComment: (id, comment) =>
    request(`/api/board/${id}/comments`, {
      method: "POST",
      body: JSON.stringify(comment),
    }),
};
