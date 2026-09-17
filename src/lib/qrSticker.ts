const INK = "#1b29b0";
const MUTED = "#6b7280";
const RULE = "#9ca3af";
const CARD_W = 840;
const CARD_H = 1080;

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

const displayFont = () => {
  if (typeof document === "undefined") return "Arial Black, sans-serif";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-display")
    .trim();
  return raw || "Arial Black, sans-serif";
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
};

const drawCard = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  venue: string,
  tableLabel: string,
  instruction: string,
  font: string,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, w, h, 24);
  ctx.fill();
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 4;
  roundRect(ctx, 18, 18, w - 36, h - 36, 16);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = MUTED;
  ctx.font = `700 22px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText(venue.toUpperCase(), w / 2, 88);

  ctx.fillStyle = INK;
  ctx.font = `900 56px ${font}`;
  ctx.fillText(tableLabel.toUpperCase(), w / 2, 168);

  const qr = Math.min(560, w - 160);
  const qx = (w - qr) / 2;
  ctx.drawImage(img, qx, 210, qr, qr);

  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${font}`;
  const lines = wrapText(ctx, instruction, w - 120);
  let ty = 210 + qr + 64;
  for (const line of lines) {
    ctx.fillText(line, w / 2, ty);
    ty += 32;
  }
  ctx.restore();
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
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
  return lines.slice(0, 3);
};

export type StickerCard = {
  qrDataUrl: string;
  venue: string;
  tableLabel: string;
  instruction: string;
  number: number;
};

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  clickDownload(dataUrl, filename);
};

export const framedQrPng = async (card: StickerCard): Promise<string> => {
  if (typeof document !== "undefined") await document.fonts.ready.catch(() => {});
  const img = await loadImage(card.qrDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  drawCard(
    ctx,
    img,
    0,
    0,
    CARD_W,
    CARD_H,
    card.venue,
    card.tableLabel,
    card.instruction,
    displayFont(),
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
  const columns = cols ?? (kind === "solo" ? 3 : 2);
  const rows = Math.ceil(n / columns);
  const gap = 36;
  const pad = 48;
  const cellW = kind === "solo" ? 560 : 720;
  const cellH = kind === "solo" ? 640 : 920;
  const canvas = document.createElement("canvas");
  canvas.width = pad * 2 + columns * cellW + (columns - 1) * gap;
  canvas.height = pad * 2 + rows * cellH + (rows - 1) * gap;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const font = displayFont();
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
        card.instruction,
        font,
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
    ctx.font = `900 28px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(card.tableLabel.toUpperCase(), cellW / 2, 16 + qr + 40);
    ctx.restore();
  });
  return canvas.toDataURL("image/png");
};
