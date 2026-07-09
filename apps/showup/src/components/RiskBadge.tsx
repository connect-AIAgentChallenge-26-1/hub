interface RiskBadgeProps {
  score: number
  className?: string
}

const RiskBadge = ({ score, className = '' }: RiskBadgeProps) => {
  const getRiskLevel = (score: number) => {
    if (score >= 40) return { level: 'high', label: '위험', color: 'bg-risk-high text-white' }
    if (score >= 24) return { level: 'medium', label: '주의', color: 'bg-risk-medium text-white' }
    return { level: 'low', label: '안심', color: 'bg-risk-low text-white' }
  }

  const { label, color } = getRiskLevel(score)

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color} ${className}`}>
      <span>{label}</span>
      <span className="opacity-80">(참고용 지표)</span>
    </div>
  )
}

export default RiskBadge
