// client/src/data의 mock 데이터를 그대로 DB에 옮겨 담는 1회성 시드 스크립트.
// dDay(상대 일수)는 DB에 그대로 두면 날짜가 지날수록 틀어지므로, 실행 시점 기준
// 실제 마감일(deadline_date)로 변환해서 저장한다. 매번 새로 실행하면 오늘 날짜 기준으로 다시 계산된다.
import { db } from "./client.js";
import { categories, listings } from "../../../client/src/data/mockListings.js";
import { boardPosts } from "../../../client/src/data/mockBoardPosts.js";

function toDeadlineDate(dDay) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dDay);
  return d.toISOString().slice(0, 10);
}

db.exec(
  "DELETE FROM comments; DELETE FROM board_posts; DELETE FROM listings; DELETE FROM categories;"
);

const insertCategory = db.prepare(
  "INSERT INTO categories (id, label, desc) VALUES (@id, @label, @desc)"
);
for (const c of categories) insertCategory.run(c);

const insertListing = db.prepare(`
  INSERT INTO listings (id, category_id, title, desc, deadline_date, eligible_regions, eligible_grades, interest, team_board_count)
  VALUES (@id, @categoryId, @title, @desc, @deadlineDate, @eligibleRegions, @eligibleGrades, @interest, @teamBoardCount)
`);
for (const l of listings) {
  insertListing.run({
    id: l.id,
    categoryId: l.categoryId,
    title: l.title,
    desc: l.desc,
    deadlineDate: toDeadlineDate(l.dDay),
    eligibleRegions: l.eligibleRegions ? JSON.stringify(l.eligibleRegions) : null,
    eligibleGrades: l.eligibleGrades ? JSON.stringify(l.eligibleGrades) : null,
    interest: l.interest || null,
    teamBoardCount: l.teamBoardCount || 0,
  });
}

const insertPost = db.prepare(
  "INSERT INTO board_posts (id, listing_id, title, meta, body) VALUES (@id, @listingId, @title, @meta, @body)"
);
const insertComment = db.prepare(
  "INSERT INTO comments (post_id, who, text) VALUES (@postId, @who, @text)"
);
for (const p of boardPosts) {
  insertPost.run({ id: p.id, listingId: p.listingId, title: p.title, meta: p.meta, body: p.body });
  for (const c of p.comments) {
    insertComment.run({ postId: p.id, who: c.who, text: c.text });
  }
}

console.log(
  `시드 완료 — categories ${categories.length}, listings ${listings.length}, board_posts ${boardPosts.length}`
);
