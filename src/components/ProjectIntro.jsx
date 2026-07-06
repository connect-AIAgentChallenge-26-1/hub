function ProjectIntro() {
  return (
    <main className="intro-page">
      <section className="intro-section" aria-labelledby="project-title">
        <p className="intro-label">No-show Risk Service</p>

        <h1 id="project-title">소상공인 노쇼 위험도 조회 서비스</h1>
        <p className="intro-description">
          고객 개인정보를 직접 공유하지 않고, 시스템 내부 매칭을 통해 예약
          노쇼 이력을 위험도 형태로 확인하는 웹서비스입니다.
        </p>

        <div className="intro-list">
          <article className="intro-item">
            <strong>비공개 매칭</strong>
            <p>
              전화번호는 화면에 노출하지 않고 시스템 내부에서만 노쇼 이력과
              매칭합니다.
            </p>
          </article>

          <article className="intro-item">
            <strong>위험도 표시</strong>
            <p>
              다른 가게에는 이름, 전화번호, 신고 가게명을 공개하지 않고 낮음,
              보통, 높음으로만 결과를 제공합니다.
            </p>
          </article>

          <article className="intro-item">
            <strong>권리 보호</strong>
            <p>
              허위 등록을 줄이기 위해 예약 기록을 기준으로 등록하고, 고객의
              이의제기와 기간 만료 후 자동 삭제를 지원합니다.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default ProjectIntro;
