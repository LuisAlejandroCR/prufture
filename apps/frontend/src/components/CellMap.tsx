// CellMap.tsx: map of approximate 5-char cells drawn as shaded rectangles — never a pin at a precise
// point. Used for the reporter's own area and for nearby assignments. Offline it shows a plain text
// card instead, because map tiles need signal.

import NetInfo from "@react-native-community/netinfo";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polygon, type Region } from "react-native-maps";
import { decodeGeohashBounds } from "../geohash";
import { cellCentre } from "../tasks";
import { color, radius, space, type } from "../theme";
import { Icon } from "./icons/Icon";

export interface MapCell {
  key: string;
  cell: string;
  /** Marker title at the cell centre; omit for the reporter's own area (rectangle only). */
  title?: string;
  subtitle?: string;
  tone?: "self" | "task";
  onPress?: () => void;
}

function cellPolygon(cell: string) {
  const b = decodeGeohashBounds(cell);
  return [
    { latitude: b.latMin, longitude: b.lngMin },
    { latitude: b.latMin, longitude: b.lngMax },
    { latitude: b.latMax, longitude: b.lngMax },
    { latitude: b.latMax, longitude: b.lngMin },
  ];
}

/** Region that fits every cell with a margin; a single cell gets a district-sized view. */
export function regionForCells(cells: string[]): Region | undefined {
  if (cells.length === 0) return undefined;
  const boxes = cells.map(decodeGeohashBounds);
  const latMin = Math.min(...boxes.map((b) => b.latMin));
  const latMax = Math.max(...boxes.map((b) => b.latMax));
  const lngMin = Math.min(...boxes.map((b) => b.lngMin));
  const lngMax = Math.max(...boxes.map((b) => b.lngMax));
  return {
    latitude: (latMin + latMax) / 2,
    longitude: (lngMin + lngMax) / 2,
    latitudeDelta: Math.max((latMax - latMin) * 1.6, 0.12),
    longitudeDelta: Math.max((lngMax - lngMin) * 1.6, 0.12),
  };
}

export function CellMap({
  cells,
  height = 220,
  offlineLabel,
}: {
  cells: MapCell[];
  height?: number;
  /** Text shown instead of the map with no signal. */
  offlineLabel: string;
}) {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        // isInternetReachable is null before the first probe; only a definite false means offline.
        setOnline(s.isConnected !== false && s.isInternetReachable !== false);
      }),
    [],
  );
  const region = useMemo(() => regionForCells(cells.map((c) => c.cell)), [cells]);

  if (!online || !region) {
    return (
      <View style={[styles.offline, { minHeight: height / 2 }]} accessibilityRole="text">
        <Icon name="location" size={22} color={color.muted} />
        <Text style={styles.offlineText}>{offlineLabel}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        accessibilityLabel={offlineLabel}
      >
        {cells.map((c) => {
          const self = c.tone === "self";
          return (
            <Polygon
              key={`${c.key}-area`}
              coordinates={cellPolygon(c.cell)}
              strokeColor={self ? color.success : color.primary}
              fillColor={self ? color.successSoft : color.primarySoft}
              strokeWidth={2}
              tappable={!!c.onPress}
              onPress={c.onPress}
            />
          );
        })}
        {cells
          .filter((c) => c.title)
          .map((c) => {
            return (
              <Marker
                key={`${c.key}-pin`}
                coordinate={cellCentre(c.cell)}
                title={c.title}
                description={c.subtitle}
                pinColor={color.primary}
                onCalloutPress={c.onPress}
              />
            );
          })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: "stretch", borderRadius: radius.lg, overflow: "hidden", backgroundColor: color.surface },
  offline: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  offlineText: { ...type.body, color: color.muted, flex: 1 },
});
