// CoverageMapInner.tsx: the browser-only Leaflet map. Draws ONE rectangle per distinct 5-char geohash
// cell shaded by report count — a choropleth, not a blurred point cloud, which would imply precision
// we do not have. The only points here are cell centres and bounds, never a reporter coordinate.

"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Popup, Rectangle, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { reportsHref, type CoverageCell } from "../../../lib/dashboard";

const FILL = "#C8533A";
const MIN_OPACITY = 0.15;

function cellBounds(c: CoverageCell): LatLngBoundsExpression {
  return [
    [c.bounds.minLat, c.bounds.minLng],
    [c.bounds.maxLat, c.bounds.maxLng],
  ];
}

function FitToCells({ cells }: { cells: CoverageCell[] }) {
  const map = useMap();
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // The map often mounts before its container has its final size (dynamic import +
    // CSS), which leaves the tile grid empty until a resize. Recalculate once, then fit.
    const t = setTimeout(() => {
      map.invalidateSize();
      if (cells.length > 0) {
        const bounds = cells.map((c) => [c.lat, c.lng]) as [number, number][];
        map.fitBounds(bounds as LatLngBoundsExpression, {
          padding: [32, 32],
          maxZoom: 12,
          animate: !reduce,
        });
      }
    }, 60);
    return () => clearTimeout(t);
  }, [cells, map]);
  return null;
}

export default function CoverageMapInner({ cells }: { cells: CoverageCell[] }) {
  const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 1);

  // Mount the Leaflet map only after the first commit, keyed by a fresh id. This keeps
  // React 18 StrictMode's dev double-mount from re-initialising Leaflet on the same DOM
  // node ("Map container is already initialized").
  const seq = useRef(0);
  const [mapKey, setMapKey] = useState<number | null>(null);
  useEffect(() => {
    seq.current += 1;
    setMapKey(seq.current);
    return () => setMapKey(null);
  }, []);

  if (mapKey === null) {
    return (
      <div className="cov-wrap">
        <div className="cov-map cov-map-loading" role="status">
          Loading map…
        </div>
      </div>
    );
  }

  return (
    <div className="cov-wrap">
      <div className="cov-map" key={mapKey}>
        <MapContainer
          center={[0, 20]}
          zoom={2}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {cells.map((c) => {
            const opacity = MIN_OPACITY + (1 - MIN_OPACITY) * (c.count / maxCount);
            return (
              <Rectangle
                key={c.region}
                bounds={cellBounds(c)}
                pathOptions={{
                  color: FILL,
                  weight: 1,
                  fillColor: FILL,
                  fillOpacity: opacity,
                }}
              >
                <Tooltip>
                  Approximate area {c.region} · {c.count}{" "}
                  {c.count === 1 ? "report" : "reports"} · {c.confirmed} confirmed
                </Tooltip>
                <Popup>
                  <div className="cov-pop">
                    <strong>Area {c.region}</strong>
                    <span>
                      {c.count} {c.count === 1 ? "report" : "reports"} · {c.confirmed} confirmed
                    </span>
                    <a href={reportsHref({ q: c.region })}>View reports in this area →</a>
                  </div>
                </Popup>
              </Rectangle>
            );
          })}
          <FitToCells cells={cells} />
        </MapContainer>
      </div>
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
        person. Darker means more reports fall in that zone. Click a zone to open its reports.
      </p>
    </div>
  );
}
