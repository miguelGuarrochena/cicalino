import "server-only";
import crypto from "node:crypto";

/* AES-256-GCM for secrets we must store and read back (Mercado Pago OAuth
 * tokens). The key lives only in the environment (MP_TOKENS_KEY, 32 bytes in
 * base64), so a database dump alone doesn't hand out anyone's MP account.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, each part base64url. The version prefix
 * leaves room to rotate the key later. */

const VERSION = "v1";

const loadKey = (): Buffer | null => {
  const raw = process.env.MP_TOKENS_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
};

export const secretBoxConfigured = (): boolean => loadKey() !== null;

export const seal = (plain: string): string => {
  const key = loadKey();
  if (!key) throw new Error("MP_TOKENS_KEY missing or not 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data].map((p) =>
    typeof p === "string" ? p : p.toString("base64url"),
  ).join(".");
};

export const open = (sealed: string): string => {
  const key = loadKey();
  if (!key) throw new Error("MP_TOKENS_KEY missing or not 32 bytes");
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Unsupported sealed value");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};
