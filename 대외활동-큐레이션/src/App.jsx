import { useState } from "react";
import { ACTIVITIES, MAJORS, REGIONS, ENROLLMENTS } from "./data/activities";
import { splitByMatch } from "./match";
import "./App.css";

const GPA_OPTIONS = [4.5, 4.0, 3.5, 3.0, 2.5];

export default function App() {
  // 내 조건. income·gpa는 null이면 "잘 모름" → 매칭에서 확인 필요로 처리된다.
  const [profile, setProfile] = useState({
    grade: 3,
    major: "공학",
    region: "수도권",
    enrollment: "재학",
    income: 5,
    gpa: null,
  });

  const set = (key, value) => setProfile((p) => ({ ...p, [key]: value }));

  const { eligible, ineligible, review } = splitByMatch(ACTIVITIES, profile);

  return (
    <main>
      <header className="head">
        <h1>대외활동 큐레이션</h1>
        <p>내 조건을 입력하면, 지원 가능한 것만 골라줍니다. 모르는 항목은 잘 모름으로 두세요.</p>
      </header>

      <section className="form">
        <label>
          학년
          <select value={profile.grade} onChange={(e) => set("grade", Number(e.target.value))}>
            {[1, 2, 3, 4].map((g) => <option key={g} value={g}>{g}학년</option>)}
          </select>
        </label>
        <label>
          전공
          <select value={profile.major} onChange={(e) => set("major", e.target.value)}>
            {MAJORS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          지역
          <select value={profile.region} onChange={(e) => set("region", e.target.value)}>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>
          재학상태
          <select value={profile.enrollment} onChange={(e) => set("enrollment", e.target.value)}>
            {ENROLLMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          소득분위
          <select
            value={profile.income ?? ""}
            onChange={(e) => set("income", e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">잘 모름</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}분위</option>)}
          </select>
        </label>
        <label>
          학점
          <select
            value={profile.gpa ?? ""}
            onChange={(e) => set("gpa", e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">잘 모름</option>
            {GPA_OPTIONS.map((v) => <option key={v} value={v}>{v.toFixed(1)}</option>)}
          </select>
        </label>
      </section>

      <section>
        <h2 className="section-title ok">지원 가능 ({eligible.length})</h2>
        <ul className="list">
          {eligible.map((a) => (
            <li key={a.id} className="card">
              <div className="card-top">
                <span className="cat">{a.category}</span>
                <span className="deadline">~{a.deadline}</span>
              </div>
              <a className="title" href={a.url} target="_blank" rel="noopener">{a.title}</a>
              <p className="org">{a.org} · {a.source}</p>
            </li>
          ))}
          {eligible.length === 0 && <li className="empty">조건에 맞는 활동이 없습니다.</li>}
        </ul>
      </section>

      <section>
        <h2 className="section-title review">확인 필요 ({review.length})</h2>
        <ul className="list">
          {review.map((a) => (
            <li key={a.id} className="card review-card">
              <div className="card-top">
                <span className="cat">{a.category}</span>
                <span className="deadline">~{a.deadline}</span>
              </div>
              <a className="title" href={a.url} target="_blank" rel="noopener">{a.title}</a>
              <p className="note">확인 필요: {a.unknown.map((u) => `${u.label}(${u.req})`).join(", ")} — 잘 모름으로 판정 보류</p>
            </li>
          ))}
          {review.length === 0 && <li className="empty">확인이 필요한 활동이 없습니다.</li>}
        </ul>
      </section>

      <section>
        <h2 className="section-title no">지원 불가 ({ineligible.length})</h2>
        <ul className="list">
          {ineligible.map((a) => (
            <li key={a.id} className="card muted">
              <span className="title-muted">{a.title}</span>
              <ul className="reasons">
                {a.failed.map((f) => (
                  <li key={f.label}>
                    <span className="rlabel">{f.label}</span>
                    <span className="req">요구 {f.req}</span>
                    <span className="mine">내 조건 {f.mine}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {ineligible.length === 0 && <li className="empty">막힌 활동이 없습니다.</li>}
        </ul>
      </section>
    </main>
  );
}
