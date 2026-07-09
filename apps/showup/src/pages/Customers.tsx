import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Input from '@/components/ui/Input'
import RiskBadge from '@/components/RiskBadge'
import { customers } from '@/mock/customers'

const Customers = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredCustomers = customers.filter((customer) => {
    if (!debouncedQuery) return true
    const query = debouncedQuery.toLowerCase()
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.phoneLast4.includes(query)
    )
  })

  return (
    <div className="p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
        <p className="text-sm text-gray-500 mt-1">전화번호 뒤 4 자리 또는 이름으로 검색하세요</p>
      </header>

      {/* Search */}
      <div className="mb-4">
        <Input
          type="text"
          placeholder="전화 뒤 4 자리 또는 이름"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Results */}
      <div className="space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>검색 결과가 없습니다</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <Link
              key={customer.id}
              to={`/customers/${customer.id}`}
              className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{customer.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    010-****-{customer.phoneLast4}
                  </p>
                </div>
                <RiskBadge score={customer.riskStats.score} />
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Add new customer */}
      <div className="mt-6">
        <Link
          to="/reservations/new"
          className="block w-full bg-blue-600 text-white text-center py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          + 신규 고객 등록
        </Link>
      </div>
    </div>
  )
}

export default Customers
