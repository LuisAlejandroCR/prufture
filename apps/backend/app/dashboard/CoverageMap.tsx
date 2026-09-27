// CoverageMap.tsx: client boundary for the coverage map. Leaflet touches `window` at module load,
// so ./map/CoverageMapInner is loaded via next/dynamic with ssr:false. Forwards only the coarse
// CoverageCell list — one 5-char cell per rectangle, never a reporter's position.

"use client";

import dynamic from "next/dynamic";
import type { CoverageCell } from "../../lib/dashboard";

const CoverageMapInner = dynamic(() => import("./map/CoverageMapInner"), {
  ssr: false,
  loading: () => (
    <div className="cov-map cov-map-loading" role="status">
      Loading map…
    </div>
  ),
});

export function CoverageMap({ cells }: { cells: CoverageCell[] }) {
  return <CoverageMapInner cells={cells} />;
}
