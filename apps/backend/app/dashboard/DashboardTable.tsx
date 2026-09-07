// DashboardTable.tsx: the recent-report workspace. Programme, date, and status
// filters plus a text search over the already-coarse proof list. This component
// never sees a full geohash, GPS point, or reporter identity and cannot add one.
// The row action opens the review page. Styling: globals.css tokens.

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProofSummary } from "../../lib/api";
import {
  activityLabel,
  programmeName,
  REVIEW_CLASS,
  REVIEW_LABEL,
  reviewStatus,
  type ReviewStatus,
} from "../../lib/dashboard";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const STATUSES: ReviewStatus[] = ["ready", "needs-another", "confirmed", "attention"];

export function DashboardTable({ proofs }: { proofs: ProofSummary[] }) {
  const programmeList = useMemo(
    () => [...new Set(proofs.map((p) => programmeName(p.taskId)))].sort(),
    [proofs],
  );

  const [programme, setProgramme] = useState("");
  const [status, setStatus] = useState<"" | ReviewStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      proofs.filter((p) => {
        if (programme && programmeName(p.taskId) !== programme) return false;
        if (status && reviewStatus(p) !== status) return false;
        const d = day(p.capturedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (q) {
          const hay = `${activityLabel(p.taskId)} ${p.taskId} ${p.geohashRegion}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [proofs, programme, status, from, to, q],
  );

  const active = programme || status || from || to || q;

  return (
    <>
      <div className="filters" role="search">
        <label>
          Programme
          <select className="field" value={programme} onChange={(e) => setProgramme(e.target.value)}>
            <option value="">All programmes</option>
            {programmeList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            className="field"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | ReviewStatus)}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {REVIEW_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <details className="more-filters">
          <summary>More filters</summary>
          <div className="filters" style={{ margin: "var(--sp-3) 0 0" }}>
            <label>
              Search
              <input
                className="field"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Activity or area"
              />
            </label>
            <label>
              From
              <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </details>
        {active ? (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setProgramme("");
              setStatus("");
              setFrom("");
              setTo("");
              setQ("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="muted" aria-live="polite">
        <strong style={{ color: "var(--text)" }}>{rows.length}</strong>{" "}
        {rows.length === 1 ? "report" : "reports"}
      </p>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Programme</th>
              <th>Approximate area</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const st = reviewStatus(p);
              return (
                <tr key={p.proofHash}>
                  <td>{activityLabel(p.taskId)}</td>
                  <td>{programmeName(p.taskId)}</td>
                  <td>
                    <code>{p.geohashRegion || "not recorded"}</code>
                  </td>
                  <td>{day(p.capturedAt)}</td>
                  <td>
                    <span className={`pill ${REVIEW_CLASS[st]}`}>
                      <span className="dot" aria-hidden />
                      {REVIEW_LABEL[st]}
                    </span>
                  </td>
                  <td>
                    <Link className="rowlink" href={`/dashboard/reports/${p.proofHash}`} aria-label={`Open ${activityLabel(p.taskId)}`}>
                      Open &rarr;
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No reports match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
