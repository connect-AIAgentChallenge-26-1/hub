import { Link, useOutletContext, useParams } from "react-router-dom";
import { listings } from "../data/mockListings";

export default function Board() {
  const { listingId } = useParams();
  const { boardPosts } = useOutletContext();
  const listing = listingId ? listings.find((l) => l.id === listingId) : null;

  const posts = listingId
    ? boardPosts.filter((p) => p.listingId === listingId)
    : boardPosts;

  return (
    <div className="detail">
      <p className="crumb">
        <Link to="/">홈</Link>
        {listing && (
          <>
            {" / "}
            <Link to={`/listing/${listing.id}`}>{listing.title}</Link>
          </>
        )}
      </p>

      {listing ? (
        <>
          <div className="board-head">
            <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: "-.02em", margin: "0 0 8px" }}>
              {listing.title}의 팀원모집
            </h1>
            <Link
              className="btn-primary"
              style={{ padding: "9px 18px", fontSize: 13 }}
              to={`/board/listing/${listing.id}/write`}
            >
              글쓰기
            </Link>
          </div>
          <p className="cat-sub">{posts.length}건 — 이 공고에 지원하려는 학생만 모여요</p>
        </>
      ) : (
        <>
          <h1 style={{ fontWeight: 800, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 8px" }}>
            팀원모집
          </h1>
          <p className="cat-sub">
            공모전·대외활동을 함께할 팀원을 구하고, 지원할 수 있어요. 글쓰기는 각 공고의 팀원모집
            화면에서 할 수 있어요.
          </p>
        </>
      )}

      {posts.map((p) => {
        const postListing = listings.find((l) => l.id === p.listingId);
        return (
          <Link className="post-card" to={`/board/post/${p.id}`} key={p.id}>
            <div className="top">
              <span className="title">{p.title}</span>
              <span className={p.dDay <= 7 ? "pill-alert" : "pill-neutral"}>D-{p.dDay}</span>
            </div>
            <p className="meta">
              {!listing && (
                <span style={{ color: "var(--bulb-ink)", fontWeight: 600 }}>{postListing.title} · </span>
              )}
              {p.meta}
            </p>
          </Link>
        );
      })}
      {posts.length === 0 && <p className="cat-sub">아직 등록된 팀원모집 글이 없어요.</p>}
    </div>
  );
}
