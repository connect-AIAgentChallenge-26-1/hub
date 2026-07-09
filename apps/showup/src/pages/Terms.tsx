import { Link } from 'react-router-dom'

const Terms = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 p-4">
        <Link to="/" className="text-blue-600 hover:underline text-sm">
          ← 홈으로
        </Link>
      </header>
      <main className="p-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">이용약관</h1>
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4 text-sm text-gray-700">
          <p className="text-gray-500">보안 세션이 법적 문안을 작성합니다 (MVP 제외)</p>
          <p>
            ShowUp 서비스 이용과 관련된 약관 사항이 기재됩니다. 사건 기록은 사실만을 기재해야 하며, 허위 기록 시 책임은 기록자에게 있습니다.
          </p>
        </div>
      </main>
    </div>
  )
}

export default Terms
