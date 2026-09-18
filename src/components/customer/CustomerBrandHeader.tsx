"use client";

export const CustomerBrandHeader = ({
  name,
  logoUrl,
  align = "center",
}: {
  name: string;
  logoUrl?: string | null;
  align?: "center" | "start";
}) => {
  const trimmed = name.trim();
  if (!trimmed && !logoUrl) return null;

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${
        align === "center" ? "flex-col" : "flex-row"
      }`}
    >
      {logoUrl ? (
        /* data URL del local: next/image no aplica. El header es chico a propósito. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className={`object-contain ${
            align === "center" ? "h-8 w-auto max-w-[7rem]" : "h-7 w-auto max-w-[4.5rem]"
          }`}
        />
      ) : null}
      {trimmed ? (
        <p
          className={`min-w-0 max-w-[16rem] truncate font-display uppercase tracking-tight text-carbon sm:max-w-xs ${
            align === "center"
              ? "text-xl sm:text-2xl"
              : "text-base leading-tight sm:text-lg"
          }`}
        >
          {trimmed}
        </p>
      ) : null}
    </div>
  );
};
