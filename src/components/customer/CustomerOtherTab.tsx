"use client";

import { ThemedImg } from "@/components/ui/ThemedImg";
import { Controls } from "@/components/ui/Controls";

interface Props {
  title: string;
  body: string;
}

export const CustomerOtherTab = ({ title, body }: Props) => (
  <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-14 text-center">
    <Controls className="absolute right-4 top-4" />
    <ThemedImg name="bell" alt="" className="h-28 opacity-50" />
    <p className="mt-6 font-display text-2xl uppercase text-carbon">{title}</p>
    <p className="mt-2 max-w-sm text-carbon/60">{body}</p>
  </main>
);
