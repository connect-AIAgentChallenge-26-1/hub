import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { categories, listings, interestOptionsByCategory } from "../data/mockListings";
import BookmarkStar from "../components/BookmarkStar";

const GRADE_GUIDE_CATEGORIES = ["contest", "activity", "internship"];

export default function CategoryList() {
  const { categoryId } = useParams();
  const { univLabel, regionLabel, gradeLabel, region, grade, bookmarks, toggleBookmark } = useOutletContext();
  const [interest, setInterest] = useState("all");

  useEffect(() => {
    setInterest("all");
  }, [categoryId]);

  const category = categories.find((c) => c.id === categoryId);
  const interestOptions = interestOptionsByCategory[categoryId];
  const showGradeGuide = GRADE_GUIDE_CATEGORIES.includes(categoryId) && grade !== "all";

  const categoryListings = listings
    .filter((l) => l.categoryId === categoryId)
    .filter((l) => region === "all" || !l.eligibleRegions || l.eligibleRegions.includes(region))
    .filter((l) => grade === "all" || !l.eligibleGrades || l.eligibleGrades.includes(grade))
    .filter((l) => interest === "all" || l.interest === interest)
    .sort((a, b) => a.dDay - b.dDay);

  return (
    <div className="cat-layout shell">
      <aside className="cat-aside">
        <p className="aside-label">카테고리</p>
        {categories.map((c) => (
          <Link key={c.id} to={`/category/${c.id}`} className={c.id === categoryId ? "active" : undefined}>
            {c.label}
          </Link>
        ))}
        <Link to="/board">팀원모집</Link>
      </aside>
      <div>
        <p className="crumb">
          <Link to="/">홈</Link> / {category.label}
        </p>
        <div className="cat-head">
          <h1>{category.label}</h1>
          <span className="filter-pill">
            {univLabel} · {regionLabel} · {gradeLabel}
          </span>
        </div>
        <p className="cat-sub">{category.desc}</p>

        {interestOptions && (
          <div style={{ marginBottom: 24 }}>
            <p className="filter-label">관심분야</p>
            <div className="chip-row">
              <button
                className={`chip sm ${interest === "all" ? "active" : ""}`}
                onClick={() => setInterest("all")}
              >
                전체
              </button>
              {interestOptions.map((opt) => (
                <button
                  key={opt}
                  className={`chip sm ${interest === opt ? "active" : ""}`}
                  onClick={() => setInterest(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="divider-list">
          {categoryListings.map((l) => (
            <Link className="row" to={`/listing/${l.id}`} key={l.id}>
              <div className="main">
                <div className="top-line">
                  <span className="title">{l.title}</span>
                  {l.teamBoardCount > 0 && (
                    <span className="pill-team">팀원모집 {l.teamBoardCount}건</span>
                  )}
                  {showGradeGuide && l.eligibleGrades?.includes(grade) && (
                    <span className="pill-grade">{gradeLabel} 추천</span>
                  )}
                </div>
                <div className="desc">{l.desc}</div>
              </div>
              <span className={l.dDay <= 7 ? "pill-alert" : "pill-neutral"}>D-{l.dDay}</span>
              <BookmarkStar
                active={bookmarks.includes(l.id)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleBookmark(l.id);
                }}
              />
            </Link>
          ))}
          {categoryListings.length === 0 && (
            <p className="cat-sub">선택한 조건에 맞는 공고가 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
