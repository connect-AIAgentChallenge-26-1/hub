function ProjectIntro() {
  return (
    <main className="page">
      <div className="container">
        <header className="hero">
          <span className="badge">No-show Risk Check Service</span>
          <h1 id="project-title">ShowUp</h1>
          <p className="subtitle">자영업자를 위한 노쇼 위험도 조회 서비스</p>
          <p className="lead">
            예약 이력을 기반으로 노쇼 위험도를 분석하고, 예약금 요청과 재확인
            알림 같은 대응 방식을 추천하는 예방 중심 서비스입니다.
          </p>
          <div className="tags">
            <span>예약금 요청 추천</span>
            <span>재확인 알림</span>
            <span>간편 취소 유도</span>
          </div>
        </header>

        <section className="risk-preview" aria-label="위험도 조회 예시">
          <div className="perforation" aria-hidden="true" />
          <div className="risk-preview-header">
            <span>조회 결과</span>
            <strong className="stamp">보통</strong>
          </div>
          <div className="risk-meter">
            <span style={{ width: "62%" }} />
          </div>
          <dl>
            <div>
              <dt>표시 정보</dt>
              <dd>최근 6개월 내 노쇼 이력 있음</dd>
            </div>
            <div>
              <dt>숨김 정보</dt>
              <dd>이름, 전화번호, 신고 가게명</dd>
            </div>
            <div>
              <dt>고객 권리</dt>
              <dd>이의제기 및 정정 요청 가능</dd>
            </div>
          </dl>
        </section>

        <section className="features" aria-label="핵심 기능">
          <article>
            <span>01</span>
            <h2>예방 중심 대응</h2>
            <p>위험도에 따라 예약금 요청, 재확인 알림, 간편 취소 유도를 추천합니다.</p>
          </article>
          <article>
            <span>02</span>
            <h2>허위 등록 방지</h2>
            <p>예약 기록 기반 등록과 중복 신고 제한으로 부정확한 등록을 줄입니다.</p>
          </article>
          <article>
            <span>03</span>
            <h2>고객 보호 장치</h2>
            <p>고객 이의제기와 일정 기간 후 자동 삭제로 부당한 등록을 방지합니다.</p>
          </article>
        </section>

        <section className="difference" aria-label="서비스 차별점">
          <strong>차별점</strong>
          <p>
            ShowUp은 노쇼 고객을 공유하는 블랙리스트가 아니라, 예약 이력을
            기반으로 위험도를 분석하고 상황에 맞는 대응 방식을 추천하는 예방
            중심 서비스입니다.
          </p>
        </section>
      </div>
    </main>
  );
}

export default ProjectIntro;
