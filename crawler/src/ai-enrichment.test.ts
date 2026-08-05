import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BizinfoAnnouncement } from './bizinfo-client.js'

const state = vi.hoisted(() => ({
  parseAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
  getCachedExtraction: vi.fn(),
  saveExtraction: vi.fn(),
  extractStructuredFields: vi.fn(),
  isBudgetExhausted: vi.fn(),
  extractHwpxText: vi.fn(),
  extractPdfText: vi.fn(),
}))

vi.mock('./attachment.js', () => ({
  parseAttachment: state.parseAttachment,
  downloadAttachment: state.downloadAttachment,
}))
vi.mock('./document-cache.js', () => ({
  getCachedExtraction: state.getCachedExtraction,
  saveExtraction: state.saveExtraction,
}))
vi.mock('./gemini-extract.js', () => ({
  extractStructuredFields: state.extractStructuredFields,
  isBudgetExhausted: state.isBudgetExhausted,
}))
vi.mock('./hwpx.js', () => ({ extractHwpxText: state.extractHwpxText }))
vi.mock('./pdf-text.js', () => ({ extractPdfText: state.extractPdfText }))

import { enrichAnnouncement } from './ai-enrichment.js'

const item = { pblancId: 'PBLN_1' } as BizinfoAnnouncement
const FIELDS = { employees: null } as never

async function run(): Promise<void> {
  vi.useFakeTimers()
  const promise = enrichAnnouncement(item)
  await vi.runAllTimersAsync()
  await promise
  vi.useRealTimers()
}

describe('enrichAnnouncement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isBudgetExhausted.mockReturnValue(false)
    state.extractPdfText.mockResolvedValue('')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('할당량이 이미 소진됐으면 아무것도 조회하지 않고 즉시 종료한다', async () => {
    state.isBudgetExhausted.mockReturnValue(true)
    await enrichAnnouncement(item) // 소진 시엔 delay도 없어 실제 타이머로도 즉시 반환됨
    expect(state.parseAttachment).not.toHaveBeenCalled()
  })

  it('첨부파일이 없거나 미지원 포맷이면 다운로드하지 않는다', async () => {
    state.parseAttachment.mockReturnValue(null)
    await enrichAnnouncement(item)
    expect(state.downloadAttachment).not.toHaveBeenCalled()

    state.parseAttachment.mockReturnValue({ atchFileId: 'F1', format: 'unsupported', downloadUrl: 'x' })
    await enrichAnnouncement(item)
    expect(state.downloadAttachment).not.toHaveBeenCalled()
  })

  it('이미 캐싱된 atchFileId면 Gemini를 다시 호출하지 않는다', async () => {
    state.parseAttachment.mockReturnValue({ atchFileId: 'F1', format: 'pdf', downloadUrl: 'x' })
    state.getCachedExtraction.mockResolvedValue(FIELDS)
    await enrichAnnouncement(item)
    expect(state.downloadAttachment).not.toHaveBeenCalled()
    expect(state.extractStructuredFields).not.toHaveBeenCalled()
  })

  it('PDF는 pdfjs-dist로 로컬 텍스트 추출 후 텍스트로 extractStructuredFields에 전달한다', async () => {
    state.parseAttachment.mockReturnValue({ atchFileId: 'F1', format: 'pdf', downloadUrl: 'https://x/f.pdf' })
    state.getCachedExtraction.mockResolvedValue(null)
    state.downloadAttachment.mockResolvedValue(Buffer.from([1, 2, 3]))
    state.extractPdfText.mockResolvedValue('PDF에서 추출된 본문')
    state.extractStructuredFields.mockResolvedValue({ model: 'gemini-2.5-flash', fields: FIELDS })

    await run()

    expect(state.extractPdfText).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
    expect(state.extractStructuredFields).toHaveBeenCalledWith({ type: 'text', text: 'PDF에서 추출된 본문' })
    expect(state.saveExtraction).toHaveBeenCalledWith('F1', 'gemini-2.5-flash', FIELDS)
  })

  it('PDF 텍스트 레이어가 없으면(빈 문자열) base64 멀티모달 경로로 폴백한다', async () => {
    state.parseAttachment.mockReturnValue({ atchFileId: 'F1', format: 'pdf', downloadUrl: 'https://x/f.pdf' })
    state.getCachedExtraction.mockResolvedValue(null)
    state.downloadAttachment.mockResolvedValue(Buffer.from([1, 2, 3]))
    state.extractPdfText.mockResolvedValue('')
    state.extractStructuredFields.mockResolvedValue({ model: 'gemini-2.5-flash', fields: FIELDS })

    await run()

    expect(state.extractStructuredFields).toHaveBeenCalledWith({
      type: 'pdf',
      base64: Buffer.from([1, 2, 3]).toString('base64'),
    })
    expect(state.saveExtraction).toHaveBeenCalledWith('F1', 'gemini-2.5-flash', FIELDS)
  })

  it('PDF 텍스트 추출이 예외를 던지면 base64 멀티모달 경로로 폴백한다(추출 실패로 완전히 막히지 않음)', async () => {
    state.parseAttachment.mockReturnValue({ atchFileId: 'F1', format: 'pdf', downloadUrl: 'https://x/f.pdf' })
    state.getCachedExtraction.mockResolvedValue(null)
    state.downloadAttachment.mockResolvedValue(Buffer.from([1, 2, 3]))
    state.extractPdfText.mockRejectedValue(new Error('손상된 PDF'))
    state.extractStructuredFields.mockResolvedValue({ model: 'gemini-2.5-flash', fields: FIELDS })

    await run()

    expect(state.extractStructuredFields).toHaveBeenCalledWith({
      type: 'pdf',
      base64: Buffer.from([1, 2, 3]).toString('base64'),
    })
    expect(state.saveExtraction).toHaveBeenCalledWith('F1', 'gemini-2.5-flash', FIELDS)
  })

  it('HWPX는 텍스트로 추출해 extractStructuredFields에 전달한다', async () => {
    state.parseAttachment.mockReturnValue({ atchFileId: 'F2', format: 'hwpx', downloadUrl: 'https://x/f.hwpx' })
    state.getCachedExtraction.mockResolvedValue(null)
    state.downloadAttachment.mockResolvedValue(Buffer.from('zip-bytes'))
    state.extractHwpxText.mockReturnValue('추출된 본문')
    state.extractStructuredFields.mockResolvedValue({ model: 'gemini-2.5-flash', fields: FIELDS })

    await run()

    expect(state.extractStructuredFields).toHaveBeenCalledWith({ type: 'text', text: '추출된 본문' })
  })

  it('다운로드나 추출이 실패해도 예외를 던지지 않는다(크롤러 전체 실패 방지)', async () => {
    state.parseAttachment.mockReturnValue({ atchFileId: 'F3', format: 'pdf', downloadUrl: 'https://x/f.pdf' })
    state.getCachedExtraction.mockResolvedValue(null)
    state.downloadAttachment.mockRejectedValue(new Error('다운로드 실패'))

    await expect(run()).resolves.toBeUndefined()
    expect(state.saveExtraction).not.toHaveBeenCalled()
  })
})
