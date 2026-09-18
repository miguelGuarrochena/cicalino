"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  brandColorScheme,
  brandCssVars,
  type BrandColorId,
} from "@/lib/customerBrand";

export const CustomerBrandShell = ({
  color,
  className = "",
  children,
}: {
  color: BrandColorId | null;
  className?: string;
  children: ReactNode;
}) => {
  const scheme = brandColorScheme(color);
  const vars = brandCssVars(color);
  return (
    <div
      className={`min-h-dvh bg-crema text-carbon ${className}`.trim()}
      data-scheme={scheme}
      style={
        {
          colorScheme: scheme,
          ...(vars ?? {}),
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
};
