// API client for the code-review-agent backend.
// Talks to NEXT_PUBLIC_API_URL (default http://localhost:8000).
// All calls fail gracefully — callers fall back to mock data so the UI
// is fully viewable without a running backend.

export type Severity = "critical" | "high" | "medium" | "low";

export interface Issue {
  id: string;
  severity: Severity;
  line_number: number;
  description: string;
  fix_suggestion: string;
  agent: string;
  category: string;
  file?: string;
}

export interface Report {
  repo: string;
  pr_number: number;
  pr_title: string;
  summary: string;
  total_issues: number;
  issues_by_severity: Record<Severity, number>;
  top_recommendations: string[];
  overall_score: number;
  issues: Issue[];
  diff?: string; // raw unified diff of the PR, when available from the backend
}

export interface ReviewSummary {
  repo: string;
  pr_number: number;
  pr_title: string;
  overall_score: number;
  total_issues: number;
  created_at: string; // ISO date
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export interface TriggerReviewInput {
  repo: string;
  pr_number: number;
}

export type TriggerReviewResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

/**
 * POST /review — kick off a new review run.
 * On failure, returns a clear error message (never silently mocks).
 */
export async function triggerReview(
  input: TriggerReviewInput,
): Promise<TriggerReviewResult> {
  try {
    const res = await fetch(`${API_URL}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      // Prefer the backend's detail message (e.g. "PR not found or inaccessible").
      let detail = "";
      try {
        detail = ((await res.json()) as { detail?: string }).detail ?? "";
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 404) {
        return { ok: false, error: detail || "PR not found or inaccessible." };
      }
      if (res.status === 429) {
        return {
          ok: false,
          error: detail || "Rate limited — try again shortly.",
        };
      }
      return {
        ok: false,
        error: detail || `Review failed (HTTP ${res.status}).`,
      };
    }
    return { ok: true, report: normalizeReport((await res.json()) as Report) };
  } catch {
    return {
      ok: false,
      error: "Could not reach the review backend. Is it running?",
    };
  }
}

/**
 * The backend returns issues without a client `id` and with a possibly-null
 * `line_number`. Stamp a stable id and coerce nulls so the UI (which keys
 * selection off `issue.id`) can rely on them.
 */
function normalizeReport(report: Report): Report {
  return {
    ...report,
    issues: (report.issues ?? []).map((iss, i) => ({
      ...iss,
      id: iss.id ?? `iss-${i}`,
      line_number: iss.line_number ?? 0,
    })),
  };
}

/**
 * GET /reviews/{repo}/{pr_number} — fetch an existing review.
 * Returns the Report on success, or null on any error.
 */
export async function getReview(
  repo: string,
  pr_number: number,
): Promise<Report | null> {
  try {
    const res = await fetch(
      `${API_URL}/reviews/${encodeURIComponent(repo)}/${pr_number}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return normalizeReport((await res.json()) as Report);
  } catch {
    return null;
  }
}

/**
 * GET /reviews — list summaries of all completed reviews (most recent first).
 * Returns null on any error so the caller can fall back to sample data.
 */
export async function listReviews(): Promise<ReviewSummary[] | null> {
  try {
    const res = await fetch(`${API_URL}/reviews`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ReviewSummary[];
  } catch {
    return null;
  }
}

// --- URL / id helpers -----------------------------------------------------

export interface ParsedPr {
  owner: string;
  repo: string;
  pr_number: number;
}

/**
 * Parse a GitHub PR URL like
 *   https://github.com/owner/repo/pull/123
 * Returns null when the URL doesn't match.
 */
export function parsePrUrl(url: string): ParsedPr | null {
  const m = url
    .trim()
    .match(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], pr_number: Number(m[3]) };
}

/** Build a route id from a parsed PR: owner__repo__123 */
export function prToId({ owner, repo, pr_number }: ParsedPr): string {
  return `${owner}__${repo}__${pr_number}`;
}

/** Reverse of prToId. Returns null when the id is malformed. */
export function idToPr(id: string): ParsedPr | null {
  const parts = id.split("__");
  if (parts.length !== 3) return null;
  const pr_number = Number(parts[2]);
  if (!Number.isFinite(pr_number)) return null;
  return { owner: parts[0], repo: parts[1], pr_number };
}
