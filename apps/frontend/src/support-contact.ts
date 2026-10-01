// support-contact.ts: the Prufture team's support contact (WhatsApp and email) and the URLs that
// open them. Pure (no react-native) so node --test can check the exact links; screens open them with
// Linking because a chat or mail compose screen belongs to its own app, not an in-app browser.

// A WhatsApp username (WhatsApp usernames: lowercase letters, digits, "." and "_"), so no phone
// number is published.
export const SUPPORT_WHATSAPP = "@aleo._.o";
export const SUPPORT_EMAIL = "luisalejandrocardenasr@gmail.com";

const DEFAULT_SUBJECT = "Prufture support";

const USERNAME = /^@[a-z0-9._]{3,35}$/;

/**
 * The chat link for a WhatsApp username ("@name" -> wa.me/@name) or a number (international,
 * digits only, no "+" or spaces).
 */
export function whatsappUrl(contact: string = SUPPORT_WHATSAPP, text?: string): string {
  const handle = contact.trim().toLowerCase();
  const target = USERNAME.test(handle) ? handle : contact.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${target}${query}`;
}

export function mailtoUrl(address: string = SUPPORT_EMAIL, subject: string = DEFAULT_SUBJECT): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}
