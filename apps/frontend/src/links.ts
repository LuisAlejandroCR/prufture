// links.ts: builds the public pages the app links to (a report's public record, and the site's about,
// privacy and support pages) from the one configured verify base, and opens them in an in-app browser
// sheet (Safari View Controller / Custom Tabs) so the reporter never leaves Prufture. expo-web-browser
// loads lazily so node --test can import the URL builders.

import { color } from "./theme";

// `||`, not `??`: an empty EXPO_PUBLIC_VERIFY_URL (as in .env.example) must also fall back.
export const VERIFY_BASE = process.env.EXPO_PUBLIC_VERIFY_URL || "https://prufture.vercel.app/verify";

export function publicRecordUrl(proofHash: string, base = VERIFY_BASE): string {
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(proofHash)}`;
}

/** A page on the public site, on the same origin as the verify base. */
export function siteUrl(path: "" | "privacy" | "support", base = VERIFY_BASE): string {
  return new URL(`/${path}`, base).toString();
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|[\w-]+\.local)$/;

/** https anywhere, or http only on a local development host. */
export function isOpenable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && LOCAL_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Open a public page inside the app. Falls back to the system browser only if the in-app browser is
 * unavailable. Never throws.
 */
export async function openInApp(url: string): Promise<void> {
  if (!isOpenable(url)) return;
  try {
    const WebBrowser = await import("expo-web-browser");
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: color.background,
      controlsColor: color.primary,
      enableBarCollapsing: true,
      showTitle: true,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    try {
      const { Linking } = await import("react-native");
      await Linking.openURL(url);
    } catch {
      // Nothing else to do; the report itself is unaffected.
    }
  }
}
