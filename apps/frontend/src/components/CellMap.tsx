// CellMap.tsx: map of approximate 5-char cells drawn as shaded rectangles. Opens at city zoom on the
// reporter's area (src/map-region.ts) without pins: even a cell-centre marker implies precision the
// data does not have. Offline it shows a plain text card because map tiles need signal.

import NetInfo from "@react-native-community/netinfo";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Polygon } from "react-native-maps";
import { decodeGeohashBounds } from "../geohash";
import { mapRegion } from "../map-region";
import { color, radius, space, type } from "../theme";
import { Icon } from "./icons/Icon";

export interface MapCell {
  key: string;
  cell: string;
  /** Task title, used only for the accessible summary; no marker is drawn. */
  title?: string;
  subtitle?: string;
  tone?: "self" | "task";
  onPress?: () => void;
}

type Point = { latitude: number; longitude: number };

function cellPolygon(cell: string) {
  const b = decodeGeohashBounds(cell);
  return [
    { latitude: b.latMin, longitude: b.lngMin },
    { latitude: b.latMin, longitude: b.lngMax },
    { latitude: b.latMax, longitude: b.lngMax },
    { latitude: b.latMax, longitude: b.lngMin },
  ];
}

export function CellMap({
  cells,
  height = 220,
  offlineLabel,
  caption,
  focusCell = null,
  cityCentre = null,
}: {
  cells: MapCell[];
  height?: number;
  /** Text shown instead of the map with no signal. */
  offlineLabel: string;
  /** Small chip over the map's top-right corner, e.g. the approximate-area disclaimer. */
  caption?: string;
  /** The reporter's approximate cell: the map centres here at city zoom and draws the centre dot. */
  focusCell?: string | null;
  /** City centre from geocoding; falls back to the focus cell's centre. */
  cityCentre?: Point | null;
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
  const cellKeys = cells.map((c) => c.cell).join(",");
  const region = useMemo(
    () => mapRegion(cellKeys ? cellKeys.split(",") : [], focusCell, cityCentre),
    [cellKeys, focusCell, cityCentre],
  );
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
        // Remount when the area resolves, so a location that arrives after first paint re-centres the map.
        key={`${region.latitude.toFixed(3)},${region.longitude.toFixed(3)}`}
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
      </MapView>
      {caption ? (
        <View style={styles.caption} pointerEvents="none">
          <Icon name="info" size={14} color={color.text} />
          <Text style={styles.captionText}>{caption}</Text>
        </View>
      ) : null}
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
  caption: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    maxWidth: "62%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  captionText: { ...type.meta, fontSize: 11, lineHeight: 14, color: color.text, flexShrink: 1 },
});
