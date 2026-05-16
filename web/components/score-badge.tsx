interface Props {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
}

const TONE: Record<Props["tone"], string> = {
  green: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  amber: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  red: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
  neutral: "bg-neutral-100 text-neutral-800 ring-1 ring-neutral-200",
};

export function Badge({ label, tone }: Props) {
  return <span className={`badge ${TONE[tone]}`}>{label}</span>;
}

export function toneFor(value: string): Props["tone"] {
  const positive = ["High", "Strong", "Sign", "Strong Candidate", "Strong monetization", "Low traffic, strong potential"];
  const warn = ["Medium", "Moderate", "Average", "Pilot test", "Monitor", "Watchlist", "Balanced"];
  const negative = ["Low", "Weak", "Pass", "Not Recommended", "High traffic, weak monetization"];
  if (positive.includes(value)) return "green";
  if (warn.includes(value)) return "amber";
  if (negative.includes(value)) return "red";
  return "neutral";
}
