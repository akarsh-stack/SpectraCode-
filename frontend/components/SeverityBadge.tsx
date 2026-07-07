import type { Severity } from "@/lib/api";
import { SEVERITY_COLORS } from "@/lib/severity";

interface Props {
  severity: Severity;
  className?: string;
}

/**
 * Brutalist mono badge with a low-opacity tinted background and a 1px border
 * in the severity color.
 */
export default function SeverityBadge({ severity, className = "" }: Props) {
  const color = SEVERITY_COLORS[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${className}`}
      style={{
        color,
        borderColor: `${color}66`,
        backgroundColor: `${color}14`,
        borderWidth: 1,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {severity}
    </span>
  );
}
