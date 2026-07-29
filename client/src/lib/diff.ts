export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

// Parses the server-computed unified diff (from the `diff` npm package's
// createTwoFilesPatch) into displayable lines — drops the Index:/---/+++
// file-header lines since the path is already shown in the diff head above.
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const line of diff.split("\n")) {
    if (
      line === "" ||
      line.startsWith("Index:") ||
      line.startsWith("===") ||
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }

    if (line.startsWith("@@")) {
      lines.push({ type: "ctx", text: line });
    } else if (line.startsWith("+")) {
      lines.push({ type: "add", text: line });
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", text: line });
    } else {
      lines.push({ type: "ctx", text: line });
    }
  }

  return lines;
}
