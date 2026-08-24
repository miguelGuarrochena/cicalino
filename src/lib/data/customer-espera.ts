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

/* Primera apertura o reescaneo: el poll no debe llamar esto en cada GET. */
export const markCustomerEsperaSeen = async (
  id: string,
  mode: "first" | "visit" = "first",
): Promise<void> => {
  const supabase = createAdminSupabase();
  if (!supabase) return;
  const q = supabase
    .from("esperas")
    .update({ visto_en: new Date().toISOString() })
    .eq("id", id);
  if (mode === "first") {
    await q.is("visto_en", null);
    return;
  }
  await q;
};
