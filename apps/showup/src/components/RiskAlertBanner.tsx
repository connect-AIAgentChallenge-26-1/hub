interface RiskAlertBannerProps {
  noShowCount: number
  incidentCounts: {
    abuse: number
    dispute: number
    late: number
    unreasonable: number
  }
  className?: string
}

const RiskAlertBanner = ({
  noShowCount,
  incidentCounts,
  className = '',
}: RiskAlertBannerProps) => {
  const shouldShow = noShowCount >= 3 || incidentCounts.abuse >= 1

  if (!shouldShow) {
    return null
  }

  const abuseCount = incidentCounts.abuse
  const message = abuseCount >= 1
    ? `노쇼 ${noShowCount}회 · 응대 사건 ${abuseCount}회`
    : `노쇼 ${noShowCount}회`

  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <span className="text-xl">🚨</span>
        <div>
          <p className="text-sm font-semibold text-red-900">
            {message} — 예약금 요청 또는 사전 확인을 권장합니다
          </p>
          <p className="text-xs text-red-700 mt-1">
            이 정보는 참고용 지표이며, 최종 판단은 사장님의 재량에 따릅니다.
          </p>
        </div>
      </div>
    </div>
  )
}

export default RiskAlertBanner
