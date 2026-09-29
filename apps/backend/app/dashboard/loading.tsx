// loading.tsx: skeleton for every /dashboard route while the server fetches the coarse proof list,
// so a slow index shows the page's shape instead of a blank main area. Static markup only.

export default function DashboardLoading() {
  return (
    <section className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">Loading reports…</span>
      <div className="sk sk-eyebrow" />
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="metrics">
        {[0, 1, 2, 3].map((i) => (
          <div className="metric" key={i}>
            <div className="sk sk-icon" />
            <div className="sk sk-number" />
            <div className="sk sk-line short" />
          </div>
        ))}
      </div>
      <div className="dash-grid">
        <div className="box">
          <div className="sk sk-line short" />
          <div className="sk sk-block" />
        </div>
        <div className="box">
          <div className="sk sk-line short" />
          <div className="sk sk-block" />
        </div>
      </div>
    </section>
  );
}
