import type { FileChange } from "../lib/api";
import { parseUnifiedDiff } from "../lib/diff";

const CHANGE_LABEL: Record<FileChange["changeType"], string> = {
  new: "신규",
  modified: "수정",
  deleted: "삭제",
};

interface Props {
  file: FileChange | null;
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  checkedCount: number;
  onDeselectAll: () => void;
  onCommitSelected: () => void;
  committing: boolean;
  commitError: string | null;
}

export default function DiffViewer({
  file,
  commitMessage,
  onCommitMessageChange,
  checkedCount,
  onDeselectAll,
  onCommitSelected,
  committing,
  commitError,
}: Props) {
  const diffLines = file ? parseUnifiedDiff(file.diff) : [];

  return (
    <div className="diff-pane">
      <div className="diff-head">
        <span className="path">{file ? file.path : "선택된 파일이 없습니다"}</span>
        {file && <span className={`badge change-badge ${file.changeType}`}>{CHANGE_LABEL[file.changeType]}</span>}
      </div>

      <pre className="diff">
        {file && diffLines.length === 0 ? (
          <span className="diff-line ctx">(원본과 달라진 내용이 없습니다)</span>
        ) : (
          diffLines.map((line, i) => (
            <span key={i} className={`diff-line ${line.type}`}>
              {line.text}
            </span>
          ))
        )}
      </pre>

      <div>
        <label className="label-mono">커밋 메시지</label>
        <input
          type="text"
          className="commit-msg-edit"
          value={commitMessage}
          disabled={!file}
          onChange={(e) => onCommitMessageChange(e.target.value)}
        />
      </div>

      {commitError && <div style={{ color: "var(--red)", fontSize: 12.5 }}>{commitError}</div>}

      <div className="commit-footer">
        <span className="count">
          {checkedCount > 0 ? `선택된 ${checkedCount}개 파일 → ${checkedCount}개의 커밋으로 분리 생성` : "선택된 파일이 없습니다"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onDeselectAll} disabled={committing}>
            모두 제외
          </button>
          <button className="primary" disabled={checkedCount === 0 || committing} onClick={onCommitSelected}>
            선택 항목 커밋 ({checkedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
