// page.tsx: /dashboard/programmes/[id]/enrolment. Shows the programme's personhood group (size,
// current epoch, current root; never the commitment list), a form to enrol one commitment and a
// "Start new round" button. Writes go through the entitlement-gated coordinator API; every
// degraded answer (unreachable, 402, 503, not configured) is shown as what it is.

import Link from "next/link";
import { actionNotice, fetchGroup, isActionState, isProgrammeId } from "../../../../../lib/enrolment";
import { Icon } from "../../../../_components/brand";
import { EmptyState, Metric, Notice, PageHeader } from "../../../ui";
import { EnrolForm } from "./EnrolForm";
import { NewRoundForm } from "./NewRoundForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enrolment" };

type Search = Record<string, string | string[] | undefined>;

export default async function EnrolmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const programmeId = decodeURIComponent(id);

  if (!isProgrammeId(programmeId)) {
    return (
      <section className="fade-in">
        <PageHeader eyebrow="Programmes" title="Enrolment" />
        <EmptyState icon="alert" title="That is not a valid programme id">
          Programme ids use lowercase letters, digits and dashes.{" "}
          <Link href="/dashboard/programmes">Back to programmes</Link>
        </EmptyState>
      </section>
    );
  }

  const result = await fetchGroup(programmeId);
  const notice = isActionState(sp.result) ? actionNotice(sp.result) : null;

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Programmes"
        title="Enrolment"
        accent={programmeId}
        lede="Add participants to this programme's group so their reports can carry a proof of membership."
        actions={
          <Link className="btn secondary" href="/dashboard/programmes">
            All programmes <Icon name="arrow" size={15} />
          </Link>
        }
      />

      <Notice tone="info" title="The coordinator knows who they enrolled">
        Enrolment happens in person: you meet the participant and add the commitment shown on their device.
        You therefore know who you enrolled. What the group hides is which enrolled participant sent a given
        report, not who is in the group. Nothing about the person is stored here, only the commitment.
      </Notice>

      {notice ? (
        <Notice tone={notice.tone} title={notice.title}>
          {notice.text}
        </Notice>
      ) : null}

      {result.state === "unreachable" ? (
        <Notice title="The enrolment service is unreachable">
          The group could not be loaded, so size, round and root are unknown right now. This is a service
          problem, not an empty group.
        </Notice>
      ) : result.state === "invalid" ? (
        <Notice tone="attn" title="The api rejected this programme id" />
      ) : result.state === "empty" ? (
        <EmptyState icon="layers" title="Nobody is enrolled yet">
          The group is created with the first enrolment below.
        </EmptyState>
      ) : (
        <div className="metrics metrics-3">
          <Metric icon="users" value={result.group.size} label="Enrolled participants" />
          <Metric icon="clock" value={result.group.epoch} label="Current round" />
          <div className="metric tone-neutral">
            <span className="k">Current root</span>
            <code className="mono" style={{ wordBreak: "break-all" }}>
              {result.group.root ?? "none"}
            </code>
          </div>
        </div>
      )}

      <div className="card-grid">
        <article className="prog-card">
          <h2>Enrol one participant</h2>
          <EnrolForm programmeId={programmeId} />
        </article>

        <article className="prog-card">
          <h2>Start new round</h2>
          <p className="muted">
            A new round lets every enrolled participant submit once more per task. Reports already
            verified keep their result. Reports from different rounds never confirm each other, since
            they may come from the same person. A new round cannot be undone.
          </p>
          <NewRoundForm programmeId={programmeId} disabled={result.state !== "ok"} />
        </article>
      </div>
    </section>
  );
}
