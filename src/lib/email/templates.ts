import "server-only";

// Layout de email branded (mascota + colores/tipografía de Cicalino).
// HTML con estilos inline y tablas para compatibilidad con clientes de mail.

const rawSite = process.env.NEXT_PUBLIC_APP_URL ?? "";
// En los mails las imágenes deben ser URLs absolutas públicas (no localhost).
const SITE =
  rawSite && !rawSite.includes("localhost") ? rawSite : "https://cicalino.net";

const MARCA = "#2536d4";
const MARCA_FUERTE = "#1b28a8";
const CREMA = "#f4f1da";
const CARBON = "#20264f";
const SURFACE = "#ffffff";
const LINEA = "#e7e3cf";
const FONT =
  "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface EmailOpts {
  titulo: string;
  cuerpoHtml: string;
  cta?: { label: string; url: string };
  pie?: string;
}

export const emailLayout = ({
  titulo,
  cuerpoHtml,
  cta,
  pie,
}: EmailOpts): string => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo}</title>
  </head>
  <body style="margin:0;padding:0;background:${CREMA};font-family:${FONT};color:${CARBON};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREMA};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${SURFACE};border:1px solid ${LINEA};border-radius:24px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:36px 32px 8px;">
                <img src="${SITE}/bell-light.png" width="92" height="92" alt="Cicalino" style="display:block;border:0;outline:none;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 32px;">
                <h1 style="margin:0 0 14px;font-size:26px;line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:-0.02em;color:${MARCA};">${titulo}</h1>
                <div style="font-size:15px;line-height:1.65;color:${CARBON};">${cuerpoHtml}</div>
                ${
                  cta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;">
                        <tr><td style="border-radius:999px;background:${MARCA};">
                          <a href="${cta.url}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:${CREMA};text-decoration:none;border-radius:999px;background:${MARCA};border:1px solid ${MARCA_FUERTE};">${cta.label}</a>
                        </td></tr>
                      </table>`
                    : ""
                }
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${CARBON};opacity:0.5;">
            ${pie ?? "Cicalino · Avisos de pedido por QR · info@cicalino.net"}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
