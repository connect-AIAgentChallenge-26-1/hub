import type { AttachmentFormat } from './attachment.js'
import { downloadAttachment, parseAttachment } from './attachment.js'
import type { BizinfoAnnouncement } from './bizinfo-client.js'
import { getCachedExtraction, saveExtraction } from './document-cache.js'
import type { ExtractionDocument } from './gemini-extract.js'
import { extractStructuredFields, isBudgetExhausted } from './gemini-extract.js'
import { extractHwpxText } from './hwpx.js'
import { extractPdfText } from './pdf-text.js'

/**
 * bizinfo API 호출과 무관하게 Gemini 자체에 RPM 제한이 있어(이슈 #67 묶음 1),
 * 요청 사이 여유를 둔다.
 */
const CALL_DELAY_MS = 4000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * PDF는 로컬 `pdfjs-dist` 텍스트 추출을 우선 시도한다(이슈 #132) — bizinfo 공고문 PDF는
 * 실측상 스캔 이미지가 아니라 글꼴이 임베딩된 텍스트 PDF였다. 추출 결과가 빈 문자열이면
 * (텍스트 레이어 없는 스캔본 등) 기존 base64 멀티모달 경로로 폴백해 Gemini가 직접 읽게
 * 한다 — 완전히 처리 불가 상태가 되는 것을 막기 위한 안전망.
 */
async function buildExtractionDocument(
  format: Exclude<AttachmentFormat, 'unsupported'>,
  buffer: Buffer,
): Promise<ExtractionDocument> {
  if (format === 'hwpx') {
    return { type: 'text', text: extractHwpxText(buffer) }
  }

  try {
    const text = await extractPdfText(buffer)
    if (text.length > 0) return { type: 'text', text }
    console.warn('[crawler] PDF 텍스트 레이어 없음 — base64 멀티모달 경로로 폴백')
  } catch (err) {
    console.warn(`[crawler] PDF 텍스트 추출 실패, base64 멀티모달 경로로 폴백: ${(err as Error).message}`)
  }
  return { type: 'pdf', base64: buffer.toString('base64') }
}

/**
 * 신규 공고 1건의 첨부파일을 AI로 구조화 추출해 `document_extractions`에 캐싱한다.
 * 실패해도 절대 throw하지 않는다 — 크롤러 전체 실행이 이 단계 때문에 멈추면 안 됨(이슈 #67
 * 묶음 2). 실패/미지원/할당량 소진 시 그냥 스킵하고, 기존 정규식 결과는 그대로 유지된다
 * (묶음 3에서 이 캐시를 읽어 subsidies에 반영).
 */
export async function enrichAnnouncement(item: BizinfoAnnouncement): Promise<void> {
  if (isBudgetExhausted()) return // 이번 실행에서 이미 모든 모델 할당량 소진 — 헛되이 재시도하지 않음

  const attachment = parseAttachment(item)
  if (!attachment || attachment.format === 'unsupported') return // 첨부 없음/HWP(구버전) 등 미지원 포맷

  let calledGemini = false
  try {
    const cached = await getCachedExtraction(attachment.atchFileId)
    if (cached) return // 이미 처리된 첨부파일 — Gemini 재호출 없이 skip

    const buffer = await downloadAttachment(attachment.downloadUrl)
    const document = await buildExtractionDocument(attachment.format, buffer)

    calledGemini = true
    const { model, fields } = await extractStructuredFields(document)
    await saveExtraction(attachment.atchFileId, model, fields)
  } catch (err) {
    console.error(
      `[crawler] AI 추출 실패 (${item.pblancId}, atchFileId=${attachment.atchFileId}): ${(err as Error).message}`,
    )
  } finally {
    if (calledGemini) await sleep(CALL_DELAY_MS) // 실제로 Gemini를 호출한 경우에만 RPM 여유를 둔다
  }
}

/** 신규 공고 목록을 순차적으로 처리한다(동시 호출은 RPM 한도를 쉽게 넘긴다) */
export async function enrichAnnouncements(items: BizinfoAnnouncement[]): Promise<void> {
  for (const item of items) {
    await enrichAnnouncement(item)
  }
}
