// ui.tsx: small presentational pieces shared by every dashboard page: the page header (eyebrow,
// title with an optional serif accent, actions), metric tiles, the degraded-service notice and
// the status pill. Pure markup over already-coarse values; no data access here.

import type { ReactNode } from "react";
import { Icon, type IconName } from "../_components/brand";
import { REVIEW_CLASS, REVIEW_LABEL, type ReviewStatus } from "../../lib/dashboard";

export function PageHeader({
  eyebrow,
  title,
  accent,
  lede,
  actions,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="dash-head">
      <div>
        <p className="dash-eyebrow">{eyebrow}</p>
        <h1>
          {title}
          {accent ? (
            <>
              {" "}
              <em>{accent}</em>
            </>
          ) : null}
        </h1>
        {lede ? <p className="dash-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="dash-head-actions">{actions}</div> : null}
    </header>
  );
}

export function Metric({
  icon,
  value,
  label,
  hint,
  tone = "neutral",
}: {
  icon: IconName;
  value: number | string;
  label: string;
  hint?: string;
  tone?: "neutral" | "ok" | "wait" | "info" | "attn";
}) {
  return (
    <div className={`metric tone-${tone}`}>
      <span className="metric-icon">
        <Icon name={icon} />
      </span>
      <span className="n">{value}</span>
      <span className="k">{label}</span>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  );
}

export function Notice({
  tone = "wait",
  title,
  children,
}: {
  tone?: "wait" | "info" | "attn" | "ok";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`} role="status">
      <span className="notice-icon">
        <Icon name={tone === "ok" ? "check" : tone === "info" ? "help" : "alert"} />
      </span>
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

export function DegradedNotice() {
  return (
    <Notice title="The report index is unreachable right now">
      Figures show what was last available. This is a service degradation, not an empty programme.
    </Notice>
  );
}

export function StatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span className={`pill ${REVIEW_CLASS[status]}`}>
      <span className="dot" aria-hidden />
      {REVIEW_LABEL[status]}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
