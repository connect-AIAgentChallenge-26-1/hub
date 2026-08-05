import { describe, expect, it } from 'vitest'
import { extractPdfText } from './pdf-text.js'

/**
 * pdfjs-dist는 리더 라이브러리라 PDF를 만들어주는 API가 없어, 테스트용 최소 PDF를 직접
 * 조립한다(오프셋을 실제로 계산해 xref 테이블을 채움 — 대충 만든 xref는 엄격 모드에서
 * 파싱이 실패할 수 있음). CJK 텍스트는 표준 Type1(Helvetica) 폰트의 단순 인코딩으로는
 * 올바르게 렌더링되지 않아(별도 임베디드 CID 폰트가 필요) 테스트 픽스처는 ASCII만 사용한다
 * — 실제 한글 PDF 추출 검증은 이슈 #132 작업 중 실제 bizinfo 스타일 PDF로 수동 확인함(PR 참고).
 */
function buildPdf(pageTexts: (string | null)[]): Buffer {
  const escape = (t: string) => t.replace(/([()\\])/g, '\\$1')

  type ObjEntry = { num: number; body: string }
  const objects: ObjEntry[] = []
  const pageObjNums: number[] = []
  let nextNum = 3

  for (const text of pageTexts) {
    const pageObjNum = nextNum++
    const fontObjNum = nextNum++
    const contentObjNum = nextNum++
    pageObjNums.push(pageObjNum)

    const contentStream = text === null ? '' : `BT /F1 24 Tf 72 700 Td (${escape(text)}) Tj ET`
    objects.push({
      num: pageObjNum,
      body: `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R >>`,
    })
    objects.push({ num: fontObjNum, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' })
    objects.push({
      num: contentObjNum,
      body: `<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\nstream\n${contentStream}\nendstream`,
    })
  }

  objects.unshift({ num: 2, body: `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageTexts.length} >>` })
  objects.unshift({ num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' })
  objects.sort((a, b) => a.num - b.num)

  const maxNum = objects[objects.length - 1].num
  let pdf = '%PDF-1.4\n'
  const offsets = Array.from<number>({ length: maxNum + 1 }).fill(0)
  for (const obj of objects) {
    offsets[obj.num] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${obj.num} 0 obj\n${obj.body}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${maxNum + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= maxNum; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxNum + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'latin1')
}

describe('extractPdfText', () => {
  it('단일 페이지 PDF에서 텍스트를 추출한다', async () => {
    const buffer = buildPdf(['Hello World'])
    expect(await extractPdfText(buffer)).toBe('Hello World')
  })

  it('여러 페이지를 순서대로 이어붙인다', async () => {
    const buffer = buildPdf(['First Page', 'Second Page'])
    expect(await extractPdfText(buffer)).toBe('First Page Second Page')
  })

  it('연속된 공백을 하나로 정리하고 앞뒤 공백을 제거한다', async () => {
    const buffer = buildPdf(['  Spaced   Out  '])
    const text = await extractPdfText(buffer)
    expect(text).not.toMatch(/\s{2,}/)
    expect(text).toBe(text.trim())
  })

  it('텍스트 레이어가 없는(스캔 이미지형) PDF는 빈 문자열을 반환한다', async () => {
    const buffer = buildPdf([null])
    expect(await extractPdfText(buffer)).toBe('')
  })
})
