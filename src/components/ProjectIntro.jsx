function ProjectIntro() {
  return (
    <main className="intro-page">
      <section className="intro-section" aria-labelledby="project-title">
        <p className="intro-label">Warm-up Mission</p>

        <h1 id="project-title">AI Agent Challenge Hub</h1>
        <p className="intro-description">
          React 환경을 구성하고, 프로젝트 소개 컴포넌트를 만든 뒤 GitHub PR
          흐름까지 연습하는 워밍업 프로젝트입니다.
        </p>

        <div className="intro-list">
          <article className="intro-item">
            <strong>React Setup</strong>
            <p>Vite 기반 React 프로젝트를 구성하고 실행 환경을 확인합니다.</p>
          </article>

          <article className="intro-item">
            <strong>Component</strong>
            <p>프로젝트 목적을 한눈에 보여주는 소개 컴포넌트를 구현합니다.</p>
          </article>

          <article className="intro-item">
            <strong>Pull Request</strong>
            <p>브랜치 작업, 커밋, 푸시, PR 생성까지 협업 흐름을 실습합니다.</p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default ProjectIntro;
