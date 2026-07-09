const Dashboard = () => {
  // TODO: BE 세션이 대시보드 집계 쿼리 연동
  const stats = {
    todayReservations: 0,
    todayVisited: 0,
    todayNoShow: 0,
    thisMonthNoShowRate: 0,
  }

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">오늘의 예약과 주의 고객을 확인하세요</p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">오늘 예약</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.todayReservations}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">방문</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.todayVisited}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">노쇼</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.todayNoShow}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">월 노쇼율</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.thisMonthNoShowRate}%</p>
        </div>
      </div>

      {/* Attention customers */}
      <section className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">주의 고객</h2>
        <div className="text-center py-8 text-gray-500">
          <p>등록된 주의 고객이 없습니다</p>
        </div>
      </section>

      {/* Today's reservations */}
      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">오늘의 예약</h2>
        <div className="text-center py-8 text-gray-500">
          <p>오늘 예약이 없습니다</p>
        </div>
      </section>
    </div>
  )
}

export default Dashboard
