// ExportButton.tsx: builds the coarse CSV in the browser from data that is already
// region-level. It cannot reach a full geohash, GPS point, or reporter identity.
//
// Cells are built with csvCell from @proof/core, the SAME helper the api's coordinator export
// uses. The activity column derives from taskId, which comes from a reporter's signed payload
// and is therefore untrusted — quoting alone would not stop a spreadsheet evaluating it as a
// formula. Sharing the helper is what keeps this exporter and the api's from drifting apart.

"use client";

import { csvCell } from "@proof/core";
import type { ProofSummary } from "../../../lib/api";
import { activityLabel, programmeName, REVIEW_LABEL, reviewStatus } from "../../../lib/dashboard";

/** Exported for tests: the exact CSV the download button produces. */
export function csv(proofs: ProofSummary[]): string {
  const head = ["activity", "programme", "approximate_region", "captured_date", "review_status", "confirmations"];
  const lines = proofs.map((p) => {
    const d = new Date(p.capturedAt);
    return [
      activityLabel(p.taskId),
      programmeName(p.taskId),
      p.geohashRegion || "",
      Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10),
      REVIEW_LABEL[reviewStatus(p)],
      String(p.attestationCount),
    ]
      .map(csvCell)
      .join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

export function ExportButton({ proofs }: { proofs: ProofSummary[] }) {
  const download = () => {
    const blob = new Blob([csv(proofs)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prufture-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" className="btn" onClick={download} disabled={proofs.length === 0}>
      {proofs.length === 0 ? "No reports to export" : `Download ${proofs.length} rows`}
    </button>
  );
}
