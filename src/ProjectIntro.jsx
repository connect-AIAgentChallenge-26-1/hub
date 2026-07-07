import React from "react";

/**
 * ProjectIntro
 * "캘린더 기반 밥약 매칭 서비스" 프로젝트 소개 컴포넌트
 * 외부 라이브러리 없이 순수 React + 인라인 스타일 태그로만 구성
 */

const WEEKDAYS = ["월", "화", "수", "목", "금"];

// 시간표 그리드 예시 데이터: 각 셀은 상태를 가짐
// busy = 수업/일정 있음, free = 개인 공강, match = 친구와 겹치는 공강(핵심 가치)
const SCHEDULE_GRID = [
  ["busy", "busy", "free", "busy", "match"],
  ["busy", "match", "busy", "free", "busy"],
  ["free", "busy", "match", "busy", "busy"],
  ["busy", "busy", "busy", "match", "free"],
];

const FEATURES = [
  {
    label: "통합",
    title: "에타 · 구글 · 애플 캘린더를 한 곳에",
    desc: "여러 곳에 흩어진 일정을 매번 옮기지 않아도, 연결만 해두면 자동으로 모입니다.",
  },
  {
    label: "선택 공유",
    title: "보여주고 싶은 일정만 골라 공유",
    desc: "카테고리 단위로 공개 범위를 정해, 동아리 일정은 동아리 친구에게만.",
  },
  {
    label: "매칭",
    title: "겹치는 빈 시간을 자동으로 계산",
    desc: "언제 되냐고 묻지 않아도, 서로 비는 시간을 바로 찾아줍니다.",
  },
  {
    label: "추천",
    title: "그 시간에 갈 만한 학교 근처 맛집",
    desc: "약속 시간이 정해지면, 그 자리에서 바로 장소까지 이어집니다.",
  },
];

function ScheduleGrid() {
  return (
    <div className="grid-wrap">
      <div className="grid-head">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid-body">
        {SCHEDULE_GRID.map((row, r) =>
          row.map((cell, c) => (
            <div key={`${r}-${c}`} className={`cell ${cell}`} />
          ))
        )}
      </div>
      <div className="grid-legend">
        <span><i className="dot busy" />일정 있음</span>
        <span><i className="dot free" />내 공강</span>
        <span><i className="dot match" />친구와 겹치는 시간</span>
      </div>
    </div>
  );
}

export default function ProjectIntro() {
  return (
    <div className="intro-root">
      <style>{`
        .intro-root {
          --ink: #101a30;
          --surface: #16223d;
          --surface-2: #1e2c4d;
          --line: #2c3b60;
          --text: #eef1fa;
          --text-muted: #93a2c4;
          --match: #ffb454;
          --free: #4fd1a5;
          --busy: #32406a;

          background: var(--ink);
          color: var(--text);
          font-family: -apple-system, "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif;
          padding: 56px 24px;
          border-radius: 20px;
          max-width: 720px;
          margin: 0 auto;
        }
        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 12px;
          color: var(--match);
          font-weight: 700;
          margin-bottom: 14px;
        }
        h1 {
          font-size: clamp(28px, 4vw, 40px);
          line-height: 1.25;
          margin: 0 0 14px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .lede {
          color: var(--text-muted);
          font-size: 16px;
          line-height: 1.6;
          max-width: 46ch;
          margin: 0 0 40px;
        }
        .grid-wrap {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 44px;
        }
        .grid-head {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          margin-bottom: 10px;
        }
        .grid-head span {
          text-align: center;
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .grid-body {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          grid-auto-rows: 28px;
          gap: 6px;
        }
        .cell {
          border-radius: 6px;
        }
        .cell.busy { background: var(--busy); }
        .cell.free { background: rgba(79, 209, 165, 0.18); border: 1px dashed var(--free); }
        .cell.match {
          background: var(--match);
          box-shadow: 0 0 0 3px rgba(255, 180, 84, 0.18);
        }
        .grid-legend {
          display: flex;
          gap: 18px;
          margin-top: 16px;
          font-size: 12px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }
        .grid-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .dot {
          width: 9px;
          height: 9px;
          border-radius: 3px;
          display: inline-block;
        }
        .dot.busy { background: var(--busy); }
        .dot.free { background: transparent; border: 1px dashed var(--free); }
        .dot.match { background: var(--match); }

        .features {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2px;
          border-top: 1px solid var(--line);
        }
        .feature {
          display: grid;
          grid-template-columns: 88px 1fr;
          gap: 18px;
          padding: 20px 4px;
          border-bottom: 1px solid var(--line);
        }
        .feature-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--match);
          letter-spacing: 0.04em;
          padding-top: 2px;
        }
        .feature-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 6px;
        }
        .feature-desc {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
        }
      `}</style>

      <div className="eyebrow">4-Week Project</div>
      <h1>흩어진 시간표 속에서,<br />겹치는 순간을 찾아드립니다</h1>
      <p className="lede">
        에타, 구글 캘린더, 애플 캘린더에 나눠진 일정을 한 곳에 모으고,
        친구와 비는 시간이 겹치는 순간을 자동으로 찾아 근처 맛집까지 이어주는
        캘린더 기반 밥약 매칭 서비스입니다.
      </p>

      <ScheduleGrid />

      <div className="features">
        {FEATURES.map((f) => (
          <div className="feature" key={f.label}>
            <div className="feature-label">{f.label}</div>
            <div>
              <p className="feature-title">{f.title}</p>
              <p className="feature-desc">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}