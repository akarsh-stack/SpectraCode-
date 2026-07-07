"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Issue, Report } from "@/lib/api";
import { triggerReview, idToPr } from "@/lib/api";
import { mockReportForId, mockDiffs, type DiffLine } from "@/lib/mock";
import { parseUnifiedDiff } from "@/lib/diff";
import { SEVERITY_COLORS } from "@/lib/severity";
import ScoreGauge from "@/components/ScoreGauge";
import SeverityBadge from "@/components/SeverityBadge";
import { OutlineButton, MonoLabel } from "@/components/ui";

type Status = "loading" | "live" | "offline";

export default function ReviewView({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // Kick off a real review against the backend. If it fails (bogus PR, backend
  // down, no access), surface the error and clearly label the sample fallback —
  // never silently pretend mock data is real.
  useEffect(() => {
    const pr = idToPr(id);
    if (!pr) {
      setReport(mockReportForId(id));
      setError("Invalid PR URL.");
      setStatus("offline");
      return;
    }
    let alive = true;
    setStatus("loading");
    setError(null);
    triggerReview({ repo: `${pr.owner}/${pr.repo}`, pr_number: pr.pr_number })
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setReport(res.report);
          setError(null);
          setStatus("live");
        } else {
          setReport(mockReportForId(id));
          setError(res.error);
          setStatus("offline");
        }
      })
      .catch((e) => {
        if (!alive) return;
        setReport(mockReportForId(id));
        setError(e instanceof Error ? e.message : "Unexpected error.");
        setStatus("offline");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!report) return <LoadingScreen id={id} />;

  return (
    <ReviewBody
      report={report}
      status={status}
      error={error}
      posted={posted}
      onPost={() => setPosted(true)}
    />
  );
}

function LoadingScreen({ id }: { id: string }) {
  const pr = idToPr(id);
  const label = pr ? `${pr.owner}/${pr.repo} #${pr.pr_number}` : id;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <MonoLabel>analyzing</MonoLabel>
      <motion.div
        className="font-mono text-sm text-zinc-300"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ repeat: Infinity, duration: 1.1 }}
      >
        <span className="text-[#3dd68c]">▍</span> fetching diff + running agents…
      </motion.div>
      <p className="font-mono text-[11px] text-zinc-600">{label}</p>
    </div>
  );
}

