// map/page.tsx: /dashboard/map server component — fetches the coarse proof list, aggregates it into
// one cell per 5-char geohash region and hands the cells to the client map. No precise location
// exists on this route; zones are approximate (~2.4 km), never a reporter's position.

import { fetchProofs } from "../../../lib/api";
import { coverage, reportsHref } from "../../../lib/dashboard";
import { CoverageMap } from "../CoverageMap";
import { RowLink } from "../RowLink";
import { AreaChip, DegradedNotice, EmptyState, Metric, PageHeader } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coverage map" };

export default async function CoverageMapPage() {
  const { proofs, degraded } = await fetchProofs();
  const cells = coverage(proofs);
  const totalReports = cells.reduce((n, c) => n + c.count, 0);
  const totalConfirmed = cells.reduce((n, c) => n + c.confirmed, 0);

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Insights"
        title="Coverage"
        accent="map"
        lede="Where reports are coming from, by approximate zone. Exact locations of households, schools, or people are never recorded or shown."
      />

      {degraded ? <DegradedNotice /> : null}

      {cells.length === 0 ? (
        <EmptyState icon="map" title="No reports have been placed on the map yet" />
      ) : (
        <>
          <div className="metrics metrics-3">
            <Metric icon="pin" value={cells.length} label={cells.length === 1 ? "Zone" : "Zones"} href="#zones" />
            <Metric
              icon="inbox"
              value={totalReports}
              label={totalReports === 1 ? "Report" : "Reports"}
              href={reportsHref()}
            />
            <Metric
              icon="check"
              value={totalConfirmed}
              label="Confirmed"
              tone="ok"
              href={reportsHref({ status: "confirmed" })}
            />
          </div>
          <div className="box box-flush">
            <CoverageMap cells={cells} />
          </div>
          <div className="section-head" id="zones">
            <h2>Zones by report count</h2>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Approximate zone</th>
                  <th>Reports</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => (
                  <RowLink key={c.region} href={reportsHref({ area: c.region })}>
                    <td>
                      <AreaChip region={c.region} href={reportsHref({ area: c.region })} />
                    </td>
                    <td>{c.count}</td>
                    <td>{c.confirmed}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
