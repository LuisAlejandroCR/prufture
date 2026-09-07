// DashboardTable.tsx: client-side task-type and date-range filter over the aggregate proof list.
// Input is already region-level (geohash prefix only) — this component never sees a full
// geohash, GPS, or any volunteer identifier, and cannot reintroduce one. Styling: globals.css tokens.

"use client";

import { useMemo, useState } from "react";
import type { ProofSummary } from "../../lib/api";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function DashboardTable({ proofs }: { proofs: ProofSummary[] }) {
  const taskTypes = useMemo(() => [...new Set(proofs.map((p) => p.taskId))].sort(), [proofs]);

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
      <div className="filters">
        <label>
          Task type
          <select className="field" value={task} onChange={(e) => setTask(e.target.value)}>
            <option value="">All tasks</option>
            {taskTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(task || from || to) && (
          <button
            type="button"
            className="btn secondary"
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

      <p className="muted" aria-live="polite">
        <strong style={{ color: "var(--text)" }}>{rows.length}</strong> proof
        {rows.length === 1 ? "" : "s"} · {attestedCount} attested · {totalAttestations} attestation
        {totalAttestations === 1 ? "" : "s"} total
      </p>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Task</th>
              <th>Region</th>
              <th>Captured</th>
              <th>Attestations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.proofHash}>
                <td>{p.taskId}</td>
                <td>
                  <code>{p.geohashRegion}</code>
                </td>
                <td>{day(p.capturedAt)}</td>
                <td>{p.attestationCount}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No proofs match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
