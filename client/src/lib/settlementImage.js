// 정산 결과를 캔버스에 그려 공유용 이미지로 만든다 — 새 라이브러리 없이 Canvas API만 사용.
// 색상은 디자인 토큰(CSS 커스텀 프로퍼티)에서 실제 값을 읽어와 하드코딩을 피한다.
function tokenColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function renderSettlementImage({ title, total, perPerson, balances }) {
  const width = 720
  const rowHeight = 52
  const headerHeight = 190
  const footerHeight = 40
  const height = headerHeight + Math.max(balances.length, 1) * rowHeight + footerHeight

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const cream = tokenColor('--cream', '#FBF7EE')
  const ink = tokenColor('--ink', '#4A4438')
  const inkSoft = tokenColor('--ink-soft', '#837A67')
  const line = tokenColor('--line', '#E4DDC9')
  const font = "'Gowun Dodum', sans-serif"

  ctx.fillStyle = cream
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = ink
  ctx.font = `600 26px ${font}`
  ctx.fillText(title || '정산 결과', 32, 54)

  ctx.fillStyle = inkSoft
  ctx.font = `400 14px ${font}`
  ctx.fillText('비용을 나눠요', 32, 80)

  ctx.strokeStyle = line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(32, 106)
  ctx.lineTo(width - 32, 106)
  ctx.stroke()

  ctx.fillStyle = inkSoft
  ctx.font = `400 14px ${font}`
  ctx.fillText('총 비용', 32, 136)
  ctx.fillStyle = ink
  ctx.font = `600 20px ${font}`
  ctx.textAlign = 'right'
  ctx.fillText(`${total.toLocaleString()}원`, width - 32, 138)

  ctx.fillStyle = inkSoft
  ctx.font = `400 13px ${font}`
  ctx.textAlign = 'left'
  ctx.fillText('1인당', 32, 164)
  ctx.textAlign = 'right'
  ctx.fillText(`${perPerson.toLocaleString()}원`, width - 32, 164)
  ctx.textAlign = 'left'

  let y = headerHeight
  for (const b of balances) {
    ctx.strokeStyle = line
    ctx.beginPath()
    ctx.moveTo(32, y)
    ctx.lineTo(width - 32, y)
    ctx.stroke()

    ctx.fillStyle = ink
    ctx.font = `500 15px ${font}`
    ctx.fillText(b.name, 32, y + 32)

    ctx.fillStyle = inkSoft
    ctx.font = `400 14px ${font}`
    ctx.textAlign = 'right'
    ctx.fillText(b.balanceLabel, width - 32, y + 32)
    ctx.textAlign = 'left'

    y += rowHeight
  }

  ctx.fillStyle = inkSoft
  ctx.font = `400 12px ${font}`
  ctx.textAlign = 'center'
  ctx.fillText('Letter&Co', width / 2, height - 16)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export async function shareOrDownloadImage(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
