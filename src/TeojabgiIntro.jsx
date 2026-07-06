import React, { useState, useMemo } from "react";

const NEIGHBORHOODS = [
  { name: "화양동", commute: 96, rent: 80, safety: 74, amenity: 93, transit: 90 },
  { name: "자양동", commute: 82, rent: 88, safety: 80, amenity: 78, transit: 85 },
  { name: "군자동", commute: 75, rent: 92, safety: 85, amenity: 70, transit: 78 },
  { name: "성수동", commute: 70, rent: 60, safety: 78, amenity: 95, transit: 88 },
];

const FACTORS = [
  { key: "commute", label: "통학" },
  { key: "rent", label: "월세" },
  { key: "safety", label: "치안" },
  { key: "amenity", label: "편의시설" },
  { key: "transit", label: "교통" },
];

const DEFAULT_WEIGHTS = { commute: 35, rent: 25, safety: 15, amenity: 15, transit: 10 };

const TOC = [
  { n: "01", label: "개요" },
  { n: "02", label: "왜 매물이 아니라 지역인가" },
  { n: "03", label: "동작 순서" },
  { n: "04", label: "추천 알고리즘" },
  { n: "05", label: "필요한 공공데이터" },
  { n: "06", label: "AI를 넣는다면" },
];

const COMPARISON = [
  { label: "지역 평균 월세 · 전세 시세", ok: true, source: "한국부동산원" },
  { label: "실거래가 통계", ok: true, source: "국토교통부" },
  { label: "범죄 발생 통계 · 안심귀갓길", ok: true, source: "경찰청" },
  { label: "CCTV · 편의점 · 대중교통 위치", ok: true, source: "서울 열린데이터광장" },
  { label: "오늘 올라온 원룸 매물 (사진, 옵션)", ok: false, source: "직방 · 다방 — API 없음" },
  { label: "매물 상세 · 중개사 연락처", ok: false, source: "네이버 부동산 — 크롤링 약관 제한" },
];

const FLOW = [
  { title: "사용자 입력", desc: "학교, 예산, 통학 허용시간, 치안·편의시설 중요도, 여성안심 여부 등을 입력받는다." },
  { title: "공공데이터 조회", desc: "입력된 학교 위치를 기준으로 반경 내 행정동의 공공데이터를 불러온다." },
  { title: "지역별 점수 계산", desc: "통학·월세·치안·편의시설·교통 다섯 항목을 가중합으로 계산해 지역마다 점수를 매긴다." },
  { title: "TOP5 지역 추천", desc: "점수가 높은 순서대로 5개 지역을 근거 수치와 함께 보여준다." },
  { title: "외부 매물로 연결", desc: "실제 매물 확인은 네이버 부동산·직방 등 외부 플랫폼 링크로 안내한다." },
];

const PUBLIC_DATA_SOURCES = [
  { org: "교육부", data: "전국 대학 위치" },
  { org: "한국부동산원", data: "실거래가, 전월세 평균 시세" },
  { org: "경찰청", data: "범죄 발생 통계, 여성안심귀갓길" },
  { org: "서울 열린데이터광장", data: "CCTV, 편의점, 버스, 지하철 위치" },
  { org: "국토교통부", data: "전월세 신고 자료" },
];

const AI_USES = [
  { title: "자연어 검색", desc: "\"학교까지 20분 이내에 조용한 곳\" 같은 문장형 질의를 조건으로 변환." },
  { title: "후기 요약", desc: "지역 리뷰나 커뮤니티 글을 짧게 요약." },
  { title: "지역 장단점 설명", desc: "점수 결과를 자연어 문장으로 풀어서 설명." },
  { title: "상담 챗봇", desc: "추천 결과에 대한 추가 질문에 답변." },
];

