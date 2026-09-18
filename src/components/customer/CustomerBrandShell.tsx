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
  const vars = brandCssVars(color);
  return (
    <div
      className={`min-h-dvh bg-crema text-carbon ${className}`.trim()}
      style={
        {
          colorScheme: brandColorScheme(color),
          ...(vars ?? {}),
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
};
