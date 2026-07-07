import type { Issue, Report, ReviewSummary, Severity } from "./api";

// --- A single realistic sample report -------------------------------------

const issues: Issue[] = [
  {
    id: "iss-1",
    severity: "critical",
    line_number: 42,
    description:
      "User-supplied `repo` is interpolated directly into a shell command, allowing command injection.",
    fix_suggestion:
      "Use execFile with an argument array instead of string interpolation:\n  execFile('git', ['clone', repo], cb)",
    agent: "Security Agent",
    category: "security",
    file: "src/server/clone.ts",
  },
  {
    id: "iss-2",
    severity: "high",
    line_number: 17,
    description:
      "Secret token is logged in plaintext when DEBUG is enabled, leaking credentials to log sinks.",
    fix_suggestion:
      "Redact the token before logging:\n  logger.debug('token=%s', mask(token))",
    agent: "Security Agent",
    category: "security",
    file: "src/server/clone.ts",
  },
  {
    id: "iss-3",
    severity: "high",
    line_number: 88,
    description:
      "N+1 query: issues are fetched in a loop, one round-trip per file. Scales poorly on large PRs.",
    fix_suggestion:
      "Batch with a single IN query:\n  db.issues.where('file', 'in', files)",
    agent: "Performance Agent",
    category: "performance",
    file: "src/db/reports.ts",
  },
  {
    id: "iss-4",
    severity: "medium",
    line_number: 31,
    description:
      "Synchronous JSON.parse of a multi-MB diff blocks the event loop during request handling.",
    fix_suggestion:
      "Move parsing off the hot path or stream it:\n  await parseDiffStream(req.body)",
    agent: "Performance Agent",
    category: "performance",
    file: "src/db/reports.ts",
  },
  {
    id: "iss-5",
    severity: "medium",
    line_number: 12,
    description:
      "Inconsistent error handling — bare catch swallows the error without logging or rethrowing.",
    fix_suggestion:
      "Log and rethrow, or return a typed Result:\n  catch (e) { logger.error(e); throw e }",
    agent: "Style Agent",
    category: "style",
    file: "src/components/DiffView.tsx",
  },
  {
    id: "iss-6",
    severity: "low",
    line_number: 5,
    description:
      "Unused import `useMemo` and a magic number `3600` without a named constant.",
    fix_suggestion:
      "Remove the import and extract:\n  const ONE_HOUR_SECONDS = 3600",
    agent: "Style Agent",
    category: "style",
    file: "src/components/DiffView.tsx",
  },
];

