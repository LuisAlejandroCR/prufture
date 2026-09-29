// DashboardTable.tsx: the report workspace — status tabs with counts, programme filter, and
// search/date filters over the already-coarse proof list, newest first, paged with "Show more".
// `compact` renders the Overview variant: latest rows only, no filters. The row action opens the
// review page. It never sees a full geohash, GPS point or reporter identity and cannot add one.

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProofSummary } from "../../lib/api";
import {
  activityLabel,
  byNewest,
  programmeName,
  relativeDay,
  REVIEW_LABEL,
  REVIEW_ORDER,
  reviewStatus,
  type ReviewStatus,
} from "../../lib/dashboard";
import { Icon } from "../_components/brand";
import { StatusPill } from "./ui";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const PAGE = 15;

export function DashboardTable({ proofs, compact = false }: { proofs: ProofSummary[]; compact?: boolean }) {
  const sorted = useMemo(() => byNewest(proofs), [proofs]);
  const programmeList = useMemo(
    () => [...new Set(proofs.map((p) => programmeName(p.taskId)))].sort(),
    [proofs],
  );
  const statusCounts = useMemo(() => {
    const m = new Map<ReviewStatus, number>();
    for (const p of proofs) m.set(reviewStatus(p), (m.get(reviewStatus(p)) ?? 0) + 1);
    return m;
  }, [proofs]);

  const [programme, setProgramme] = useState("");
  const [status, setStatus] = useState<"" | ReviewStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () =>
      sorted.filter((p) => {
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
    [sorted, programme, status, from, to, q],
  );

  const active = programme || status || from || to || q;
  const limit = compact ? 6 : shown;
  const visible = rows.slice(0, limit);
  const reset = () => {
    setProgramme("");
    setStatus("");
    setFrom("");
    setTo("");
    setQ("");
    setShown(PAGE);
  };

  return (
    <div className="workspace">
      {compact ? null : (
        <>
          <div className="tabs" role="group" aria-label="Filter by status">
            <button type="button" className="tab" aria-pressed={status === ""} onClick={() => setStatus("")}>
              All <span className="tab-count">{proofs.length}</span>
            </button>
            {REVIEW_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className="tab"
                aria-pressed={status === s}
                onClick={() => {
                  setStatus(status === s ? "" : s);
                  setShown(PAGE);
                }}
              >
                {REVIEW_LABEL[s]} <span className="tab-count">{statusCounts.get(s) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="filters" role="search">
            <label className="filter-search">
              <span className="sr-only">Search</span>
              <Icon name="search" />
              <input
                className="field"
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search activity or area"
              />
            </label>
            <label>
              Programme
              <select
                className="field"
                value={programme}
                onChange={(e) => {
                  setProgramme(e.target.value);
                  setShown(PAGE);
                }}
              >
                <option value="">All programmes</option>
                {programmeList.map((p) => (
                  <option key={p} value={p}>
                    {p}
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
            {active ? (
              <button type="button" className="btn secondary small" onClick={reset}>
                Clear filters
              </button>
            ) : null}
          </div>

          <p className="result-count" aria-live="polite">
            Showing <strong>{visible.length}</strong> of <strong>{rows.length}</strong>{" "}
            {rows.length === 1 ? "report" : "reports"}
            {active ? " matching these filters" : ""}
          </p>
        </>
      )}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Approximate area</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const label = activityLabel(p.taskId);
              return (
                <tr key={p.proofHash}>
                  <td>
                    <div className="cell-activity">
                      <span className="activity-avatar" aria-hidden>
                        {label.charAt(0)}
                      </span>
                      <span>
                        <strong>{label}</strong>
                        <small>{programmeName(p.taskId)}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="area-chip">
                      <Icon name="pin" size={14} />
                      <code>{p.geohashRegion || "not recorded"}</code>
                    </span>
                  </td>
                  <td>
                    <span className="cell-date">
                      {relativeDay(p.capturedAt)}
                      <small>{day(p.capturedAt)}</small>
                    </span>
                  </td>
                  <td>
                    <StatusPill status={reviewStatus(p)} />
                  </td>
                  <td>
                    <Link className="rowlink" href={`/dashboard/reports/${p.proofHash}`} aria-label={`Open ${label}`}>
                      Open <Icon name="arrow" size={15} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-empty">
                  {proofs.length === 0 ? "No reports have been received yet." : "No reports match these filters."}
                  {active ? (
                    <>
                      {" "}
                      <button type="button" className="linkish" onClick={reset}>
                        Clear filters
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {compact ? (
        rows.length > limit ? (
          <Link className="table-more" href="/dashboard/reports">
            View all {rows.length} reports <Icon name="arrow" size={15} />
          </Link>
        ) : null
      ) : rows.length > shown ? (
        <button type="button" className="btn secondary table-more-btn" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, rows.length - shown)} more
        </button>
      ) : null}
    </div>
  );
}
