import type { Severity } from "./api";

// Severity palette from the design language.
export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#ff3b3b",
  high: "#ff8a3d",
  medium: "#ffd43b",
  low: "#4dabf7",
};

export const OK_COLOR = "#3dd68c";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** Color band for a 0-100 score. */
export function scoreColor(score: number): string {
  if (score >= 85) return OK_COLOR; // #3dd68c
  if (score >= 70) return SEVERITY_COLORS.medium; // #ffd43b
  if (score >= 50) return SEVERITY_COLORS.high; // #ff8a3d
  return SEVERITY_COLORS.critical; // #ff3b3b
}

export function scoreBandLabel(score: number): string {
  if (score >= 85) return "GOOD";
  if (score >= 70) return "FAIR";
  if (score >= 50) return "RISKY";
  return "POOR";
}
