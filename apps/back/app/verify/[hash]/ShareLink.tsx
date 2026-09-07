// ShareLink.tsx: client control to copy the public verify URL.
// The URL carries only the proofHash — no volunteer identity, no media, no exact location —
// so it is safe to paste into WhatsApp, email or a chat.

"use client";

import { useState } from "react";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: "1 1 320px", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, font: "inherit" }}
      />
      <button
        type="button"
        onClick={copy}
        style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #333", background: copied ? "#1a7f37" : "#111", color: "#fff", cursor: "pointer" }}
      >
        {copied ? "Copied" : "Copy share link"}
      </button>
    </div>
  );
}
