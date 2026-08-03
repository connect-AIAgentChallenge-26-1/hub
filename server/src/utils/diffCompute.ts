import { createTwoFilesPatch } from "diff";

// Server-side source of truth for diffs — the Agent only ever produces
// newContent, never a diff, since its line numbers/context can drift from
// the real file and applying that directly risks landing in the wrong place.
export function computeUnifiedDiff(path: string, oldContent: string, newContent: string): string {
  return createTwoFilesPatch(path, path, oldContent, newContent, undefined, undefined, {
    context: 3,
  });
}
