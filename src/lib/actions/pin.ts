"use server";

import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { parseInput } from "@/lib/schemas";
import { uuid } from "@/lib/schemas/common";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { z } from "zod";

const pinVerifySchema = z.object({
  employeeId: uuid,
  pin: z.string().trim().min(1).max(12),
});

const clientIpFromHeaders = async (): Promise<string> => {
  const hdrs = await headers();
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip")?.trim() ||
    "sin-ip"
  );
};

/** Verifica el PIN del empleado con rate limit (sesión + IP + SQL). */
export const verifyEmployeePinAction = async (
  employeeId: string,
  pin: string,
): Promise<{ id: string; name: string } | null> => {
  const perfil = await getCurrentProfile();
  if (!perfil) return null;

  const v = parseInput(pinVerifySchema, { employeeId, pin });
  if (!v.ok) return null;

  const ip = await clientIpFromHeaders();
  const porUser = await sharedRateLimit(
    `pin:u:${perfil.id}:${v.data.employeeId}`,
    10,
    60_000,
  );
  const porIp = await sharedRateLimit(`pin:ip:${ip}`, 30, 60_000);
  if (!porUser.ok || !porIp.ok) return null;

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("verificar_pin_empleado", {
    p_empleado: v.data.employeeId,
    p_pin: v.data.pin,
  });
  if (error) {
    console.error("verifyEmployeePinAction", error.message);
    return null;
  }
  const fila = Array.isArray(data) ? data[0] : data;
  return fila ? { id: fila.id, name: fila.nombre } : null;
};
