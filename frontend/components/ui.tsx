import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Brutalist outline button: sharp corners, 1px border, mono uppercase. */
export function OutlineButton({
  children,
  className = "",
  accent,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  accent?: string;
}) {
  const color = accent ?? "#3dd68c";
  return (
    <button
      {...rest}
      className={`group inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}0d`,
      }}
    >
      {children}
    </button>
  );
}

/** Small mono uppercase label for section headers / metadata keys. */
export function MonoLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 ${className}`}
    >
      {children}
    </span>
  );
}
