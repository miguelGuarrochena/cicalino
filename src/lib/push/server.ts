import "server-only";
import webpush from "web-push";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:info@cicalino.net";

export const vapidConfigured = Boolean(PUBLIC && PRIVATE);

if (vapidConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
}

export { webpush };
