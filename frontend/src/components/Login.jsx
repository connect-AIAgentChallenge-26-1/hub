import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus, Key, Mail, User, BookOpen, GraduationCap, AlertCircle } from 'lucide-react';
import axios from 'axios';

function Login({ onLogin }) {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Form states
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [studentType, setStudentType] = useState('transfer'); // default to 'transfer' (김경상)
  const [department, setDepartment] = useState('컴퓨터공학과');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!studentId || !password) {
      setError('학번과 비밀번호를 입력해주세요.');
      return;
    }

    if (isSignUp) {
      if (!name || !email || !confirmPassword) {
        setError('모든 필드를 채워주세요.');
        return;
      }
      if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setLoading(true);

    try {
      let response;
      const backendUrl = 'http://localhost:5000';

      if (isSignUp) {
        response = await axios.post(`${backendUrl}/api/auth/signup`, {
          studentId,
          name,
          password,
          studentType,
          department,
          email
        });
      } else {
        response = await axios.post(`${backendUrl}/api/auth/login`, {
          studentId,
          password
        });
      }

      setLoading(false);
      if (response.data && response.data.success) {
        onLogin(response.data.user);
        navigate('/portal');
      } else {
        setError(response.data.error || '인증에 실패했습니다.');
      }
    } catch (err) {
      console.warn('Backend server offline or DB connection failed. Falling back to local offline mode.', err);
      
      // Setup client-side offline mode fallback
      setTimeout(() => {
        setLoading(false);
        
        let profileName = name;
        if (!profileName) {
          if (studentType === 'transfer') profileName = '김경상';
          else if (studentType === 'general') profileName = '박경상';
          else if (studentType === 'double-major') profileName = '이경상';
        }

        const userData = {
          studentId,
          name: profileName,
          email: email || `${studentId}@gnu.ac.kr`,
          studentType,
          department: department,
          isOfflineMode: true
        };

        // Notice the user that the server is offline but we logged them in locally
        setError('💡 서버가 오프라인 상태입니다. 로컬 오프라인 모드로 자동 연결되었습니다.');
        
        // Let them log in after a short delay so they can read the notice
        setTimeout(() => {
          onLogin(userData);
          navigate('/portal');
        }, 1200);
      }, 1000);
    }
  };

  const handleToggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setStudentId('');
    setPassword('');
    setConfirmPassword('');
    setEmail('');
    setName('');
  };

  return (
    <div className="login-container">
      <div className="login-backdrop-glow"></div>
      
      <div className="login-card card-glass">
        <div className="login-header">
          <div className="logo-glow-wrapper">
            <GraduationCap className="logo-icon animate-pulse-slow" size={40} />
          </div>
          <h1>GNU AI NAVIGATOR</h1>
          <p>{isSignUp ? '맞춤형 학적 분석 및 시간표 포털에 가입하세요' : '학생 맞춤형 인공지능 학업 네비게이터'}</p>
        </div>

        {error && (
          <div className="login-error-badge">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="studentId">학번</label>
            <div className="input-wrapper">
              <User className="input-icon" size={18} />
              <input
                id="studentId"
                type="text"
                placeholder="2021012345"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
              />
            </div>
          </div>

          {isSignUp && (
            <>
              <div className="input-group animate-fade-in-up">
                <label htmlFor="name">이름</label>
                <div className="input-wrapper">
                  <User className="input-icon" size={18} />
                  <input
                    id="name"
                    type="text"
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group animate-fade-in-up">
                <label htmlFor="studentType">학적 구분</label>
                <div className="input-wrapper">
                  <BookOpen className="input-icon" size={18} />
                  <select
                    id="studentType"
                    value={studentType}
                    onChange={(e) => setStudentType(e.target.value)}
                    required
                  >
                    <option value="transfer">편입생</option>
                    <option value="general">재학생</option>
                    <option value="double-major">다전공자</option>
                  </select>
                </div>
              </div>

              <div className="input-group animate-fade-in-up">
                <label htmlFor="department">소속 학과</label>
                <div className="input-wrapper">
                  <GraduationCap className="input-icon" size={18} />
                  <select
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  >
                    <option value="컴퓨터공학과">컴퓨터공학과</option>
                    <option value="경영정보학과">경영정보학과</option>
                    <option value="통계학과">통계학과</option>
                  </select>
                </div>
              </div>

              <div className="input-group animate-fade-in-up">
                <label htmlFor="email">이메일</label>
                <div className="input-wrapper">
                  <Mail className="input-icon" size={18} />
                  <input
                    id="email"
                    type="email"
                    placeholder="student@gnu.ac.kr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="input-group">
            <label htmlFor="password">비밀번호</label>
            <div className="input-wrapper">
              <Key className="input-icon" size={18} />
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {isSignUp && (
            <div className="input-group animate-fade-in-up">
              <label htmlFor="confirmPassword">비밀번호 확인</label>
              <div className="input-wrapper">
                <Key className="input-icon" size={18} />
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (
              <span className="spinner"></span>
            ) : isSignUp ? (
              <>
                <UserPlus size={18} />
                <span>회원가입 완료</span>
              </>
            ) : (
              <>
                <LogIn size={18} />
                <span>포털 로그인</span>
              </>
            )}
          </button>
        </form>

        <div className="login-divider">
          <span>또는 SNS 계정으로 로그인</span>
        </div>

        <div className="social-login-grid">
          <button type="button" className="social-btn google">
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Google</span>
          </button>
          <button type="button" className="social-btn apple">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.05 20.28c-.98.95-2.05 1.88-3.08 1.88-1.07 0-1.38-.63-2.62-.63-1.22 0-1.6.61-2.62.65-1.03.04-2.24-1.01-3.23-1.98-2.02-1.96-3.56-5.54-3.56-8.91 0-5.36 3.46-8.2 6.84-8.2 1.07 0 2.09.4 2.72.78.63-.38 1.81-.88 3.03-.88 1.28 0 4.88.46 5.86 3.38-3.03 1.8-2.54 5.92.51 7.15-1.07 2.72-2.88 5.02-4.07 5.98zM12.03 4.81c.56-.71.95-1.7 1.03-2.69-1 .04-2.2.67-2.92 1.51-.61.71-.97 1.7-.87 2.65.99.08 2.13-.67 2.76-1.47z"/>
            </svg>
            <span>Apple</span>
          </button>
        </div>

        <div className="login-footer">
          <button type="button" onClick={handleToggleMode} className="toggle-mode-btn">
            {isSignUp ? (
              <span>이미 계정이 있으신가요? <strong>로그인하기</strong></span>
            ) : (
              <span>처음이신가요? <strong>신규 학생 가입하기</strong></span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
