// reports/page.tsx: the full-width report workspace — status tabs, filters, sorting and paging over
// the same coarse data as Overview. Filters arrive in the URL, so alerts, metric tiles and programme
// cards can deep-link to a pre-filtered view. Region level only, no personal data.

import { fetchProofs } from "../../../lib/api";
import { parseReportFilters } from "../../../lib/dashboard";
import { DashboardTable } from "../DashboardTable";
import { DegradedNotice, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ proofs, degraded }, sp] = await Promise.all([fetchProofs(), searchParams]);
  const initial = parseReportFilters({
    get: (k) => {
      const v = sp[k];
      return typeof v === "string" ? v : null;
    },
  });

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Reports"
        lede="Every report received. Filter by status, programme, area or date; the link keeps your view."
      />
      {degraded ? <DegradedNotice /> : null}
      <DashboardTable proofs={proofs} initial={initial} />
    </section>
  );
}
