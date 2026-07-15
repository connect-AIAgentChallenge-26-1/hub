import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { categories, univOptions, regionOptions, gradeOptions } from "../data/mockListings";
import { boardPosts as initialBoardPosts } from "../data/mockBoardPosts";

const BOOKMARKS_KEY = "campusfit-bookmarks";

function loadBookmarks() {
  try {
    const saved = localStorage.getItem(BOOKMARKS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export default function Layout() {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [univ, setUniv] = useState("all");
  const [region, setRegion] = useState("all");
  const [grade, setGrade] = useState("all");
  const [boardPosts, setBoardPosts] = useState(initialBoardPosts);
  const [bookmarks, setBookmarks] = useState(loadBookmarks);

  const addBoardPost = (post) => setBoardPosts((prev) => [...prev, post]);
  const addComment = (postId, comment) =>
    setBoardPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p))
    );

  useEffect(() => {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]);

  const toggleBookmark = (listingId) =>
    setBookmarks((prev) =>
      prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [...prev, listingId]
    );

  const univLabel = univOptions.find((o) => o.value === univ).label;
  const regionLabel = regionOptions.find((o) => o.value === region).label;
  const gradeLabel = gradeOptions.find((o) => o.value === grade).label;

  const navLinkClass = ({ isActive }) => (isActive ? "active" : undefined);

  return (
    <>
      <header className="topnav">
        <div className="topnav-inner">
          <NavLink className="logo" to="/" style={{ textDecoration: "none", color: "inherit" }}>
            캠퍼스핏
          </NavLink>
          <nav className="nav-links">
            <NavLink to="/" end className={navLinkClass}>
              홈
            </NavLink>
            {categories.map((c) => (
              <NavLink key={c.id} to={`/category/${c.id}`} className={navLinkClass}>
                {c.label}
              </NavLink>
            ))}
            <NavLink to="/board" className={navLinkClass}>
              팀원모집
            </NavLink>
            <NavLink to="/bookmarks" className={navLinkClass}>
              북마크
            </NavLink>
          </nav>
          <div className="filter-wrap">
            <button className="filter-btn" onClick={() => setIsFilterOpen(!isFilterOpen)}>
              {univLabel} · {regionLabel} · {gradeLabel}
              <span className="chev">▾</span>
            </button>
            {isFilterOpen && (
              <>
                <button
                  className="filter-scrim"
                  onClick={() => setIsFilterOpen(false)}
                  aria-label="필터 닫기"
                />
                <div className="filter-dd">
                  <p className="filter-label">설립 유형</p>
                  <div className="chip-row">
                    {univOptions.map((o) => (
                      <button
                        key={o.value}
                        className={`chip ${univ === o.value ? "active" : ""}`}
                        onClick={() => setUniv(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="filter-label">
                    지역 <span className="filter-note">— 재학 학교 소재지 기준</span>
                  </p>
                  <div className="chip-row scroll">
                    {regionOptions.map((o) => (
                      <button
                        key={o.value}
                        className={`chip sm ${region === o.value ? "active" : ""}`}
                        onClick={() => setRegion(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="filter-label">
                    학년 <span className="filter-note">— 학년 조건이 있는 공고에만 적용돼요</span>
                  </p>
                  <div className="chip-row">
                    {gradeOptions.map((o) => (
                      <button
                        key={o.value}
                        className={`chip ${grade === o.value ? "active" : ""}`}
                        onClick={() => setGrade(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button className="filter-apply" onClick={() => setIsFilterOpen(false)}>
                    확인
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <Outlet
        context={{
          univLabel,
          regionLabel,
          gradeLabel,
          region,
          grade,
          openFilter: () => setIsFilterOpen(true),
          boardPosts,
          addBoardPost,
          addComment,
          bookmarks,
          toggleBookmark,
        }}
      />

      <footer>
        <div className="inner">
          <span className="brand">캠퍼스핏</span>
          <span className="note">대학생을 위한 정보 큐레이션 · 실제 서비스가 아닌 프로토타입입니다.</span>
        </div>
      </footer>
    </>
  );
}
