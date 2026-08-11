import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type EsperaSeenResult =
  | { ok: true; id: string; seen: boolean }
  | { ok: false; reason: "not-found" | "expired" | "not-configured" };

const expirado = (qrExpiraEn: string | null): boolean =>
  Boolean(qrExpiraEn && new Date(qrExpiraEn) < new Date());

export const fetchCustomerEsperaSeen = async (
  token: string,
): Promise<EsperaSeenResult> => {
  const supabase = createAdminSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const { data, error } = await supabase
    .from("esperas")
    .select("id, qr_expira_en, visto_en")
    .eq("qr_token", token)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not-found" };
  if (expirado(data.qr_expira_en as string | null)) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    id: data.id as string,
    seen: Boolean(data.visto_en),
  };
};

/* Primera apertura del QR de espera: mismo criterio que pedidos — una sola
 * escritura para que el panel cierre el modal sin esperar al poll del cliente. */
export const markCustomerEsperaSeen = async (id: string): Promise<void> => {
  const supabase = createAdminSupabase();
  if (!supabase) return;
  await supabase
    .from("esperas")
    .update({ visto_en: new Date().toISOString() })
    .eq("id", id)
    .is("visto_en", null);
};
