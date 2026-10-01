// exports/page.tsx: programme review exports — only supported behaviour is offered, explained before
// download. Exports exclude PII, exact coordinates, private media links, secrets and internal
// thresholds; the one real export is the coarse aggregate the dashboard already shows.

import { ExportButton } from "./ExportButton";
import { fetchProofs } from "../../../lib/api";
import { Icon } from "../../_components/brand";
import { Notice, PageHeader } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exports" };

export default async function ExportsPage() {
  const { proofs, degraded } = await fetchProofs();

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Admin"
        title="Exports"
        lede="Download the coarse aggregate for offline programme review."
      />

      <div className="card-grid card-grid-2">
        <article className="box option-card">
          <span className="option-icon">
            <Icon name="file" size={22} />
          </span>
          <h3>Coarse report list (CSV)</h3>
          <p className="muted">
            One row per report: activity, programme, approximate region, capture date, review status,
            and whether it is anchored as a public record.
          </p>
          <p className="faint" style={{ fontSize: "0.9rem" }}>
            Excluded: reporter identity, exact location, full reference, photos, and any internal
            scoring.
          </p>
          {degraded ? (
            <Notice title="Nothing to export">The report index is unreachable right now.</Notice>
          ) : (
            <ExportButton proofs={proofs} />
          )}
        </article>

        <article className="box option-card is-muted">
          <span className="option-icon">
            <Icon name="shield" size={22} />
          </span>
          <h3>
            Signed evidence bundle <span className="pill neutral">Planned</span>
          </h3>
          <p className="muted">
            A per-report evidence package is a planned feature. Today, a coordinator exports the inbox
            as CSV and opens sealed evidence photos from the coordinator inbox in the Prufture app.
          </p>
        </article>
      </div>
    </section>
  );
}
