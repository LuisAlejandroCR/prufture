// DashboardTable.tsx: client-side task-type and date-range filter over the aggregate proof list.
// Input is already region-level (geohash prefix only) — this component never sees a full
// geohash, GPS, or any volunteer identifier, and cannot reintroduce one.

"use client";

import { useMemo, useState } from "react";
import type { ProofSummary } from "../../lib/api";

const th = { textAlign: "left" as const, borderBottom: "2px solid #ddd", padding: "8px 4px" };
const td = { borderBottom: "1px solid #eee", padding: "8px 4px" };
const field = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, font: "inherit" };

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function DashboardTable({ proofs }: { proofs: ProofSummary[] }) {
  const taskTypes = useMemo(
    () => [...new Set(proofs.map((p) => p.taskId))].sort(),
    [proofs],
  );

  const [task, setTask] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(
    () =>
      proofs.filter((p) => {
        if (task && p.taskId !== task) return false;
        const d = day(p.capturedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [proofs, task, from, to],
  );

  const attestedCount = rows.filter((r) => r.attestationCount > 0).length;
  const totalAttestations = rows.reduce((n, r) => n + r.attestationCount, 0);

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", margin: "12px 0" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "#555" }}>Task type</span>
          <select style={field} value={task} onChange={(e) => setTask(e.target.value)}>
            <option value="">All tasks</option>
            {taskTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "#555" }}>From</span>
          <input type="date" style={field} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "#555" }}>To</span>
          <input type="date" style={field} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(task || from || to) && (
          <button
            type="button"
            style={{ ...field, cursor: "pointer" }}
            onClick={() => {
              setTask("");
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <p style={{ color: "#555" }}>
        {rows.length} proof{rows.length === 1 ? "" : "s"} · {attestedCount} attested ·{" "}
        {totalAttestations} attestation{totalAttestations === 1 ? "" : "s"} total
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Task</th>
            <th style={th}>Region</th>
            <th style={th}>Captured</th>
            <th style={th}>Attestations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.proofHash}>
              <td style={td}>{p.taskId}</td>
              <td style={td}>
                <code>{p.geohashRegion}</code>
              </td>
              <td style={td}>{day(p.capturedAt)}</td>
              <td style={td}>{p.attestationCount}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td style={td} colSpan={4}>
                No proofs match the filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
