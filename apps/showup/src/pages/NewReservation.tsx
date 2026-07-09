import { Link } from 'react-router-dom'

const NewReservation = () => {
  return (
    <div className="p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">새 예약</h1>
        <p className="text-sm text-gray-500 mt-1">고객을 선택하고 예약 정보를 입력하세요</p>
      </header>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <p className="text-sm text-gray-600">
          고객 검색은{' '}
          <Link to="/customers" className="text-blue-600 hover:underline font-medium">
            고객 관리
          </Link>
          {' '}화면에서 먼저 진행해주세요.
        </p>

        <div className="text-center py-8 text-gray-500">
          <p>예약 생성 폼은 BE API 연동 후 구현됩니다</p>
        </div>
      </div>
    </div>
  )
}

export default NewReservation
