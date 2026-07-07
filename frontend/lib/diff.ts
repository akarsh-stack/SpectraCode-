// Minimal unified-diff parser.
// Turns a raw `git diff` / GitHub `.diff` string into per-file arrays of
// DiffLine, the same shape the review UI already renders for mock data.

import type { DiffLine } from "./mock";

/**
 * Parse a unified diff into a map of `new-file path -> DiffLine[]`.
 *
 * Handles the parts the UI cares about:
 *  - `+++ b/<path>` sets the current file (falls back to the `diff --git` path).
 *  - `@@ -a,b +c,d @@` seeds the new-file line counter at `c`.
 *  - context / added lines advance the new-file line number; removed lines don't.
 * Binary-file and rename-only sections simply produce no lines for that file.
 */
export function parseUnifiedDiff(diff: string): Record<string, DiffLine[]> {
  const files: Record<string, DiffLine[]> = {};
  if (!diff) return files;

  let current: DiffLine[] | null = null;
  let newLine = 0;
  // Remembered from `diff --git a/x b/x` in case there's no `+++` (e.g. deletes).
  let pendingPath: string | null = null;

  const startFile = (path: string): DiffLine[] => {
    const clean = stripPrefix(path);
    if (!files[clean]) files[clean] = [];
    return files[clean];
  };

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git")) {
      // diff --git a/foo b/foo  -> remember b/foo as a fallback path
      const m = raw.match(/ b\/(\S+)\s*$/);
      pendingPath = m ? m[1] : null;
      current = null;
      continue;
    }

    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim();
      // "+++ /dev/null" means the file was deleted; use the remembered path.
      current = startFile(path === "/dev/null" && pendingPath ? pendingPath : path);
      continue;
    }

    // Skip the remaining file-header noise.
    if (
      raw.startsWith("--- ") ||
      raw.startsWith("index ") ||
      raw.startsWith("old mode") ||
      raw.startsWith("new mode") ||
      raw.startsWith("similarity ") ||
      raw.startsWith("rename ") ||
      raw.startsWith("new file") ||
      raw.startsWith("deleted file") ||
      raw.startsWith("Binary files")
    ) {
      continue;
    }

    if (raw.startsWith("@@")) {
      if (!current && pendingPath) current = startFile(pendingPath);
      const m = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      newLine = m ? Number(m[1]) : 1;
      current?.push({ kind: "hunk", text: raw });
      continue;
    }

    if (!current) continue;

    if (raw.startsWith("+")) {
      current.push({ kind: "added", newLine, text: raw });
      newLine += 1;
    } else if (raw.startsWith("-")) {
      current.push({ kind: "removed", text: raw });
    } else {
      // context line (leading space) or blank line within a hunk
      current.push({ kind: "context", newLine, text: raw });
      newLine += 1;
    }
  }

  return files;
}

/** Drop a leading `a/` or `b/` git path prefix. */
function stripPrefix(path: string): string {
  return path.replace(/^[ab]\//, "");
}
