export const DayNavBtn = ({
  dir,
  label,
  onClick,
}: {
  dir: "prev" | "next";
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="flex size-10 shrink-0 items-center justify-center rounded-full border border-linea text-carbon/70 transition hover:bg-crema hover:text-carbon"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "prev" ? (
        <path d="M15 6l-6 6 6 6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  </button>
);
