import "server-only";

const API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.RESEND_FROM ?? "Cicalino <info@cicalino.net>";

export const resendConfigured = Boolean(API_KEY);

export const sendEmail = async (opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> => {
  if (!API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error("resend", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("resend", err);
    return false;
  }
};
