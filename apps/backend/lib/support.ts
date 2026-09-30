// support.ts: the /support page's WhatsApp link. Pure so node --test can pin the exact URL; the
// number itself comes from NEXT_PUBLIC_SUPPORT_WHATSAPP and is never hard-coded here.

/** wa.me wants the international number as digits only, no "+" or spaces; "" when there is none. */
export function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}
