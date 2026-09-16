"use client";

import { useSyncExternalStore } from "react";
import {
  DEVICE_MODE_EVENT,
  readDeviceMode,
  type DeviceMode,
} from "@/lib/modules";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(DEVICE_MODE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(DEVICE_MODE_EVENT, cb);
  };
};

export const useDeviceMode = (): DeviceMode =>
  useSyncExternalStore(subscribe, readDeviceMode, () => "ambos" as const);
