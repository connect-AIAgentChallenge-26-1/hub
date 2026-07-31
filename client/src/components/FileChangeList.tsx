import { useState } from "react";
import type { FileChange } from "../lib/api";

const CHANGE_LABEL: Record<FileChange["changeType"], string> = {
  new: "신규",
  modified: "수정",
  deleted: "삭제",
};

interface Props {
  files: FileChange[];
  checkedPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

export default function FileChangeList({ files, checkedPaths, selectedPath, onToggle, onSelect }: Props) {
  // Purely a display concern (which file's error list is expanded) — doesn't
  // affect selection/commit state, so it stays local rather than lifted up.
  const [expandedErrorsPath, setExpandedErrorsPath] = useState<string | null>(null);

  return (
    <div className="file-list">
      <div className="file-list-head">
        <span className="label-mono" style={{ margin: 0 }}>
          CHANGED FILES
        </span>
        <span className="label-mono" style={{ margin: 0, color: "var(--teal)" }}>
          {checkedPaths.size} / {files.length}
        </span>
      </div>
      <div>
        {files.map((f) => (
          <div
            key={f.path}
            className={`file-row${f.path === selectedPath ? " selected-file" : ""}`}
            onClick={() => onSelect(f.path)}
          >
            <input
              type="checkbox"
              checked={checkedPaths.has(f.path)}
              // Row selection (diff pane) is a separate concern from checking
              // a file for commit — without this the checkbox click would
              // also bubble up and re-select the row.
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggle(f.path)}
            />
            <div className="file-row-main">
              <div className="file-path">
                {f.path.split("/").pop()}
                {!f.syntaxValid && (
                  <span
                    className="change-badge syntax-error"
                    style={{ marginLeft: 6, cursor: "pointer" }}
                    title="문법 오류 — 클릭해서 자세히 보기"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedErrorsPath((prev) => (prev === f.path ? null : f.path));
                    }}
                  >
                    ⚠ 문법 오류
                  </span>
                )}
              </div>
              <div className="file-commit-msg">{f.suggestedCommitMessage}</div>
              {expandedErrorsPath === f.path && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--red)", whiteSpace: "pre-wrap" }}>
                  {f.syntaxErrors.join("\n")}
                </div>
              )}
            </div>
            <span className={`change-badge ${f.changeType}`}>{CHANGE_LABEL[f.changeType]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
