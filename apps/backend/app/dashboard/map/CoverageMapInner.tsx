// CoverageMapInner.tsx: the browser-only Leaflet map. Draws ONE rectangle per distinct 5-char geohash
// cell shaded by report count — a choropleth, not a blurred point cloud, which would imply precision
// we do not have. The only points here are cell centres and bounds, never a reporter coordinate.
// Leaflet is driven directly from one effect (create on mount, map.remove() on cleanup) rather than
// through react-leaflet's MapContainer: the App Router runs React 19, whose dev StrictMode re-runs
// ref callbacks and made MapContainer initialise Leaflet twice on one node ("Map container is
// already initialized"). An effect with a real cleanup is safe under any number of re-mounts.

"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { reportsHref, type CoverageCell } from "../../../lib/dashboard";
import { placeLabel } from "../../../lib/places";

const FILL = "#C8533A";
const MIN_OPACITY = 0.15;

function countLabel(n: number): string {
  return `${n} ${n === 1 ? "report" : "reports"}`;
}

/** "Near Bogotá (d2g62)" when the cell is near a listed city, else "Area d2g62". */
function areaName(region: string): string {
  const place = placeLabel(region);
  return place ? `${place} (${region})` : `Area ${region}`;
}

/** Popup body built from DOM nodes with textContent, so no cell value is ever parsed as HTML. */
function popupNode(c: CoverageCell): HTMLElement {
  const root = document.createElement("div");
  root.className = "cov-pop";
  const title = document.createElement("strong");
  title.textContent = areaName(c.region);
  const meta = document.createElement("span");
  meta.textContent = `${countLabel(c.count)} · ${c.confirmed} confirmed`;
  const link = document.createElement("a");
  link.href = reportsHref({ q: c.region });
  link.textContent = "View reports in this area →";
  root.append(title, meta, link);
  return root;
}

export default function CoverageMapInner({ cells }: { cells: CoverageCell[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    // Leaflet touches `window` at import time, so it is loaded here, in the browser only.
    void import("leaflet").then((mod) => {
      if (cancelled) return;
      // Leaflet ships UMD; depending on interop the API is the namespace or its default export.
      const L = mod.default ?? mod;
      const map = L.map(node, { center: [0, 20], zoom: 2, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 1);
      for (const c of cells) {
        const opacity = MIN_OPACITY + (1 - MIN_OPACITY) * (c.count / maxCount);
        L.rectangle(
          [
            [c.bounds.minLat, c.bounds.minLng],
            [c.bounds.maxLat, c.bounds.maxLng],
          ],
          { color: FILL, weight: 1, fillColor: FILL, fillOpacity: opacity },
        )
          .bindTooltip(`${areaName(c.region)} · ${countLabel(c.count)} · ${c.confirmed} confirmed`)
          .bindPopup(popupNode(c))
          .addTo(map);
      }

      // The container often has its final size only after layout (dynamic import + CSS), which
      // leaves the tile grid empty until a resize. Recalculate once, then fit to the cells.
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const t = window.setTimeout(() => {
        map.invalidateSize();
        if (cells.length > 0) {
          map.fitBounds(
            cells.map((c) => [c.lat, c.lng] as [number, number]),
            { padding: [32, 32], maxZoom: 12, animate: !reduce },
          );
        }
      }, 60);

      cleanup = () => {
        window.clearTimeout(t);
        map.remove();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [cells]);

  return (
    <div className="cov-wrap">
      <div className="cov-map" ref={container} role="region" aria-label="Coverage map of approximate zones" />
      <div className="cov-legend" aria-hidden="true">
        <span className="cov-legend-label">Fewer reports</span>
        <span className="cov-legend-swatch" style={{ background: FILL, opacity: MIN_OPACITY }} />
        <span className="cov-legend-swatch" style={{ background: FILL, opacity: 0.45 }} />
        <span className="cov-legend-swatch" style={{ background: FILL, opacity: 0.7 }} />
        <span className="cov-legend-swatch" style={{ background: FILL, opacity: 1 }} />
        <span className="cov-legend-label">More reports</span>
      </div>
      <p className="muted cov-note">
        Each shaded square is an approximate zone about 2.4 km across, not the location of any
        person. Darker means more reports fall in that zone. Click a zone to open its reports. The
        table below lists the same zones.
      </p>
    </div>
  );
}
