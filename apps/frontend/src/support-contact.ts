// support-contact.ts: the Prufture team's support contact (WhatsApp and email) and the URLs that
// open them. Pure (no react-native) so node --test can check the exact links; screens open them with
// Linking because a chat or mail compose screen belongs to its own app, not an in-app browser.

export const SUPPORT_WHATSAPP = "+573013935156";
export const SUPPORT_EMAIL = "luisalejandrocardenasr@gmail.com";

const DEFAULT_SUBJECT = "Prufture support";

/** wa.me wants the international number as digits only, no "+" or spaces. */
export function whatsappUrl(phone: string = SUPPORT_WHATSAPP, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function mailtoUrl(address: string = SUPPORT_EMAIL, subject: string = DEFAULT_SUBJECT): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}
