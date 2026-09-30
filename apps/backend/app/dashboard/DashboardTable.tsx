// DashboardTable.tsx: the report workspace — status tabs with counts, programme filter, search and
// date filters, and sortable columns over the already-coarse proof list, paged with "Show more".
// Filters live in the URL (?status=&programme=&q=&from=&to=&sort=), so a filtered view can be
// bookmarked, shared, or linked from an alert. `compact` renders the Overview variant: latest rows
// only, no filters. It never sees a full geohash, GPS point or reporter identity and cannot add one.

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProofSummary } from "../../lib/api";
import {
  activityLabel,
  applyReportFilters,
  byNewest,
  programmeName,
  relativeDay,
  reportsQuery,
  REVIEW_LABEL,
  REVIEW_ORDER,
  reviewStatus,
  type ReportFilters,
  type ReportSort,
  type ReviewStatus,
} from "../../lib/dashboard";
import { Icon } from "../_components/brand";
import { downloadCsv } from "./exports/ExportButton";
import { AreaChip, StatusPill } from "./ui";
import { placeLabel } from "../../lib/places";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const PAGE = 15;
const EMPTY: Required<ReportFilters> = { status: "", programme: "", area: "", q: "", from: "", to: "", sort: "newest" };

type SortColumn = "activity" | "submitted" | "status";

function SortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sort: ReportSort;
  onSort: (s: ReportSort) => void;
}) {
  const active =
    (column === "activity" && sort === "activity") ||
    (column === "status" && sort === "status") ||
    (column === "submitted" && (sort === "newest" || sort === "oldest"));
  const ariaSort = !active
    ? "none"
    : column === "submitted"
      ? sort === "oldest"
        ? "ascending"
        : "descending"
      : "ascending";
  const next: ReportSort =
    column === "submitted" ? (sort === "newest" ? "oldest" : "newest") : column === "activity" ? "activity" : "status";
  return (
    <th aria-sort={ariaSort}>
      <button type="button" className={`th-sort ${active ? "is-active" : ""}`} onClick={() => onSort(next)}>
        {label}
        <span className="th-sort-icon" aria-hidden>
          {active ? (ariaSort === "descending" ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function DashboardTable({
  proofs,
  compact = false,
  initial = EMPTY,
}: {
  proofs: ProofSummary[];
  compact?: boolean;
  initial?: Required<ReportFilters>;
}) {
  const programmeList = useMemo(
    () => [...new Set(proofs.map((p) => programmeName(p.taskId)))].sort(),
    [proofs],
  );
  // Areas by report count, named when a listed city is near ("Near Bogotá · d2g62").
  const areaList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of proofs) if (p.geohashRegion) counts.set(p.geohashRegion, (counts.get(p.geohashRegion) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([region]) => ({ region, label: placeLabel(region) ? `${placeLabel(region)} · ${region}` : region }));
  }, [proofs]);
  const statusCounts = useMemo(() => {
    const m = new Map<ReviewStatus, number>();
    for (const p of proofs) m.set(reviewStatus(p), (m.get(reviewStatus(p)) ?? 0) + 1);
    return m;
  }, [proofs]);

  const [f, setF] = useState<Required<ReportFilters>>(initial);
  const [shown, setShown] = useState(PAGE);
  const search = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<ReportFilters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setShown(PAGE);
  };

  // Mirror filters into the URL without a navigation, so the server page is not re-fetched.
  useEffect(() => {
    if (compact) return;
    const next = `${window.location.pathname}${reportsQuery(f)}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [f, compact]);

  // "/" focuses search, as in most workspaces; ignored while typing in a field.
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  const rows = useMemo(() => (compact ? byNewest(proofs) : applyReportFilters(proofs, f)), [proofs, f, compact]);
  // Row links carry the view, so the review page can offer Back / Previous / Next inside it.
  const viewQuery = compact ? "" : reportsQuery(f);

  const active = Boolean(f.programme || f.area || f.status || f.from || f.to || f.q);
  const limit = compact ? 6 : shown;
  const visible = rows.slice(0, limit);
  const reset = () => update({ status: "", programme: "", area: "", q: "", from: "", to: "" });

  return (
    <div className="workspace">
      {compact ? null : (
        <>
          <div className="tabs" role="group" aria-label="Filter by status">
            <button type="button" className="tab" aria-pressed={f.status === ""} onClick={() => update({ status: "" })}>
              All <span className="tab-count">{proofs.length}</span>
            </button>
            {REVIEW_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className="tab"
                aria-pressed={f.status === s}
                onClick={() => update({ status: f.status === s ? "" : s })}
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
                ref={search}
                className="field"
                type="search"
                value={f.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search activity or area"
              />
              <kbd className="kbd-hint" aria-hidden>
                /
              </kbd>
            </label>
            <label>
              Programme
              <select className="field" value={f.programme} onChange={(e) => update({ programme: e.target.value })}>
                <option value="">All programmes</option>
                {programmeList.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Area
              <select className="field" value={f.area} onChange={(e) => update({ area: e.target.value })}>
                <option value="">All areas</option>
                {/* A linked area missing from the data still shows, so the select never lies about the filter. */}
                {f.area && !areaList.some((a) => a.region === f.area) ? <option value={f.area}>{f.area}</option> : null}
                {areaList.map((a) => (
                  <option key={a.region} value={a.region}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input type="date" className="field" value={f.from} max={f.to || undefined} onChange={(e) => update({ from: e.target.value })} />
            </label>
            <label>
              To
              <input type="date" className="field" value={f.to} min={f.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            </label>
            {active ? (
              <button type="button" className="btn secondary small" onClick={reset}>
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="result-bar">
            <p className="result-count" aria-live="polite">
              Showing <strong>{visible.length}</strong> of <strong>{rows.length}</strong>{" "}
              {rows.length === 1 ? "report" : "reports"}
              {active ? " matching these filters" : ""}
            </p>
            <button
              type="button"
              className="btn secondary small"
              disabled={rows.length === 0}
              onClick={() => downloadCsv(rows, active ? "-filtered" : "")}
            >
              <Icon name="export" size={15} /> Download {active ? "this view" : "all"} (CSV)
            </button>
          </div>
        </>
      )}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              {compact ? (
                <>
                  <th>Activity</th>
                  <th>Approximate area</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </>
              ) : (
                <>
                  <SortHeader column="activity" label="Activity" sort={f.sort} onSort={(sort) => update({ sort })} />
                  <th>Approximate area</th>
                  <SortHeader column="submitted" label="Submitted" sort={f.sort} onSort={(sort) => update({ sort })} />
                  <SortHeader column="status" label="Status" sort={f.sort} onSort={(sort) => update({ sort })} />
                </>
              )}
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
                    <AreaChip region={p.geohashRegion} />
                  </td>
                  <td>
                    <span className="cell-date">
                      {relativeDay(p.capturedAt) || "not recorded"}
                      {/* Past two weeks relativeDay already is the date; don't print it twice. */}
                      {relativeDay(p.capturedAt) !== day(p.capturedAt) ? <small>{day(p.capturedAt)}</small> : null}
                    </span>
                  </td>
                  <td>
                    <StatusPill status={reviewStatus(p)} />
                  </td>
                  <td>
                    <Link className="rowlink" href={`/dashboard/reports/${p.proofHash}${viewQuery}`} aria-label={`Open ${label}`}>
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