function ReviewBody({
  report,
  status,
  error,
  posted,
  onPost,
}: {
  report: Report;
  status: Status;
  error: string | null;
  posted: boolean;
  onPost: () => void;
}) {
  // Real diff when the backend provided one; otherwise the mock diffs.
  const diffs: Record<string, DiffLine[]> = useMemo(
    () => (report.diff ? parseUnifiedDiff(report.diff) : mockDiffs),
    [report.diff],
  );

  const files = useMemo(() => {
    const set = new Set<string>();
    report.issues.forEach((i) => i.file && set.add(i.file));
    Object.keys(diffs).forEach((f) => set.add(f));
    return Array.from(set);
  }, [report, diffs]);

  const [activeFile, setActiveFile] = useState<string>(
    () => report.issues.find((i) => i.file)?.file ?? Object.keys(diffs)[0] ?? "",
  );
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    report.issues[0]?.id ?? null,
  );

  const fileIssues = useMemo(
    () => report.issues.filter((i) => i.file === activeFile),
    [report, activeFile],
  );

  const issuesByLine = useMemo(() => {
    const m = new Map<number, Issue>();
    fileIssues.forEach((i) => m.set(i.line_number, i));
    return m;
  }, [fileIssues]);

  const selectedIssue = useMemo(
    () => report.issues.find((i) => i.id === selectedIssueId) ?? null,
    [report, selectedIssueId],
  );

  const diff: DiffLine[] = diffs[activeFile] ?? [];

  function selectFile(f: string) {
    setActiveFile(f);
    const first = report.issues.find((i) => i.file === f);
    setSelectedIssueId(first?.id ?? null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Loud red banner — only when real data failed and we're showing samples */}
      {status === "offline" && (
        <div className="flex items-center gap-3 border-b border-[#ff3b3b] bg-[#ff3b3b1a] px-5 py-2.5">
          <span className="rounded-sm bg-[#ff3b3b] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
            Sample data
          </span>
          <span className="font-mono text-[12px] text-[#ffb3b3]">
            {error ?? "PR not found or inaccessible."} Showing example results —
            not a real review.
          </span>
        </div>
      )}

      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 bg-black/50 px-5 py-3">
        <div className="flex items-center gap-4">
          <ScoreGauge score={report.overall_score} size={64} />
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/history"
                className="font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                ← history
              </Link>
              <MonoLabel>{report.repo}</MonoLabel>
              <StatusPill status={status} />
            </div>
            <h1 className="mt-0.5 text-base font-medium text-zinc-100">
              <span className="font-mono text-zinc-500">#{report.pr_number}</span>{" "}
              {report.pr_title}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
              {report.total_issues} issues ·{" "}
              {Object.entries(report.issues_by_severity)
                .filter(([, n]) => n > 0)
                .map(([s, n]) => `${n} ${s}`)
                .join(" · ")}
            </p>
          </div>
        </div>

        <OutlineButton
          onClick={onPost}
          accent={posted ? "#3dd68c" : "#ededed"}
        >
          {posted ? "✓ posted" : "Post to GitHub"}
        </OutlineButton>
      </header>

      <div className="grid flex-1 grid-cols-[220px_minmax(0,1fr)_360px]">
        {/* Left: file tree */}
        <aside className="border-r border-zinc-800 bg-black/30 py-3">
          <div className="px-4 pb-2">
            <MonoLabel>changed files</MonoLabel>
          </div>
          <ul>
            {files.map((f) => {
              const count = report.issues.filter((i) => i.file === f).length;
              const isActive = f === activeFile;
              return (
                <li key={f}>
                  <button
                    onClick={() => selectFile(f)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left font-mono text-[12px] transition-colors ${
                      isActive
                        ? "bg-zinc-900 text-zinc-100"
                        : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                    }`}
                    style={
                      isActive
                        ? { boxShadow: "inset 2px 0 0 0 #3dd68c" }
                        : undefined
                    }
                  >
                    <span className="truncate">{f.split("/").pop()}</span>
                    {count > 0 && (
                      <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-300">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Center: diff */}
        <section className="overflow-x-auto bg-[#0a0a0a]">
          <div className="border-b border-zinc-900 px-4 py-2 font-mono text-[11px] text-zinc-500">
            {activeFile || "no file"}
          </div>
          {diff.length > 0 ? (
            <pre className="font-mono text-[12.5px] leading-relaxed">
              {diff.map((line, i) => (
                <DiffRow
                  key={i}
                  line={line}
                  issue={line.newLine ? issuesByLine.get(line.newLine) : undefined}
                  selected={
                    !!line.newLine &&
                    issuesByLine.get(line.newLine)?.id === selectedIssueId
                  }
                  onSelect={(iss) => setSelectedIssueId(iss.id)}
                />
              ))}
            </pre>
          ) : (
            <p className="px-4 py-6 font-mono text-[12px] text-zinc-600">
              No diff preview for this file. Select an issue on the right to see
              details.
            </p>
          )}
        </section>

        {/* Right: issue detail */}
        <aside className="border-l border-zinc-800 bg-black/30">
          <div className="px-4 py-3">
            <MonoLabel>issue detail</MonoLabel>
          </div>
          <AnimatePresence mode="wait">
            {selectedIssue ? (
              <motion.div
                key={selectedIssue.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.22 }}
                className="px-4 pb-6"
              >
                <div className="flex items-center justify-between">
                  <SeverityBadge severity={selectedIssue.severity} />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {selectedIssue.agent}
                  </span>
                </div>

                <p className="mt-3 font-mono text-[11px] text-zinc-500">
                  {selectedIssue.file}:{selectedIssue.line_number} ·{" "}
                  {selectedIssue.category}
                </p>

                <p className="mt-3 text-sm leading-relaxed text-zinc-200">
                  {selectedIssue.description}
                </p>

                <div className="mt-5">
                  <MonoLabel>suggested fix</MonoLabel>
                  <pre className="mt-2 overflow-x-auto border border-zinc-800 bg-black/60 p-3 font-mono text-[12px] leading-relaxed text-[#3dd68c]">
                    {selectedIssue.fix_suggestion}
                  </pre>
                </div>
              </motion.div>
            ) : (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-4 font-mono text-[12px] text-zinc-600"
              >
                No issues in this file. Select a marker in the gutter.
              </motion.p>
            )}
          </AnimatePresence>

          {/* recommendations */}
          <div className="mt-2 border-t border-zinc-900 px-4 py-4">
            <MonoLabel>top recommendations</MonoLabel>
            <ul className="mt-2 space-y-1.5">
              {report.top_recommendations.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2 font-mono text-[11px] text-zinc-400"
                >
                  <span className="text-[#3dd68c]">{String(i + 1).padStart(2, "0")}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  // The offline state is shown via the prominent red banner above the header.
  if (status === "live") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-[#3dd68c]">
        ● live
      </span>
    );
  }
  return null;
}

function DiffRow({
  line,
  issue,
  selected,
  onSelect,
}: {
  line: DiffLine;
  issue?: Issue;
  selected: boolean;
  onSelect: (i: Issue) => void;
}) {
  if (line.kind === "hunk") {
    return (
      <div className="bg-zinc-900/60 px-3 py-1 text-[#4dabf7]">
        <span className="select-none pr-4 text-zinc-700">{"  "}</span>
        {line.text}
      </div>
    );
  }

  const bg =
    line.kind === "added"
      ? "bg-[#3dd68c12]"
      : line.kind === "removed"
        ? "bg-[#ff3b3b12]"
        : "";
  const textColor =
    line.kind === "added"
      ? "text-[#9fe8c4]"
      : line.kind === "removed"
        ? "text-[#f0a3a3]"
        : "text-zinc-300";

  const dotColor = issue ? SEVERITY_COLORS[issue.severity] : undefined;

  return (
    <div
      className={`group flex items-stretch ${bg} ${
        selected ? "ring-1 ring-inset ring-[#3dd68c66]" : ""
      }`}
    >
      {/* gutter: issue marker + line number */}
      <div className="flex w-[64px] shrink-0 select-none items-center gap-1 border-r border-zinc-900 px-2 text-right">
        <button
          type="button"
          aria-label={issue ? `${issue.severity} issue` : "no issue"}
          disabled={!issue}
          onClick={() => issue && onSelect(issue)}
          className="flex h-3 w-3 items-center justify-center"
        >
          {issue && (
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: dotColor,
                boxShadow: selected ? `0 0 8px ${dotColor}` : "none",
              }}
            />
          )}
        </button>
        <span className="ml-auto w-7 text-[11px] text-zinc-600">
          {line.newLine ?? ""}
        </span>
      </div>
      <code className={`flex-1 whitespace-pre px-3 ${textColor}`}>
        {line.text || " "}
      </code>
    </div>
  );
}
