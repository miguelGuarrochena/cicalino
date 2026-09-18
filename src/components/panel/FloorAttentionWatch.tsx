"use client";

import { useFloorAttentionWatch } from "@/lib/hooks/useFloorAttention";

/* Keeps the floor subscription alive from any panel screen so Mesas can
 * light up without sitting on that page. Sound stays optional (SoundToggle). */
export const FloorAttentionWatch = () => {
  useFloorAttentionWatch();
  return null;
};
