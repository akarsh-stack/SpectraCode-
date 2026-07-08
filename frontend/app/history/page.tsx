"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { ReviewSummary, Severity } from "@/lib/api";
import { listReviews, prToId } from "@/lib/api";
import { mockHistory, severityForHistory } from "@/lib/mock";
import { scoreColor } from "@/lib/severity";
import { MonoLabel, OutlineButton } from "@/components/ui";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export default function HistoryPage() {
  const router = useRouter();
  const [repoFilter, setRepoFilter] = useState("all");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [data, setData] = useState<ReviewSummary[]>([]);
  const [usingSample, setUsingSample] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load real history from the backend; fall back to sample data if empty/down.
  useEffect(() => {
    let alive = true;
    listReviews().then((reviews) => {
      if (!alive) return;
      if (reviews && reviews.length > 0) {
        setData(reviews);
        setUsingSample(false);
      } else {
        setData(mockHistory);
        setUsingSample(true);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const repos = useMemo(
    () => Array.from(new Set(data.map((r) => r.repo))),
    [data],
  );

  const rows = useMemo(
    () =>
      data.filter((r) => {
        if (repoFilter !== "all" && r.repo !== repoFilter) return false;
        if (sevFilter !== "all" && severityForHistory(r) !== sevFilter)
          return false;
        return true;
      }),
    [data, repoFilter, sevFilter],
  );

  function rerun(repo: string, pr_number: number) {
    const [owner, name] = repo.split("/");
    router.push(`/review/${prToId({ owner, repo: name, pr_number })}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <MonoLabel>SpectraCode</MonoLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
            Review history
          </h1>
        </div>
        <a
          href="/"
          className="font-mono text-xs uppercase tracking-widest text-[#3dd68c] hover:underline"
        >
          + new review
        </a>
      </div>

      {/* filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          label="repo"
          value={repoFilter}
          onChange={setRepoFilter}
          options={["all", ...repos]}
        />
        <Select
          label="severity"
          value={sevFilter}
          onChange={(v) => setSevFilter(v as Severity | "all")}
          options={["all", ...SEVERITIES]}
        />
        <span className="ml-auto font-mono text-[11px] text-zinc-600">
          {rows.length} / {data.length}
        </span>
      </div>

      {usingSample && loaded && (
        <div className="mb-4 flex items-center gap-3 border border-[#ffd43b55] bg-[#ffd43b12] px-4 py-2">
          <span className="rounded-sm bg-[#ffd43b] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
            Sample data
          </span>
          <span className="font-mono text-[11px] text-[#e6d08a]">
            No reviews recorded yet — showing examples. Run a review to populate
            this list.
          </span>
        </div>
      )}

      {/* table */}
      <div className="border border-zinc-800">
        <div className="grid grid-cols-[1fr_90px_90px_140px_110px] gap-2 border-b border-zinc-800 bg-black/40 px-4 py-2.5">
          {["repo / pr", "pr #", "score", "date", ""].map((h) => (
            <MonoLabel key={h}>{h}</MonoLabel>
          ))}
        </div>

        {rows.map((r, i) => (
          <motion.div
            key={`${r.repo}-${r.pr_number}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="grid grid-cols-[1fr_90px_90px_140px_110px] items-center gap-2 border-b border-zinc-900 px-4 py-3 hover:bg-zinc-900/40"
          >
            <div className="min-w-0">
              <a
                href={`/review/${prToId({
                  owner: r.repo.split("/")[0],
                  repo: r.repo.split("/")[1],
                  pr_number: r.pr_number,
                })}`}
                className="block truncate text-sm text-zinc-200 hover:text-white"
              >
                {r.pr_title}
              </a>
              <span className="font-mono text-[11px] text-zinc-500">
                {r.repo}
              </span>
            </div>

            <span className="font-mono text-[12px] text-zinc-400">
              #{r.pr_number}
            </span>

            <span
              className="font-mono text-sm font-semibold"
              style={{ color: scoreColor(r.overall_score) }}
            >
              {r.overall_score}
            </span>

            <span className="font-mono text-[11px] text-zinc-500">
              {new Date(r.created_at).toISOString().slice(0, 10)}
            </span>

            <div className="flex justify-end">
              <OutlineButton
                accent="#4dabf7"
                onClick={() => rerun(r.repo, r.pr_number)}
              >
                ↻ re-run
              </OutlineButton>
            </div>
          </motion.div>
        ))}

        {rows.length === 0 && (
          <div className="px-4 py-10 text-center font-mono text-[12px] text-zinc-600">
            No reviews match these filters.
          </div>
        )}
      </div>
    </main>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 border border-zinc-800 bg-black/40 px-2 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-mono text-[12px] text-zinc-200 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#0a0a0a]">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
