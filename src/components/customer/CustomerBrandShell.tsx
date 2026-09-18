"use client";

import type { CSSProperties, ReactNode } from "react";
import {
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
      className={className}
      style={
        {
          colorScheme: "light",
          ...(vars ?? {}),
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
};
