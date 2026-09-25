import {
  INFORMATIVE_QR_PX,
  secondGroupStart,
  type InformativeQrCopy,
} from "@/lib/qrInformativo";

const INK = "#1b29b0";
const INK_DARK = "#111111";
const MUTED = "#5c5c5c";
const RULE = "#e8e8e8";
const HAIR = "rgba(0,0,0,0.10)";

const clickDownload = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("qr-image"));
    img.src = src;
  });

const cssFont = (token: string, fallback: string) => {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return raw || fallback;
};

const displayFont = () => cssFont("--font-display", "Arial Black, sans-serif");
const sansFont = () => cssFont("--font-sans", "Arial, sans-serif");

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  limit = 4,
) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, limit);
};

const fitFont = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: string,
  px: number,
  family: string,
  min = 22,
) => {
  let size = px;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
};

/* El cartel informativo: horizontal, QR a la izquierda, Pedí / Pagá a la
 * derecha. Las proporciones siguen a `InformativeQrCard` (180 × 102 mm). */
const drawCard = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  venue: string,
  tableLabel: string,
  copy: InformativeQrCopy,
  accent: string,
  display: string,
  sans: string,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  const padX = w * 0.042;
  const padY = h * 0.05;
  const qr = h * 0.67;
  const headerH = h * 0.195;
  const colGap = w * 0.036;
  const leftW = qr;
  const ruleX = padX + leftW + colGap * 0.45;
  const rightX = padX + leftW + colGap;
  const rightW = w - padX - rightX;

  const venueSize = fitFont(
    ctx,
    venue,
    w - padX * 2,
    "900",
    h * 0.062,
    display,
    h * 0.036,
  );
  ctx.fillStyle = INK_DARK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 ${venueSize}px ${display}`;
  const venueLines = wrapText(ctx, venue, w - padX * 2, 2);
  let ty = padY + venueSize;
  for (const line of venueLines) {
    ctx.fillText(line, padX, ty);
    ty += venueSize * 1.05;
  }

  ctx.fillStyle = MUTED;
  ctx.font = `400 ${h * 0.038}px ${sans}`;
  ctx.fillText(copy.title, padX, ty + h * 0.014);
  const titleBottom = ty + h * 0.014;

  const qrY = Math.max(padY + headerH, titleBottom + h * 0.028);
  ctx.drawImage(img, padX, qrY, qr, qr);

  ctx.fillStyle = MUTED;
  ctx.font = `500 ${h * 0.025}px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText(tableLabel, padX + qr / 2, qrY + qr + h * 0.032);
  ctx.textAlign = "left";

  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ruleX, qrY);
  ctx.lineTo(ruleX, h - padY);
  ctx.stroke();

  const drawGroup = (
    label: string,
    steps: readonly string[],
    start: number,
    note: string,
    atY: number,
  ) => {
    ctx.fillStyle = accent;
    ctx.font = `600 ${h * 0.026}px ${sans}`;
    ctx.fillText(label.toUpperCase(), rightX, atY);
    let sy = atY + h * 0.048;
    const stepPx = h * 0.041;
    steps.forEach((text, i) => {
      ctx.fillStyle = accent;
      ctx.font = `600 ${stepPx}px ${sans}`;
      ctx.fillText(String(start + i), rightX, sy);
      ctx.fillStyle = INK_DARK;
      ctx.font = `500 ${stepPx}px ${sans}`;
      const lines = wrapText(ctx, text, rightW - h * 0.045, 2);
      lines.forEach((line, li) => {
        ctx.fillText(line, rightX + h * 0.042, sy + li * stepPx * 1.12);
      });
      sy += stepPx * (1.12 * Math.max(1, lines.length)) + h * 0.008;
    });
    ctx.fillStyle = MUTED;
    ctx.font = `400 ${h * 0.027}px ${sans}`;
    const notes = wrapText(ctx, note, rightW, 3);
    sy += h * 0.006;
    for (const line of notes) {
      ctx.fillText(line, rightX, sy);
      sy += h * 0.028;
    }
    return sy;
  };

  let gy = qrY + h * 0.008;
  gy = drawGroup(copy.orderLabel, copy.orderSteps, 1, copy.orderNote, gy);
  gy += h * 0.018;
  ctx.strokeStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(rightX, gy);
  ctx.lineTo(rightX + rightW, gy);
  ctx.stroke();
  gy += h * 0.038;
  drawGroup(copy.payLabel, copy.paySteps, secondGroupStart(copy), copy.payNote, gy);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.font = `400 ${h * 0.022}px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText(copy.byline, w - padX, h - padY * 0.55);

  ctx.restore();
};

export type StickerCard = {
  qrDataUrl: string;
  venue: string;
  tableLabel: string;
  copy: InformativeQrCopy;
  accent: string;
  number: number;
};

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  clickDownload(dataUrl, filename);
};

export const framedQrPng = async (card: StickerCard): Promise<string> => {
  if (typeof document !== "undefined") await document.fonts.ready.catch(() => {});
  const img = await loadImage(card.qrDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = INFORMATIVE_QR_PX.w;
  canvas.height = INFORMATIVE_QR_PX.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  drawCard(
    ctx,
    img,
    0,
    0,
    INFORMATIVE_QR_PX.w,
    INFORMATIVE_QR_PX.h,
    card.venue,
    card.tableLabel,
    card.copy,
    card.accent,
    displayFont(),
    sansFont(),
  );
  return canvas.toDataURL("image/png");
};

export const sheetPng = async (
  cards: StickerCard[],
  kind: "solo" | "marco",
  cols?: number,
): Promise<string> => {
  if (typeof document !== "undefined") await document.fonts.ready.catch(() => {});
  const n = Math.max(1, cards.length);
  const columns = cols ?? (kind === "solo" ? 3 : 1);
  const rows = Math.ceil(n / columns);
  const gap = 36;
  const pad = 48;
  const cellW = kind === "solo" ? 560 : INFORMATIVE_QR_PX.w;
  const cellH = kind === "solo" ? 640 : INFORMATIVE_QR_PX.h;
  const canvas = document.createElement("canvas");
  canvas.width = pad * 2 + columns * cellW + (columns - 1) * gap;
  canvas.height = pad * 2 + rows * cellH + (rows - 1) * gap;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const display = displayFont();
  const sans = sansFont();
  const images = await Promise.all(cards.map((c) => loadImage(c.qrDataUrl)));
  cards.forEach((card, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = pad + col * (cellW + gap);
    const y = pad + row * (cellH + gap);
    const img = images[i]!;
    if (kind === "marco") {
      drawCard(
        ctx,
        img,
        x,
        y,
        cellW,
        cellH,
        card.venue,
        card.tableLabel,
        card.copy,
        card.accent,
        display,
        sans,
      );
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cellW, cellH);
    const qr = Math.min(cellW - 48, cellH - 88);
    ctx.drawImage(img, (cellW - qr) / 2, 16, qr, qr);
    ctx.fillStyle = INK;
    ctx.font = `900 28px ${display}`;
    ctx.textAlign = "center";
    ctx.fillText(card.tableLabel.toUpperCase(), cellW / 2, 16 + qr + 40);
    ctx.restore();
  });
  return canvas.toDataURL("image/png");
};
