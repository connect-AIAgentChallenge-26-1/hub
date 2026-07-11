import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './auth.css'

export function OAuthCallbackPage() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    // StrictMode 이중 실행 방지
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('token')
    if (!token) {
      navigate('/login?error=google_oauth_failed', { replace: true })
      return
    }
    // 주소창에 토큰이 남지 않게 fragment를 지운다
    window.history.replaceState(null, '', window.location.pathname)
    loginWithToken(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login?error=google_oauth_failed', { replace: true }))
  }, [loginWithToken, navigate])

  return (
    <div className="auth-page">
      <p>구글 로그인 처리 중...</p>
    </div>
  )
}
