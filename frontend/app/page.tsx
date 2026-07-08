"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { parsePrUrl, prToId } from "@/lib/api";
import { MonoLabel } from "@/components/ui";

// Lazy-load heavy WebGL/Three.js components — avoids SSR issues
const GridBackground = lazy(() => import("@/components/GridBackground"));
const TorusKnot = lazy(() => import("@/components/TorusKnot"));

const AGENTS = [
  { name: "Security Agent", task: "scanning for injection + secrets", accent: "#ff3b3b" },
  { name: "Performance Agent", task: "profiling hot paths + queries", accent: "#ffd43b" },
  { name: "Style Agent", task: "checking conventions + lint", accent: "#4dabf7" },
];

type Phase = "idle" | "analyzing";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const start = useCallback(() => {
    const parsed = parsePrUrl(url);
    if (!parsed) {
      setError("Enter a valid GitHub PR URL.");
      return;
    }
    setError(null);
    setPhase("analyzing");
    setActive(0);

    const id = prToId(parsed);
    const STEP = 850;
    AGENTS.forEach((_, i) => {
      setTimeout(() => setActive(i + 1), STEP * (i + 1));
    });
    setTimeout(() => router.push(`/review/${id}`), STEP * (AGENTS.length + 1));
  }, [url, router]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 overflow-hidden">

      {/* Layer 0: WebGL glowing grid */}
      <Suspense fallback={null}>
        <GridBackground />
      </Suspense>

      {/* Layer 1: Three.js 3D torus knot */}
      <Suspense fallback={null}>
        <TorusKnot />
      </Suspense>

      {/* Layer 2: UI */}
      <AnimatePresence mode="wait">
        {phase === "idle" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-2xl"
          >
            {/* Glassmorphism card */}
            <div
              className="rounded-sm border border-[#3dd68c22] px-8 py-10"
              style={{
                background: "rgba(5, 10, 5, 0.72)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                boxShadow: "0 0 60px rgba(61,214,140,0.07), 0 0 120px rgba(0,0,0,0.6)",
              }}
            >
              {/* Header */}
              <motion.div
                className="mb-8 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
              >
                <MonoLabel>code-review-agent</MonoLabel>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100">
                  Review a pull request
                </h1>
                <p className="mt-2 font-mono text-xs tracking-widest text-zinc-500 uppercase">
                  three agents. one verdict. paste a github PR url.
                </p>
              </motion.div>

              {/* Input form */}
              <motion.form
                onSubmit={(e) => { e.preventDefault(); start(); }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28, duration: 0.5 }}
              >
                <div
                  className="flex items-stretch border border-zinc-800 transition-all duration-300"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                >
                  <input
                    autoFocus
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo/pull/123"
                    className="input-glow w-full bg-transparent px-4 py-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="review-btn shrink-0 border-l border-zinc-800 px-5 font-mono text-xs uppercase tracking-widest text-[#3dd68c] transition-all duration-200 hover:bg-[#3dd68c15] hover:border-[#3dd68c44] hover:text-[#5affa8] hover:shadow-[0_0_20px_rgba(61,214,140,0.2)] active:scale-95"
                  >
                    Review →
                  </button>
                </div>
              </motion.form>

              {/* Error */}
              <div className="mt-3 h-4 text-center">
                {error && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-mono text-[11px] text-[#ff3b3b]"
                  >
                    {error}
                  </motion.span>
                )}
              </div>

              {/* Agent pills */}
              <motion.div
                className="mt-8 flex justify-center gap-3 flex-wrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.5 }}
              >
                {AGENTS.map((a) => (
                  <span
                    key={a.name}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest"
                    style={{
                      borderColor: `${a.accent}44`,
                      color: a.accent,
                      background: `${a.accent}0d`,
                    }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: a.accent, boxShadow: `0 0 6px ${a.accent}` }}
                    />
                    {a.name}
                  </span>
                ))}
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 w-full max-w-2xl"
          >
            <div
              className="rounded-sm border border-[#3dd68c22] px-8 py-10"
              style={{
                background: "rgba(5, 10, 5, 0.72)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                boxShadow: "0 0 60px rgba(61,214,140,0.07), 0 0 120px rgba(0,0,0,0.6)",
              }}
            >
              <div className="mb-8 text-center">
                <MonoLabel>analyzing</MonoLabel>
                <h2 className="mt-3 font-mono text-lg tracking-tight text-zinc-200">
                  <span className="text-[#3dd68c]">▍</span> running agents…
                </h2>
              </div>

              <div className="space-y-3">
                {AGENTS.map((agent, i) => {
                  const state = i < active ? "done" : i === active ? "running" : "idle";
                  return (
                    <AgentCard key={agent.name} agent={agent} state={state} index={i} />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function AgentCard({
  agent,
  state,
  index,
}: {
  agent: { name: string; task: string; accent: string };
  state: "idle" | "running" | "done";
  index: number;
}) {
  const accent = agent.accent;
  const isIdle = state === "idle";
  const isRunning = state === "running";
  const isDone = state === "done";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: isIdle ? 0.35 : 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="flex items-center justify-between border bg-black/40 px-4 py-3.5"
      style={{
        borderColor: isIdle ? "#27272a" : `${accent}66`,
        boxShadow: isRunning ? `0 0 22px ${accent}33` : "none",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: isIdle ? "#3f3f46" : accent }}
          />
          {isRunning && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: accent }}
              animate={{ opacity: [0.7, 0], scale: [1, 2.4] }}
              transition={{ repeat: Infinity, duration: 1.1 }}
            />
          )}
        </span>
        <div>
          <div
            className="font-mono text-sm"
            style={{ color: isIdle ? "#a1a1aa" : "#fafafa" }}
          >
            {agent.name}
          </div>
          <div className="font-mono text-[11px] text-zinc-500">
            {isDone ? "complete" : agent.task}
          </div>
        </div>
      </div>

      <div className="font-mono text-xs uppercase tracking-widest">
        {isDone ? (
          <span style={{ color: "#3dd68c" }}>✓ done</span>
        ) : isRunning ? (
          <motion.span
            style={{ color: accent }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            ● running
          </motion.span>
        ) : (
          <span className="text-zinc-600">queued</span>
        )}
      </div>
    </motion.div>
  );
}
