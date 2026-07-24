import "server-only";
import webpush from "web-push";

// Config de Web Push (VAPID). Las claves se generan con:
//   npx web-push generate-vapid-keys
const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:info@cicalino.net";

export const vapidConfigurado = Boolean(PUBLIC && PRIVATE);

if (vapidConfigurado) {
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
}

export { webpush };
