import { Link, useOutletContext, useParams } from "react-router-dom";
import { categories, listings } from "../data/mockListings";
import CardNewsThumb from "../components/CardNewsThumb";
import BookmarkStar from "../components/BookmarkStar";

export default function ListingDetail() {
  const { listingId } = useParams();
  const { bookmarks, toggleBookmark } = useOutletContext();
  const listing = listings.find((l) => l.id === listingId);
  const category = categories.find((c) => c.id === listing.categoryId);

  return (
    <div className="detail">
      <p className="crumb">
        <Link to="/">홈</Link> / <Link to={`/category/${category.id}`}>{category.label}</Link>
      </p>
      <div className="detail-meta">
        <span className={listing.dDay <= 7 ? "pill-alert" : "pill-neutral"}>D-{listing.dDay}</span>
        <span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{listing.desc}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{listing.title}</h1>
        <BookmarkStar
          active={bookmarks.includes(listing.id)}
          onClick={() => toggleBookmark(listing.id)}
          size={26}
        />
      </div>
      <CardNewsThumb
        categoryId={category.id}
        categoryLabel={category.label}
        interest={listing.interest}
        title={listing.title}
        dDay={listing.dDay}
      />
      <p className="body-txt">
        {listing.desc} 조건에 해당하는 분들을 위한 {category.label} 정보예요. 지원 자격을 다시
        확인하고, 마감 전에 공식 페이지에서 신청을 완료해주세요.
      </p>
      <div className="info-box">
        <p className="info-title">한눈에 정리</p>
        <div className="info-row">
          <span className="k">대상</span>
          <span className="v">{listing.desc}</span>
        </div>
        <div className="info-row">
          <span className="k">지원내용</span>
          <span className="v">
            {category.label} · {listing.title}
          </span>
        </div>
        <div className="info-row">
          <span className="k">신청기간</span>
          <span className="v">마감 D-{listing.dDay}</span>
        </div>
        <div className="info-row">
          <span className="k">신청방법</span>
          <span className="v">공식 페이지에서 온라인 접수</span>
        </div>
      </div>
      <a className="btn-outline" href="#" onClick={(e) => e.preventDefault()}>
        공식 페이지에서 지원하기 ↗
      </a>
      {listing.teamBoardCount > 0 && (
        <Link className="btn-team" to={`/board/listing/${listing.id}`}>
          팀원 모집하기
        </Link>
      )}
    </div>
  );
}