const issues_by_severity: Record<Severity, number> = issues.reduce(
  (acc, i) => {
    acc[i.severity] += 1;
    return acc;
  },
  { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>,
);

export const mockReport: Report = {
  repo: "acme/payments-service",
  pr_number: 482,
  pr_title: "Add async diff parsing + clone worker",
  summary:
    "This PR introduces a clone worker and async diff parsing. The agents flagged one critical injection risk in the clone path, credential leakage under debug logging, and a couple of scaling concerns in the reporting layer. Style is mostly clean.",
  total_issues: issues.length,
  issues_by_severity,
  top_recommendations: [
    "Replace shell-string clone with execFile and an argument array.",
    "Redact secrets in all log statements before shipping.",
    "Batch the per-file issue lookups into a single query.",
  ],
  overall_score: 62,
  issues,
};

/**
 * Resolve a report by route id (owner__repo__pr). For now always returns the
 * mock report, but stamped with the requested repo/pr so the UI reflects the
 * URL the user came from.
 */
export function mockReportForId(id: string): Report {
  const parts = id.split("__");
  if (parts.length === 3) {
    const pr_number = Number(parts[2]);
    return {
      ...mockReport,
      repo: `${parts[0]}/${parts[1]}`,
      pr_number: Number.isFinite(pr_number) ? pr_number : mockReport.pr_number,
    };
  }
  return mockReport;
}

// --- Diff lines for the review view ---------------------------------------

export type DiffLineKind = "context" | "added" | "removed" | "hunk";

export interface DiffLine {
  kind: DiffLineKind;
  // line number in the new file (added/context); undefined for removed/hunk
  newLine?: number;
  text: string;
}

// Keyed by file path so the sidebar can switch files.
export const mockDiffs: Record<string, DiffLine[]> = {
  "src/server/clone.ts": [
    { kind: "hunk", text: "@@ -14,8 +14,12 @@ export async function clone(repo, token) {" },
    { kind: "context", newLine: 14, text: "  const dir = tmpdir();" },
    { kind: "context", newLine: 15, text: "  const url = `https://github.com/${repo}.git`;" },
    { kind: "removed", text: "-  // TODO: wire up auth" },
    { kind: "added", newLine: 17, text: '+  logger.debug(`cloning with token ${token}`);' },
    { kind: "context", newLine: 18, text: "" },
    { kind: "context", newLine: 41, text: "  // shell out to git" },
    { kind: "added", newLine: 42, text: '+  exec(`git clone ${url} ${dir}`);' },
    { kind: "context", newLine: 43, text: "  return dir;" },
    { kind: "context", newLine: 44, text: "}" },
  ],
  "src/db/reports.ts": [
    { kind: "hunk", text: "@@ -28,6 +28,10 @@ export async function loadReport(prId) {" },
    { kind: "context", newLine: 28, text: "  const files = await getFiles(prId);" },
    { kind: "removed", text: "-  const raw = await readFile(path);" },
    { kind: "added", newLine: 31, text: "+  const diff = JSON.parse(await readFile(path, 'utf8'));" },
    { kind: "context", newLine: 32, text: "" },
    { kind: "context", newLine: 86, text: "  const issues = [];" },
    { kind: "added", newLine: 87, text: "+  for (const f of files) {" },
    { kind: "added", newLine: 88, text: "+    issues.push(...await db.issues.byFile(f));" },
    { kind: "added", newLine: 89, text: "+  }" },
    { kind: "context", newLine: 90, text: "  return issues;" },
  ],
  "src/components/DiffView.tsx": [
    { kind: "hunk", text: "@@ -3,9 +3,9 @@ import React from 'react';" },
    { kind: "added", newLine: 5, text: "+import { useMemo } from 'react';" },
    { kind: "context", newLine: 6, text: "" },
    { kind: "context", newLine: 11, text: "  try {" },
    { kind: "added", newLine: 12, text: "+  } catch { }" },
    { kind: "context", newLine: 13, text: "  return <pre>{diff}</pre>;" },
    { kind: "context", newLine: 14, text: "}" },
  ],
};

// --- History list ---------------------------------------------------------

export const mockHistory: ReviewSummary[] = [
  {
    repo: "acme/payments-service",
    pr_number: 482,
    pr_title: "Add async diff parsing + clone worker",
    overall_score: 62,
    total_issues: 6,
    created_at: "2026-06-26T14:12:00Z",
  },
  {
    repo: "acme/payments-service",
    pr_number: 477,
    pr_title: "Refactor webhook dispatcher",
    overall_score: 88,
    total_issues: 2,
    created_at: "2026-06-24T09:30:00Z",
  },
  {
    repo: "acme/web-dashboard",
    pr_number: 1203,
    pr_title: "New billing settings page",
    overall_score: 74,
    total_issues: 4,
    created_at: "2026-06-22T17:45:00Z",
  },
  {
    repo: "acme/web-dashboard",
    pr_number: 1198,
    pr_title: "Dark mode token cleanup",
    overall_score: 91,
    total_issues: 1,
    created_at: "2026-06-20T11:05:00Z",
  },
  {
    repo: "acme/infra",
    pr_number: 56,
    pr_title: "Terraform: rotate IAM roles",
    overall_score: 45,
    total_issues: 9,
    created_at: "2026-06-18T08:20:00Z",
  },
  {
    repo: "acme/infra",
    pr_number: 51,
    pr_title: "Bump base AMI + patch CVEs",
    overall_score: 79,
    total_issues: 3,
    created_at: "2026-06-15T13:50:00Z",
  },
];

/** Highest severity present across a review (mock heuristic from score). */
export function severityForHistory(r: ReviewSummary): Severity {
  if (r.overall_score < 50) return "critical";
  if (r.overall_score < 70) return "high";
  if (r.overall_score < 85) return "medium";
  return "low";
}
