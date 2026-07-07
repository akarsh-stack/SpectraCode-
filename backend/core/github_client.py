"""GitHub integration built on PyGithub + httpx.

Provides diff fetching, PR metadata, and posting a formatted review comment.
"""

from __future__ import annotations

import httpx
from github import Auth, Github

from agents.aggregator_agent import ReviewReport
from agents.base import Severity
from core.config import settings

GITHUB_API = "https://api.github.com"


class PRFetchError(Exception):
    """Raised when a PR diff cannot be fetched from GitHub.

    Carries an HTTP ``status_code`` so the API layer can surface the right
    response (e.g. 404 for a missing/inaccessible PR) with a clear message.
    """

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code

# Emoji + label per severity, used when rendering the markdown comment.
SEVERITY_BADGE: dict[str, str] = {
    Severity.CRITICAL.value: "🔴 `CRITICAL`",
    Severity.HIGH.value: "🟠 `HIGH`",
    Severity.MEDIUM.value: "🟡 `MEDIUM`",
    Severity.LOW.value: "🔵 `LOW`",
}


def _score_emoji(score: int) -> str:
    if score >= 90:
        return "🟢"
    if score >= 70:
        return "🟡"
    if score >= 50:
        return "🟠"
    return "🔴"


class GitHubClient:
    """Thin wrapper around PyGithub for the review workflow."""

    def __init__(self, token: str | None = None) -> None:
        self.token = token or settings.GITHUB_TOKEN
        self._gh = Github(auth=Auth.Token(self.token)) if self.token else Github()

    def fetch_pr_diff(self, repo: str, pr_number: int) -> str:
        """Return the full unified diff for a PR as a string.

        Uses the REST API's diff media type, which PyGithub doesn't expose
        directly, so we fetch it with httpx using the same token.

        Raises :class:`PRFetchError` with a clear, user-facing message when the
        PR can't be fetched (not found, no access, rate-limited, network error).
        Never returns mock/placeholder data.
        """
        url = f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}"
        headers = {"Accept": "application/vnd.github.v3.diff"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        try:
            resp = httpx.get(url, headers=headers, timeout=30.0, follow_redirects=True)
        except httpx.RequestError as exc:
            raise PRFetchError(
                f"Network error contacting GitHub for {repo}#{pr_number}: {exc}",
                status_code=502,
            ) from exc

        if resp.status_code == 404:
            raise PRFetchError(
                f"PR not found or inaccessible: {repo}#{pr_number}. "
                "Check the URL, or that the token has access to this repository.",
                status_code=404,
            )
        if resp.status_code in (401, 403):
            raise PRFetchError(
                f"Access denied fetching {repo}#{pr_number} (HTTP {resp.status_code}). "
                "The GitHub token is missing, invalid, or lacks access to this repo.",
                status_code=resp.status_code,
            )
        if resp.status_code >= 400:
            raise PRFetchError(
                f"GitHub returned HTTP {resp.status_code} for {repo}#{pr_number}.",
                status_code=502,
            )

        diff = resp.text
        if not diff.strip():
            raise PRFetchError(
                f"GitHub returned an empty diff for {repo}#{pr_number}.",
                status_code=502,
            )
        return diff

    def get_pr_metadata(self, repo: str, pr_number: int) -> dict:
        """Return title, author, and branch names for a PR."""
        pull = self._gh.get_repo(repo).get_pull(pr_number)
        return {
            "title": pull.title,
            "author": pull.user.login if pull.user else None,
            "base_branch": pull.base.ref,
            "head_branch": pull.head.ref,
            "state": pull.state,
            "url": pull.html_url,
        }

    def post_review_comment(
        self, repo: str, pr_number: int, report: ReviewReport
    ) -> str:
        """Post the report as a formatted markdown comment; return comment URL."""
        body = self.format_report(report)
        pull = self._gh.get_repo(repo).get_pull(pr_number)
        comment = pull.create_issue_comment(body)
        return comment.html_url

    @staticmethod
    def format_report(report: ReviewReport) -> str:
        """Render a :class:`ReviewReport` as a nice GitHub markdown comment."""
        sev = report.issues_by_severity
        lines: list[str] = []
        lines.append("## 🤖 Code Review Agent")
        lines.append("")
        lines.append(
            f"### {_score_emoji(report.overall_score)} Score: "
            f"**{report.overall_score} / 100**"
        )
        lines.append("")
        lines.append(report.summary)
        lines.append("")

        # Severity summary table.
        lines.append("| Severity | Count |")
        lines.append("| --- | --- |")
        for key in ("critical", "high", "medium", "low"):
            lines.append(f"| {SEVERITY_BADGE[key]} | {sev.get(key, 0)} |")
        lines.append(f"| **Total** | **{report.total_issues}** |")
        lines.append("")

        if report.top_recommendations:
            lines.append("### ✅ Top Recommendations")
            for rec in report.top_recommendations:
                lines.append(f"- {rec}")
            lines.append("")

        if report.issues:
            lines.append("### 🔎 Findings")
            lines.append("")
            for issue in report.issues:
                badge = SEVERITY_BADGE.get(issue.severity.value, issue.severity.value)
                loc = ""
                if issue.file:
                    loc = f" — `{issue.file}`"
                    if issue.line_number is not None:
                        loc += f":{issue.line_number}"
                elif issue.line_number is not None:
                    loc = f" — line {issue.line_number}"
                lines.append(f"<details><summary>{badge} {issue.category}{loc}</summary>")
                lines.append("")
                lines.append(f"**Agent:** `{issue.agent}`")
                lines.append("")
                lines.append(issue.description)
                lines.append("")
                lines.append(f"**Suggested fix:** {issue.fix_suggestion}")
                lines.append("")
                lines.append("</details>")
                lines.append("")

        lines.append("---")
        lines.append("<sub>Generated by code-review-agent</sub>")
        return "\n".join(lines)
