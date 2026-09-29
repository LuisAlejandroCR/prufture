// ui.tsx: small presentational pieces shared by every dashboard page: the page header (eyebrow,
// title with an optional serif accent, actions), metric tiles, the degraded-service notice and
// the status pill. Pure markup over already-coarse values; no data access here.

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../_components/brand";
import { REVIEW_CLASS, REVIEW_LABEL, type Alert, type ReviewStatus } from "../../lib/dashboard";

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
  href,
  trend,
}: {
  icon: IconName;
  value: number | string;
  label: string;
  hint?: string;
  tone?: "neutral" | "ok" | "wait" | "info" | "attn";
  /** When set, the whole tile opens this (usually pre-filtered) view. */
  href?: string;
  /** Week-over-week line. Neutral colour: more reports is not "good" or "bad" by itself. */
  trend?: { text: string; direction: "up" | "down" | "flat" };
}) {
  const body = (
    <>
      <span className="metric-icon">
        <Icon name={icon} />
      </span>
      <span className="n">{value}</span>
      <span className="k">{label}</span>
      {hint ? <span className="metric-hint">{hint}</span> : null}
      {trend ? (
        <span className={`metric-trend is-${trend.direction}`}>
          <span aria-hidden>{trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}</span> {trend.text}
        </span>
      ) : null}
      {href ? (
        <span className="metric-go" aria-hidden>
          <Icon name="arrow" size={16} />
        </span>
      ) : null}
    </>
  );
  return href ? (
    <Link className={`metric tone-${tone} is-link`} href={href}>
      {body}
    </Link>
  ) : (
    <div className={`metric tone-${tone}`}>{body}</div>
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

/** One actionable alert: what happened, why it matters, the next step and, when one exists, a
 *  link straight into the pre-filtered view where that step starts. */
export function AlertCard({ alert: a, showMeta = false }: { alert: Alert; showMeta?: boolean }) {
  return (
    <div className={`attn-item ${a.severity === "high" ? "high" : ""}`}>
      <span className="attn-icon">
        <Icon name={a.severity === "high" ? "alert" : a.id === "needs-second" ? "users" : "clock"} />
      </span>
      <div>
        <div className="attn-top">
          <h3>{a.what}</h3>
          {showMeta ? (
            <span className={`pill ${a.severity === "high" ? "attn" : "neutral"}`}>
              {a.severity === "high" ? "High priority" : "Normal"} · {a.when}
            </span>
          ) : null}
        </div>
        <p>{a.why}</p>
        <p className="attn-next">
          <strong>Next:</strong> {a.action}
        </p>
        {a.link ? (
          <Link className="attn-link" href={a.link.href}>
            {a.link.label} <Icon name="arrow" size={15} />
          </Link>
        ) : null}
      </div>
    </div>
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
