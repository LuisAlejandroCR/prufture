// communities/page.tsx: geographic coverage by coarse region, with aggregate counts and the regions
// that still need a second community report; each region links to its reports. Never a household,
// school or beneficiary coordinate.

import Link from "next/link";
import { fetchProofs } from "../../../lib/api";
import { areas, reportsHref } from "../../../lib/dashboard";
import { Icon } from "../../_components/brand";
import { DegradedNotice, EmptyState, Metric, Notice, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const { proofs, degraded } = await fetchProofs();
  const rows = areas(proofs);
  const gaps = rows.filter((r) => r.needsAnother > 0);
  const max = rows.reduce((n, r) => Math.max(n, r.received), 1);
  const fullyConfirmed = rows.filter((r) => r.received > 0 && r.confirmed === r.received).length;

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Insights"
        title="Communities"
        accent="and areas"
        lede="Coverage by approximate region. Exact locations of households, schools, or people are never shown."
        actions={
          <Link className="btn secondary" href="/dashboard/map">
            <Icon name="map" size={16} /> View on map
          </Link>
        }
      />

      {degraded ? (
        <DegradedNotice />
      ) : rows.length === 0 ? (
        <EmptyState icon="communities" title="No regions have reported yet" />
      ) : (
        <>
          <div className="metrics metrics-3">
            <Metric icon="pin" value={rows.length} label="Approximate regions" />
            <Metric icon="check" value={fullyConfirmed} label="Fully confirmed" tone="ok" />
            <Metric icon="users" value={gaps.length} label="Need a second report" tone="wait" />
          </div>
          {gaps.length > 0 ? (
            <Notice tone="info" title={`${gaps.length} ${gaps.length === 1 ? "region needs" : "regions need"} a second community report`}>
              Ask another community member in the area to report the same activity.
            </Notice>
          ) : null}
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Approximate region</th>
                  <th>Reports</th>
                  <th>Confirmed</th>
                  <th>Needs another report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.region}>
                    <td>
                      {r.region === "(none)" ? (
                        <span className="area-chip">
                          <Icon name="pin" size={14} />
                          <code>not recorded</code>
                        </span>
                      ) : (
                        <Link className="area-chip is-link" href={reportsHref({ q: r.region })} aria-label={`Reports in area ${r.region}`}>
                          <Icon name="pin" size={14} />
                          <code>{r.region}</code>
                        </Link>
                      )}
                    </td>
                    <td>
                      <span className="inline-bar">
                        <span className="inline-bar-track">
                          <span style={{ width: `${(r.received / max) * 100}%` }} />
                        </span>
                        <strong>{r.received}</strong>
                      </span>
                    </td>
                    <td>{r.confirmed}</td>
                    <td>
                      {r.needsAnother > 0 && r.region !== "(none)" ? (
                        <Link
                          className="pill wait is-link"
                          href={reportsHref({ q: r.region, status: "needs-another" })}
                          aria-label={`${r.needsAnother} in ${r.region} need another report`}
                        >
                          <span className="dot" aria-hidden />
                          {r.needsAnother}
                        </Link>
                      ) : (
                        <span className="faint">{r.needsAnother}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
