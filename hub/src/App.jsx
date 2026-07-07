import React from 'react';

function App() {
  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', textAlign: 'center', lineHeight: '1.6' }}>
      <h1 style={{ color: '#4A90E2' }}>🚀 AI Agent 챌린지 주제선정</h1>
      <hr style={{ border: '1px solid #eee', width: '60%', margin: '20px auto' }} />
      
      <h2 style={{ color: '#333' }}>🎯 프로젝트 주제 </h2>
      <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#E67E22' }}>
        "대학생(본인)이 일상에서 겪는 문제 해결"
      </p>
      
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '10px', display: 'inline-block', textAlign: 'left', marginTop: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>📝 미션 진행 계획:</p>
        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          <li>학교 생활이나 일상 속 불편한 점들을 정리하고 분석하기</li>
          <li>1. 문제 발견 : 어떤 불편·니즈가 있는지 캐치 (관찰에서 출발)</li>
          <li>2. 문제 정의 : 누가 / 어떤 상황에서 / 무슨 불편을 겪는가 — 한 문장으로</li>
          <li>2. 문제 정의 : 누가 / 어떤 상황에서 / 무슨 불편을 겪는가 — 한 문장으로</li>
          <li> 3. 사용자·시나리오 : 그 사람이 서비스를 어떻게 쓰는지 흐름으로 적기</li>
          <li>4.핵심 기능 도출 : 시나리오를 굴리는 데 꼭 필요한 기능만 뽑기</li>
          <li>5. 우선순위·MVP : 그중에서도 핵심 2~3개로 좁히기</li>
        </ul>
      </div>

      <footer style={{ marginTop: '40px', color: '#aaa', fontSize: '14px' }}>
        react
      </footer>
    </div>
  );
}

export default App;
