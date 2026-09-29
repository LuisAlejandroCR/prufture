// reports/page.tsx: the full-width report workspace — status tabs, filters and paging over the same
// coarse data as Overview. Region level only, no personal data.

import { fetchProofs } from "../../../lib/api";
import { DashboardTable } from "../DashboardTable";
import { DegradedNotice, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { proofs, degraded } = await fetchProofs();

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Reports"
        lede="Every report received, newest first. Filter by status, programme, area or date."
      />
      {degraded ? <DegradedNotice /> : null}
      <DashboardTable proofs={proofs} />
    </section>
  );
}
