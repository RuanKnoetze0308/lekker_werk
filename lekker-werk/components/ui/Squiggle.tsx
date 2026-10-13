export function Squiggle({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M2 6 Q 15 -2, 28 6 T 54 6 T 80 6 T 98 6" />
    </svg>
  );
}
