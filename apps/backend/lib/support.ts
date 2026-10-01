// support.ts: the /support page's WhatsApp link. Pure so node --test can pin the exact URL; the
// contact itself comes from NEXT_PUBLIC_SUPPORT_WHATSAPP and is never hard-coded here.

const USERNAME = /^@[a-z0-9._]{3,35}$/;

/**
 * A WhatsApp username ("@name", lowercase letters, digits, "." and "_") opens wa.me/@name; a number
 * keeps only the digits wa.me wants. "" when there is neither.
 */
export function whatsappLink(contact: string): string {
  const handle = contact.trim().toLowerCase();
  if (USERNAME.test(handle)) return `https://wa.me/${handle}`;
  if (handle.startsWith("@")) return "";
  const digits = contact.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}
