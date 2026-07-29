/** Spinner de marca (inline o bloque). */
export const Spinner = ({
  className = "size-5",
}: {
  className?: string;
}) => (
  <span
    className={`inline-block animate-spin rounded-full border-2 border-marca border-r-transparent ${className}`}
    aria-hidden
  />
);