export default function TeojabgiIntro() {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);

  const totalWeight = useMemo(
    () => Object.values(weights).reduce((sum, v) => sum + v, 0) || 1,
    [weights]
  );

  const ranked = useMemo(() => {
    return NEIGHBORHOODS.map((n) => {
      const raw = FACTORS.reduce((sum, f) => sum + n[f.key] * weights[f.key], 0);
      return { ...n, score: raw / totalWeight };
    }).sort((a, b) => b.score - a.score);
  }, [weights, totalWeight]);

  const handleWeightChange = (key, value) => {
    setWeights((prev) => ({ ...prev, [key]: Number(value) }));
  };

  const resetWeights = () => setWeights(DEFAULT_WEIGHTS);

  return (
    <div className="tj2-root">
      <style>{`
        .tj2-root {
          --ink: #0f172a;
          --ink-mid: #475569;
          --ink-faint: #94a3b8;
          --line: #e2e8f0;
          --bg: #ffffff;
          --bg-body: #f8fafc;
          --bg-alt: #f1f5f9;
          --accent: #2563eb;
          --accent-no: #ef4444;
          --accent-light: #dbeafe;
          --radius: 16px;
          font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
          background: var(--bg-body);
          color: var(--ink);
          width: 100%;
          min-height: 100vh;
          box-sizing: border-box;
          padding: 40px 20px;
        }
        .tj2-root * { box-sizing: border-box; }
        .tj2-shell { 
          max-width: 880px; 
          margin: 0 auto; 
          padding: 56px 48px; 
          background: var(--bg);
          border-radius: var(--radius);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
          border: 1px solid var(--line);
        }
        .tj2-masthead {
          display: flex; justify-content: space-between; align-items: flex-end;
          padding-bottom: 24px; border-bottom: 2px solid var(--ink); margin-bottom: 16px;
        }
        .tj2-masthead .tj2-title { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
        .tj2-masthead .tj2-meta { font-size: 13px; color: var(--ink-faint); text-align: right; line-height: 1.5; font-weight: 500; }
        .tj2-summary {
          font-size: 16px; line-height: 1.7; color: var(--ink-mid);
          padding: 24px 0 32px; border-bottom: 1px solid var(--line); margin-bottom: 40px;
        }
        .tj2-summary strong { color: var(--accent); font-weight: 700; background: var(--accent-light); padding: 2px 6px; border-radius: 4px; }
        .tj2-toc { margin-bottom: 56px; background: var(--bg-alt); padding: 24px 32px; border-radius: 12px; border: 1px solid var(--line); }
        .tj2-toc-label { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; color: var(--ink-faint); margin-bottom: 16px; text-transform: uppercase; }
        .tj2-toc-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 32px; }
        .tj2-toc-item { display: flex; gap: 12px; font-size: 15px; padding: 8px 0; border-bottom: 1px dashed var(--line); color: var(--ink-mid); transition: color 0.2s; }
        .tj2-toc-item:hover { color: var(--accent); cursor: default; }
        .tj2-toc-item .tj2-toc-num { font-weight: 800; color: var(--accent); min-width: 24px; }
        .tj2-section { margin-bottom: 64px; scroll-margin-top: 40px; }
        .tj2-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .tj2-section-num { font-size: 14px; font-weight: 800; color: #fff; background: var(--ink); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
        .tj2-section-head h2 { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
        .tj2-section > p.tj2-lead { font-size: 15px; line-height: 1.7; color: var(--ink-mid); margin: 0 0 24px; max-width: 680px; }
        .tj2-table { width: 100%; border-collapse: collapse; font-size: 14px; background: var(--bg); }
        .tj2-table th { text-align: left; font-size: 13px; color: var(--ink-faint); font-weight: 700; padding: 12px 16px; border-bottom: 2px solid var(--line); background: var(--bg-alt); }
        .tj2-table td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
        .tj2-table tr:hover td { background: #f8fafc; }
        .tj2-table td.tj2-mark { width: 40px; text-align: center; font-weight: 800; font-size: 16px; }
        .tj2-table td.tj2-source { color: var(--ink-faint); white-space: nowrap; font-size: 13px; font-weight: 500; }
        .tj2-mark.ok { color: var(--accent); }
        .tj2-mark.no { color: var(--accent-no); }
        .tj2-steps { position: relative; padding-left: 8px; margin-top: 24px; }
        .tj2-step { display: grid; grid-template-columns: 40px 1fr; gap: 20px; position: relative; padding-bottom: 32px; }
        .tj2-step:last-child { padding-bottom: 0; }
        .tj2-step-marker { display: flex; flex-direction: column; align-items: center; position: relative; }
        .tj2-step-circle {
          width: 32px; height: 32px; border-radius: 50%; background: var(--accent-light); color: var(--accent);
          display: flex; align-items: center; justify-content: center; font-size: 14px;
          font-weight: 800; flex-shrink: 0; box-shadow: 0 0 0 4px var(--bg); z-index: 2;
        }
        .tj2-step-line { position: absolute; top: 32px; bottom: -20px; left: 15px; width: 2px; background: var(--line); z-index: 1; }
        .tj2-step-body { padding-top: 4px; }
        .tj2-step-body h3 { font-size: 16px; font-weight: 700; margin: 0 0 8px; color: var(--ink); }
        .tj2-step-body p { font-size: 14px; line-height: 1.6; color: var(--ink-mid); margin: 0; }
        .tj2-calc { background: var(--bg); border: 1px solid var(--line); padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .tj2-formula {
          font-family: ui-monospace, "Courier New", monospace; font-size: 13px; background: var(--bg-alt);
          border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0 0 28px; line-height: 1.8;
          overflow-x: auto; color: var(--ink-mid); font-weight: 500;
        }
        .tj2-sliders { display: grid; gap: 16px; margin-bottom: 24px; }
        .tj2-slider-row { display: grid; grid-template-columns: 80px 1fr 40px; align-items: center; gap: 16px; }
        .tj2-slider-row label { font-size: 14px; font-weight: 700; color: var(--ink); }
        .tj2-slider-row input[type="range"] { width: 100%; accent-color: var(--accent); cursor: pointer; }
        .tj2-slider-row .tj2-val { font-family: ui-monospace, monospace; font-size: 14px; text-align: right; color: var(--accent); font-weight: 700; background: var(--accent-light); padding: 4px 8px; border-radius: 6px; }
        .tj2-reset { font-size: 13px; font-weight: 600; background: var(--bg-alt); border: 1px solid var(--line); color: var(--ink-mid); padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-bottom: 28px; transition: all 0.2s; }
        .tj2-reset:hover { background: var(--line); color: var(--ink); }
        .tj2-rank-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
        .tj2-rank-table th { text-align: left; font-size: 13px; color: var(--ink-faint); font-weight: 700; padding: 10px 12px; border-bottom: 2px solid var(--line); }
        .tj2-rank-table td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
        .tj2-rank-table td.tj2-rn { width: 40px; font-weight: 800; color: var(--ink-faint); font-size: 16px; }
        .tj2-rank-table tr:first-child td.tj2-rn { color: var(--accent); }
        .tj2-rank-table tr:first-child td { font-weight: 700; background: #f8fafc; }
        .tj2-rank-table td.tj2-bar { width: 45%; }
        .tj2-bar-track { height: 10px; background: var(--bg-alt); border-radius: 10px; overflow: hidden; }
        .tj2-bar-fill { height: 100%; background: var(--ink-faint); transition: width 0.4s ease; border-radius: 10px; }
        .tj2-rank-table tr:first-child .tj2-bar-fill { background: var(--accent); }
        .tj2-rank-table td.tj2-score { font-family: ui-monospace, monospace; text-align: right; font-weight: 700; color: var(--ink); }
        .tj2-data-list { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
        .tj2-data-row { display: grid; grid-template-columns: 200px 1fr; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--line); font-size: 14px; background: var(--bg); transition: background 0.2s; }
        .tj2-data-row:last-child { border-bottom: none; }
        .tj2-data-row:hover { background: var(--bg-alt); }
        .tj2-data-row .tj2-org { font-weight: 700; color: var(--ink); display: flex; align-items: center; }
        .tj2-data-row .tj2-org::before { content: ""; display: inline-block; width: 6px; height: 6px; background: var(--accent); border-radius: 50%; margin-right: 10px; }
        .tj2-data-row .tj2-desc { color: var(--ink-mid); display: flex; align-items: center; }
        .tj2-ai-list { display: grid; gap: 16px; }
        .tj2-ai-row { display: grid; grid-template-columns: 140px 1fr; gap: 16px; font-size: 14px; padding: 18px 20px; background: var(--bg-alt); border-radius: 10px; border: 1px solid var(--line); align-items: center; }
        .tj2-ai-row .tj2-ai-title { font-weight: 700; color: var(--ink); font-size: 15px; }
        .tj2-ai-row .tj2-ai-desc { color: var(--ink-mid); line-height: 1.5; }
        .tj2-note { margin-top: 40px; background: var(--accent-light); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; font-size: 13.5px; line-height: 1.7; color: var(--ink-mid); }
        .tj2-note strong { color: var(--ink); font-weight: 700; }
        .tj2-footer { margin-top: 64px; border-top: 1px solid var(--line); padding-top: 24px; font-size: 13px; color: var(--ink-faint); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .tj2-hero { margin: -56px -48px 40px; border-radius: var(--radius) var(--radius) 0 0; overflow: hidden; }
        .tj2-hero img { width: 100%; height: auto; display: block; }
        @media (max-width: 640px) {
          .tj2-root { padding: 0; }
          .tj2-shell { padding: 32px 20px; border-radius: 0; border: none; box-shadow: none; }
          .tj2-hero { margin: 0 -20px 32px; border-radius: 0; }
          .tj2-masthead { flex-direction: column; gap: 12px; align-items: flex-start; }
          .tj2-masthead .tj2-meta { text-align: left; }
          .tj2-toc-list { grid-template-columns: 1fr; }
          .tj2-data-row, .tj2-ai-row { grid-template-columns: 1fr; gap: 8px; }
          .tj2-data-row .tj2-org::before { display: none; }
          .tj2-slider-row { grid-template-columns: 60px 1fr 40px; }
        }
      `}</style>

      <div className="tj2-shell">
        <div className="tj2-hero">
          <img src="/hero.png" alt="터잡기 — 어차피 학교 앞? 내게 맞는 진짜 동네 찾기" />
        </div>

        <div className="tj2-masthead">
          <span className="tj2-title">터잡기 — 대학생 자취 지역 추천 서비스</span>
          <span className="tj2-meta">기획 소개 · v0.1<br />2026-07</span>
        </div>

        <p className="tj2-summary">
          이 서비스는 <strong>매물이 아니라 지역</strong>을 추천한다. 학교
          위치, 예산, 통학 허용시간, 치안·편의시설 중요도를 입력받아,
          공공데이터로 계산한 지역별 점수를 근거로 상위 5개 지역을
          제시한다. 추천 알고리즘은 <strong>가중합 점수식</strong>이며, AI나
          LLM은 사용하지 않는다. 실제 매물 확인은 네이버 부동산·직방 등
          외부 플랫폼으로 연결한다.
        </p>

        <div className="tj2-toc">
          <div className="tj2-toc-label">목차</div>
          <div className="tj2-toc-list">
            {TOC.map((item) => (
              <div className="tj2-toc-item" key={item.n}>
                <span className="tj2-toc-num">{item.n}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <section className="tj2-section" id="section-02">
          <div className="tj2-section-head">
            <span className="tj2-section-num">02</span>
            <h2>왜 매물이 아니라 지역을 추천하는가</h2>
          </div>
          <p className="tj2-lead">
            지역 단위 통계는 공공데이터로 확보할 수 있다. 반면 오늘 올라온
            원룸 한 건 한 건의 정보는 대부분 민간 플랫폼이 보유하고 있고,
            API가 없거나 약관상 수집이 제한된다. 그래서 이 서비스는 확보
            가능한 데이터로 할 수 있는 범위까지만 다룬다.
          </p>
          <table className="tj2-table">
            <thead>
              <tr><th></th><th>항목</th><th>출처 · 비고</th></tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label}>
                  <td className="tj2-mark">
                    <span className={row.ok ? "tj2-mark ok" : "tj2-mark no"}>
                      {row.ok ? "○" : "✕"}
                    </span>
                  </td>
                  <td>{row.label}</td>
                  <td className="tj2-source">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="tj2-section" id="section-03">
          <div className="tj2-section-head">
            <span className="tj2-section-num">03</span>
            <h2>동작 순서</h2>
          </div>
          <p className="tj2-lead">
            사용자 입력부터 외부 매물 연결까지 다섯 단계로 진행된다. 순서가
            바뀌지 않는 고정된 파이프라인이다.
          </p>
          <div className="tj2-steps">
            {FLOW.map((step, i) => (
              <div className="tj2-step" key={step.title}>
                <div className="tj2-step-marker">
                  <div className="tj2-step-circle">{i + 1}</div>
                  {i < FLOW.length - 1 && <div className="tj2-step-line" />}
                </div>
                <div className="tj2-step-body">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="tj2-section" id="section-04">
          <div className="tj2-section-head">
            <span className="tj2-section-num">04</span>
            <h2>추천 알고리즘</h2>
          </div>
          <p className="tj2-lead">
            다섯 항목(통학·월세·치안·편의시설·교통)의 가중합으로 지역
            점수를 계산한다. 아래 슬라이더를 움직이면 가중치가 바뀌고,
            건국대학교 기준 예시 지역 4곳의 순위가 그에 따라 다시
            계산된다.
          </p>
          <div className="tj2-calc">
            <div className="tj2-formula">
              추천점수 = {FACTORS.map((f, i) => (
                <span key={f.key}>
                  {i > 0 && " + "}
                  ({(weights[f.key] / totalWeight).toFixed(2)} × {f.label}점수)
                </span>
              ))}
            </div>

            <div className="tj2-sliders">
              {FACTORS.map((f) => (
                <div className="tj2-slider-row" key={f.key}>
                  <label>{f.label}</label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weights[f.key]}
                    onChange={(e) => handleWeightChange(f.key, e.target.value)}
                    aria-label={`${f.label} 중요도`}
                  />
                  <span className="tj2-val">{weights[f.key]}</span>
                </div>
              ))}
            </div>

            <button className="tj2-reset" onClick={resetWeights}>기본값으로 초기화</button>

            <table className="tj2-rank-table">
              <thead>
                <tr><th>순위</th><th>지역</th><th></th><th style={{ textAlign: "right" }}>점수</th></tr>
              </thead>
              <tbody>
                {ranked.map((n, i) => (
                  <tr key={n.name}>
                    <td className="tj2-rn">{i + 1}</td>
                    <td>{n.name}</td>
                    <td className="tj2-bar">
                      <div className="tj2-bar-track">
                        <div className="tj2-bar-fill" style={{ width: `${Math.min(100, n.score)}%` }} />
                      </div>
                    </td>
                    <td className="tj2-score">{n.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="tj2-section" id="section-05">
          <div className="tj2-section-head">
            <span className="tj2-section-num">05</span>
            <h2>필요한 공공데이터</h2>
          </div>
          <p className="tj2-lead">아래 다섯 곳의 공공데이터만으로 추천 엔진에 필요한 데이터가 대부분 확보된다.</p>
          <div className="tj2-data-list">
            {PUBLIC_DATA_SOURCES.map((s) => (
              <div className="tj2-data-row" key={s.org}>
                <span className="tj2-org">{s.org}</span>
                <span className="tj2-desc">{s.data}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="tj2-section" id="section-06">
          <div className="tj2-section-head">
            <span className="tj2-section-num">06</span>
            <h2>AI를 넣는다면</h2>
          </div>
          <p className="tj2-lead">핵심 추천 로직은 점수식만으로 충분하다. AI는 아래와 같은 부가 기능에서만 의미가 있다.</p>
          <div className="tj2-ai-list">
            {AI_USES.map((u) => (
              <div className="tj2-ai-row" key={u.title}>
                <span className="tj2-ai-title">{u.title}</span>
                <span className="tj2-ai-desc">{u.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="tj2-note">
          <strong>구현 범위 관련.</strong> 전국 단위 지역을 한 번에
          구현하기는 데이터 확보·검증 범위상 어려울 수 있다. 이 경우 서울시
          또는 사전에 정한 일부 지역(예: 대학가 인접 자치구)을 우선
          대상으로 구현하고, 이후 다른 지역으로 단계적으로 확장하는 것을
          목표로 한다.
        </div>

        <div className="tj2-footer">
          <span>실제 매물 확인은 네이버 부동산 · 직방 · 다방 등 외부 플랫폼에서 진행한다.</span>
          <span>터잡기 v0.1</span>
        </div>
      </div>
    </div>
  );
}