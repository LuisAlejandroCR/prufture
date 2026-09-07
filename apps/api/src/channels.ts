// channels.ts: post-proof delivery behind one interface — sendVerifyUrl(channel, to, url).
// Every channel sends ONLY the public verifyUrl. It never sends the media, the signed payload,
// a volunteer identifier, or an exact location. Every channel degrades via guard(): a missing
// key or a dead provider returns a typed ExternalUnavailable and never throws the caller.

import { guard, type ExternalResult } from "@proof/core";

export type Channel = "whatsapp" | "email" | "telegram";

export interface ChannelSendResult {
  channel: Channel;
  /** Provider-side id of the sent message, when the provider returns one. */
  providerId: string;
}

const env = (k: string): string => process.env[k] ?? "";

function unconfigured(channel: Channel, missing: string): ExternalUnavailableLike {
  return {
    available: false,
    source: `channel/${channel}`,
    checkedAt: new Date().toISOString(),
    data: null,
    error: `channel not configured (${missing} missing)`,
  };
}

// Local alias so the helper above type-checks without importing the concrete type name.
type ExternalUnavailableLike = Extract<ExternalResult<ChannelSendResult>, { available: false }>;

/** Only the URL is ever transmitted. No task data, no PII, no media. */
export async function sendVerifyUrl(
  channel: Channel,
  to: string,
  url: string,
): Promise<ExternalResult<ChannelSendResult>> {
  switch (channel) {
    case "whatsapp":
      return sendWhatsApp(to, url);
    case "email":
      return sendEmail(to, url);
    case "telegram":
      return sendTelegram(to, url);
    default:
      return unconfigured(channel, "unknown channel");
  }
}

// --- Kapso / WhatsApp -------------------------------------------------------
// Kapso is used as a thin wrapper over the WhatsApp Cloud API. Text message, URL only.
async function sendWhatsApp(to: string, url: string): Promise<ExternalResult<ChannelSendResult>> {
  const key = env("KAPSO_API_KEY");
  const phoneId = env("KAPSO_PHONE_NUMBER_ID");
  if (!key) return unconfigured("whatsapp", "KAPSO_API_KEY");
  if (!phoneId) return unconfigured("whatsapp", "KAPSO_PHONE_NUMBER_ID");
  const base = env("KAPSO_API_BASE") || "https://app.kapso.ai/api/v1";

  return guard("channel/whatsapp", async () => {
    const res = await fetch(`${base}/whatsapp/phone_numbers/${phoneId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ to, type: "text", text: { body: url } }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: { id?: string }; error?: unknown };
    if (!res.ok) throw new Error(`kapso ${res.status}: ${JSON.stringify(body)}`);
    return { channel: "whatsapp" as const, providerId: body.id ?? body.message?.id ?? "" };
  });
}

// --- Email (Resend-compatible) --------------------------------------------
async function sendEmail(to: string, url: string): Promise<ExternalResult<ChannelSendResult>> {
  const key = env("EMAIL_API_KEY");
  const from = env("EMAIL_FROM");
  if (!key) return unconfigured("email", "EMAIL_API_KEY");
  if (!from) return unconfigured("email", "EMAIL_FROM");
  const base = env("EMAIL_API_BASE") || "https://api.resend.com";

  return guard("channel/email", async () => {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to,
        subject: "Prufture proof verification",
        text: `Verify this field proof:\n${url}\n\nNo volunteer identity or media is included.`,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(`email ${res.status}: ${JSON.stringify(body)}`);
    return { channel: "email" as const, providerId: body.id ?? "" };
  });
}

// --- Telegram (optional) --------------------------------------------------
async function sendTelegram(to: string, url: string): Promise<ExternalResult<ChannelSendResult>> {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) return unconfigured("telegram", "TELEGRAM_BOT_TOKEN");

  return guard("channel/telegram", async () => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: to, text: url, disable_web_page_preview: false }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!res.ok || !body.ok) throw new Error(`telegram ${res.status}: ${body.description ?? "send failed"}`);
    return { channel: "telegram" as const, providerId: String(body.result?.message_id ?? "") };
  });
}
