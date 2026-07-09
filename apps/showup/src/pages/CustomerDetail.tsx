import { useParams } from 'react-router-dom'
import type { Customer } from '@/mock/customers'
import RiskBadge from '@/components/RiskBadge'
import RiskAlertBanner from '@/components/RiskAlertBanner'
import { customers } from '@/mock/customers'

const CustomerDetail = () => {
  const { id } = useParams()
  const customer = customers.find((c: Customer) => c.id === id)

  if (!customer) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>고객을 찾을 수 없습니다</p>
      </div>
    )
  }

  const showAlert =
    customer.riskStats.noShowCount >= 3 ||
    customer.riskStats.incidentCounts.abuse >= 1

  return (
    <div className="p-4">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <RiskBadge score={customer.riskStats.score} />
        </div>
        <p className="text-gray-600">010-****-{customer.phoneLast4}</p>
        {showAlert && (
          <div className="mt-3">
            <RiskAlertBanner
              noShowCount={customer.riskStats.noShowCount}
              incidentCounts={customer.riskStats.incidentCounts}
            />
          </div>
        )}
      </div>

      {/* Timeline */}
      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">이벤트 타임라인</h2>
        <div className="space-y-3">
          {customer.events.length === 0 ? (
            <p className="text-center text-gray-500 py-4">등록된 이벤트가 없습니다</p>
          ) : (
            customer.events.map((event: { id: string; date: string; type: string; icon: string; memo?: string }) => (
              <div key={event.id} className="flex gap-3">
                <div className="text-sm text-gray-500 w-16 flex-shrink-0">
                  {event.date}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{event.icon}</span>
                    <span className="font-medium text-gray-900">{event.type}</span>
                  </div>
                  {event.memo && (
                    <p className="text-sm text-gray-600 mt-1">{event.memo}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Action buttons */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className="bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors">
          방문 ✅
        </button>
        <button className="bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors">
          노쇼 ❌
        </button>
        <button className="bg-yellow-500 text-white py-3 rounded-lg font-medium hover:bg-yellow-600 transition-colors">
          당일취소
        </button>
      </div>
    </div>
  )
}

export default CustomerDetail
