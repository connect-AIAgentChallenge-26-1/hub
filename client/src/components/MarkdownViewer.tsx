interface Props {
  content: string;
}

// Past this many lines the preview area scrolls internally (see pre.code's
// max-height in base.css) rather than pushing the rest of the page down —
// the line-count hint below just makes that scrollability obvious.
const LONG_CONTENT_LINE_THRESHOLD = 200;

// Read-only preview — pairs with MarkdownEditor for the toggle pattern used
// wherever a Step's document can be reviewed and edited (analysis report now,
// workspace Step documents later).
export default function MarkdownViewer({ content }: Props) {
  const lineCount = content.split("\n").length;
  return (
    <>
      {lineCount > LONG_CONTENT_LINE_THRESHOLD && (
        <div className="label-mono">총 {lineCount}줄 — 스크롤해서 전체 내용을 볼 수 있습니다</div>
      )}
      <pre className="code">{content}</pre>
    </>
  );
}
