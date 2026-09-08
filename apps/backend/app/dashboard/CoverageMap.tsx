// CoverageMap.tsx: client boundary for the coverage map. The Leaflet map touches
// `window` at module load, so the real map (./map/CoverageMapInner) is pulled in via
// next/dynamic with ssr:false. This file only forwards the already-coarse CoverageCell
// list — one 5-char cell per rectangle, never a reporter's position (that data does
// not exist on any public route).

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
