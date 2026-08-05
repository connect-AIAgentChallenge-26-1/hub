import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * bizinfo PDF 공고문은 스캔 이미지가 아니라 글꼴이 임베딩된 텍스트 PDF임을 실측으로 확인함
 * (이슈 #132). `pdfjs-dist`의 `getTextContent()`로 로컬에서 API 호출·과금 없이 텍스트를
 * 추출한다 — `hwpx.ts`(`extractHwpxText`)와 같은 역할을 PDF에 대해 수행.
 *
 * `legacy/build/pdf.mjs` 진입점은 Node.js 환경을 자동 감지해 Web Worker 없이 메인 스레드에서
 * 동작한다(별도 옵션 불필요). `verbosity: ERRORS`로 pdfjs 자체의 경고 로그(폰트/색공간 등
 * 렌더링 관련, 텍스트 추출과 무관)를 조용히 한다.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    verbosity: VerbosityLevel.ERRORS,
  })

  const doc = await loadingTask.promise
  try {
    const parts: string[] = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item) parts.push(item.str)
      }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  } finally {
    // PDFDocumentProxy 자체엔 destroy()가 없다 — loadingTask가 리소스 정리를 담당한다
    await loadingTask.destroy()
  }
}
