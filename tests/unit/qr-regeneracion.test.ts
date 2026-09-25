/**
 * Regenerar QR impresos (mesas y mostrador): confirmar → regenerar → ofrecer
 * imprimir/descargar el nuevo en el acto, uno o todos. Los QR de pedidos y de
 * la espera no se regeneran.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { translate } from "@/lib/i18n";

vi.mock("@/components/providers/Providers", () => ({
  useApp: () => ({ t: (k: string, v?: Record<string, string | number>) => translate("es", k, v) }),
}));
vi.mock("@/lib/store/config-store", () => ({
  useConfigStore: (sel: (s: { colorMarca: null }) => unknown) => sel({ colorMarca: null }),
}));
vi.mock("@/components/ui/ModalShell", async () => {
  const { createElement: h } = await import("react");
  return { ModalShell: ({ children }: { children?: unknown }) => h("div", null, children as never) };
});

import { regenerateThenOffer } from "@/lib/hooks/useQrRegeneration";
import { tablesToRegenerate } from "@/lib/data/tables";
import { QrDownloadModal } from "@/components/panel/mesas/QrDownloadModal";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const es = (k: string, v?: Record<string, string | number>) => translate("es", k, v);

describe("la secuencia de regenerar", () => {
  const pasos = (over: Partial<Parameters<typeof regenerateThenOffer<string>>[0]> = {}) => {
    const orden: string[] = [];
    const steps = {
      confirm: vi.fn(async () => (orden.push("confirm"), true)),
      run: vi.fn(async () => (orden.push("run"), true)),
      refresh: vi.fn(async () => (orden.push("refresh"), "qr-nuevo")),
      onFresh: vi.fn((f: string) => void orden.push(`ofrecer:${f}`)),
      onError: vi.fn(() => void orden.push("error")),
      ...over,
    };
    return { steps, orden };
  };

  it("confirma, regenera, relee y ofrece el QR nuevo, en ese orden", async () => {
    const { steps, orden } = pasos();
    expect(await regenerateThenOffer(steps)).toBe(true);
    expect(orden).toEqual(["confirm", "run", "refresh", "ofrecer:qr-nuevo"]);
  });

  it("si no confirma, no toca nada", async () => {
    const { steps } = pasos({ confirm: vi.fn(async () => false) });
    expect(await regenerateThenOffer(steps)).toBe(false);
    expect(steps.run).not.toHaveBeenCalled();
    expect(steps.onFresh).not.toHaveBeenCalled();
  });

  it("si la base no regenera, avisa y no ofrece nada (el QR viejo sigue)", async () => {
    const { steps } = pasos({ run: vi.fn(async () => false) });
    expect(await regenerateThenOffer(steps)).toBe(false);
    expect(steps.onError).toHaveBeenCalledOnce();
    expect(steps.refresh).not.toHaveBeenCalled();
    expect(steps.onFresh).not.toHaveBeenCalled();
  });

  it("un error de red también avisa", async () => {
    const { steps } = pasos({ run: vi.fn(async () => Promise.reject(new Error("red"))) });
    expect(await regenerateThenOffer(steps)).toBe(false);
    expect(steps.onError).toHaveBeenCalledOnce();
  });
});

describe("qué regenera «Regenerar todos»", () => {
  const mesas = [
    { id: "1", qrActive: true },
    { id: "2", qrActive: false },
    { id: "3", qrActive: true },
  ];

  it("en Pagos, solo las mesas con el QR activo (no prende QR de más)", () => {
    expect(tablesToRegenerate(mesas, "cuenta").map((m) => m.id)).toEqual(["1", "3"]);
  });

  it("en modalidad Mesa, todas (todas tienen QR)", () => {
    expect(tablesToRegenerate(mesas, "autoservicio").map((m) => m.id)).toEqual(["1", "2", "3"]);
  });
});

describe("QrDownloadModal después de regenerar", () => {
  const base = {
    title: "Mesa 4",
    previewSrc: "data:image/png;base64,x",
    venue: "Local",
    tableLabel: "Mesa 4",
    busy: false,
    onPick: () => {},
    onClose: () => {},
  };

  it("sin aviso ni imprimir, queda como siempre (Solo QR / Con instrucciones)", () => {
    const html = renderToStaticMarkup(createElement(QrDownloadModal, base));
    expect(html).toContain(es("mesasQr.descargarSolo"));
    expect(html).toContain(es("mesasQr.descargarMarco"));
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain(es("mesasQr.listo"));
    expect(html).not.toContain(es("qr.imprimir"));
  });

  it("recién regenerado: dice que es el nuevo y ofrece imprimir, descargar y cerrar", () => {
    const html = renderToStaticMarkup(
      createElement(QrDownloadModal, {
        ...base,
        notice: es("mesasQr.regeneradoAviso"),
        onPrint: () => {},
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(es("mesasQr.regeneradoAviso"));
    expect(html).toContain(es("qr.imprimir"));
    expect(html).toContain(es("mesasQr.descargarSolo"));
    expect(html).toContain(es("mesasQr.descargarMarco"));
    expect(html).toContain(es("mesasQr.listo"));
  });

  it("para todos: «Imprimir todos» y la plancha", () => {
    const html = renderToStaticMarkup(
      createElement(QrDownloadModal, {
        ...base,
        title: es("mesasQr.planchaN", { n: 12 }),
        notice: es("mesasQr.regeneradosAviso", { n: 12 }),
        onPrint: () => {},
        printLabel: es("mesasQr.imprimirTodos"),
      }),
    );
    expect(html).toContain(es("mesasQr.imprimirTodos"));
    expect(html).toContain(es("mesasQr.regeneradosAviso", { n: 12 }));
  });
});

describe("cada pantalla de QR impreso usa el mismo flujo", () => {
  const mesas = read("src/components/panel/mesas/TableQrManager.tsx");
  const mostrador = read("src/components/panel/pedidos/CounterQrManager.tsx");

  it("mesas: regenerar una abre el modal con el QR nuevo", () => {
    expect(mesas).toContain("useQrRegeneration()");
    expect(mesas).toContain("run: async () => (await regenerateTableQr(m.id)).ok");
    expect(mesas).toContain('setDownload({ kind: "one", table: nueva, fresh: true })');
  });

  it("mesas: regenerar todos usa una sola llamada y abre la plancha nueva", () => {
    expect(mesas).toContain("tablesToRegenerate(tables, flow)");
    expect(mesas).toContain("run: async () => (await regenerateTableQrs(branchId, [...ids])).ok");
    expect(mesas).toContain('setDownload({ kind: "sheet", tables: nuevas, fresh: true })');
    expect(mesas).toContain('t("mesasQr.regenerarTodos")');
  });

  it("mesas: imprimir desde el modal imprime justo los regenerados", () => {
    expect(mesas).toContain("printIdsNow(");
    expect(mesas).toContain('download.kind === "sheet" ? t("mesasQr.imprimirTodos")');
    expect(mesas).toContain("if (!download.fresh) setDownload(null);");
  });

  it("mostrador: regenerar abre el modal con el QR nuevo, sin «todos» (es uno solo)", () => {
    expect(mostrador).toContain("run: () => regenerateCounterQr(branchId)");
    expect(mostrador).toContain('if (next) setDownload("fresh")');
    expect(mostrador).toContain('notice={download === "fresh" ? t("mostradorQr.qr.regeneradoAviso") : undefined}');
    expect(mostrador).not.toContain("regenerarTodos");
  });

  it("los QR de pedidos y de la espera no se regeneran", () => {
    const modal = read("src/components/panel/QrModal.tsx");
    expect(modal).not.toMatch(/regenerar|regenerate/i);
  });
});

describe("qr-regenerar-mesas.sql", () => {
  const sql = read("supabase/qr-regenerar-mesas.sql");

  it("reusa regenerar_qr_mesa: mismas reglas, en una transacción", () => {
    expect(sql).toContain("v_res := public.regenerar_qr_mesa(v_id);");
    expect(sql).not.toMatch(/update public\.mesas/);
  });

  it("todas las mesas tienen que ser de la sucursal", () => {
    expect(sql).toContain("where x.id = m and x.local_id = p_local");
    expect(sql).toContain("raise exception 'No autorizado' using errcode = '42501';");
  });

  it("es del personal autenticado, no de anon, y va después de pedidos-mesa.sql", () => {
    expect(sql).toContain("revoke all on function public.regenerar_qr_mesas(uuid, uuid[]) from public, anon;");
    expect(sql).toContain("grant execute on function public.regenerar_qr_mesas(uuid, uuid[]) to authenticated;");
    const orden = JSON.parse(read("supabase/orden.json")) as string[];
    expect(orden.indexOf("qr-regenerar-mesas.sql")).toBeGreaterThan(orden.indexOf("pedidos-mesa.sql"));
  });
});
