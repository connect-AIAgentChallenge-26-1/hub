import { Link } from 'react-router-dom'

const Privacy = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 p-4">
        <Link to="/" className="text-blue-600 hover:underline text-sm">
          ← 홈으로
        </Link>
      </header>
      <main className="p-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">개인정보처리방침</h1>
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4 text-sm text-gray-700">
          <p className="text-gray-500">보안 세션이 법적 문안을 작성합니다 (MVP 제외)</p>
          <p>
            ShowUp 은 소상공인을 위한 고객 이력 관리 서비스입니다. 이 페이지에는 개인정보 수집·이용·보관·삭제에 관한 사항이 기재됩니다.
          </p>
        </div>
      </main>
    </div>
  )
}

export default Privacy
