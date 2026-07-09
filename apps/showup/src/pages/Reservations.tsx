const Reservations = () => {
  // TODO: BE 세션이 예약 목록 연동
  const reservations: Array<{
    id: string
    customerName: string
    time: string
  }> = []

  return (
    <div className="p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">예약 관리</h1>
          <p className="text-sm text-gray-500 mt-1">오늘의 예약을 확인하고 상태를 기록하세요</p>
        </div>
      </header>

      {/* Today's reservations */}
      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">오늘의 예약</h2>
        {reservations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>오늘 예약이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map((res) => (
              <div key={res.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-gray-900">{res.customerName}</p>
                  <p className="text-sm text-gray-500">{res.time}</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                    방문
                  </button>
                  <button className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700">
                    노쇼
                  </button>
                  <button className="flex-1 bg-yellow-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-yellow-600">
                    취소
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Reservations
