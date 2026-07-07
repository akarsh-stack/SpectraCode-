import { scoreColor, scoreBandLabel } from "@/lib/severity";

interface Props {
  score: number; // 0-100
  size?: number; // px
  stroke?: number; // px
  showLabel?: boolean;
}

/**
 * Circular SVG gauge, color-coded by score band. Pure SVG, no client hooks.
 */
export default function ScoreGauge({
  score,
  size = 72,
  stroke = 6,
  showLabel = true,
}: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const color = scoreColor(clamped);
  const center = size / 2;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`Score ${clamped} of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#ffffff14"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="butt"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono font-semibold leading-none"
          style={{ color, fontSize: size * 0.28 }}
        >
          {clamped}
        </span>
        {showLabel && (
          <span
            className="mt-0.5 font-mono uppercase tracking-widest text-zinc-500"
            style={{ fontSize: Math.max(7, size * 0.1) }}
          >
            {scoreBandLabel(clamped)}
          </span>
        )}
      </div>
    </div>
  );
}
