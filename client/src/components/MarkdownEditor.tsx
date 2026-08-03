interface Props {
  value: string;
  onChange: (value: string) => void;
}

// Same threshold as MarkdownViewer's — see that component for why.
const LONG_CONTENT_LINE_THRESHOLD = 200;

export default function MarkdownEditor({ value, onChange }: Props) {
  const lineCount = value.split("\n").length;
  return (
    <>
      {lineCount > LONG_CONTENT_LINE_THRESHOLD && (
        <div className="label-mono">총 {lineCount}줄 — 스크롤해서 전체 내용을 볼 수 있습니다</div>
      )}
      <textarea
        className="code-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
    </>
  );
}
