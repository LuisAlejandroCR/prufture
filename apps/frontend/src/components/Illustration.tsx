// Illustration.tsx: the two calm scenes from Alternative C drawn as small inline SVG (no image assets,
// so they cost nothing offline): "saved" (sun, sprout, hills) for the completion screen and "growth"
// (a row of plants growing left to right) for the contribution card. Decorative only.

import { memo } from "react";
import { View } from "react-native";
import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";
import { color, illustration as ill } from "../theme";

const SUN = ill.sun;
const SUN_SOFT = ill.sunSoft;
const HILL_FAR = ill.hillFar;
const HILL_NEAR = ill.hillNear;
const LEAF = ill.leaf;
const STEM = ill.stem;
const SOIL = ill.soil;

function Sprout({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <>
      <Line x1={x} y1={y} x2={x} y2={y - 40 * s} stroke={STEM} strokeWidth={3 * s} strokeLinecap="round" />
      <Path d={`M${x} ${y - 26 * s} C ${x - 30 * s} ${y - 30 * s}, ${x - 34 * s} ${y - 52 * s}, ${x - 30 * s} ${y - 58 * s} C ${x - 12 * s} ${y - 56 * s}, ${x} ${y - 44 * s}, ${x} ${y - 26 * s} Z`} fill={LEAF} />
      <Path d={`M${x} ${y - 34 * s} C ${x + 28 * s} ${y - 38 * s}, ${x + 36 * s} ${y - 62 * s}, ${x + 32 * s} ${y - 70 * s} C ${x + 12 * s} ${y - 68 * s}, ${x} ${y - 54 * s}, ${x} ${y - 34 * s} Z`} fill={LEAF} />
    </>
  );
}

function SavedScene() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 180" preserveAspectRatio="xMidYMax slice">
      <Rect x="0" y="0" width="320" height="180" fill={color.background} />
      <Circle cx="160" cy="78" r="46" fill={SUN_SOFT} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = Math.PI * (1.15 + i * 0.175);
        return (
          <Line
            key={i}
            x1={160 + Math.cos(a) * 58}
            y1={78 + Math.sin(a) * 58}
            x2={160 + Math.cos(a) * 70}
            y2={78 + Math.sin(a) * 70}
            stroke={color.primary}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      <Circle cx="262" cy="52" r="14" fill={SUN} />
      <Path d="M0 140 C 60 110, 120 128, 170 120 C 230 110, 280 118, 320 108 L 320 180 L 0 180 Z" fill={HILL_FAR} />
      <Path d="M0 158 C 70 140, 150 150, 210 142 C 260 136, 300 144, 320 140 L 320 180 L 0 180 Z" fill={HILL_NEAR} />
      <Rect x="78" y="118" width="16" height="12" fill={color.surface} />
      <Path d="M75 119 L 86 110 L 97 119 Z" fill={color.primary} />
      <Rect x="232" y="124" width="14" height="10" fill={color.surface} />
      <Path d="M229 125 L 239 117 L 249 125 Z" fill={color.primary} />
      <Sprout x={160} y={122} s={0.9} />
    </Svg>
  );
}

function GrowthScene() {
  const plants = [
    { x: 60, s: 0.35 },
    { x: 125, s: 0.55 },
    { x: 195, s: 0.75 },
    { x: 265, s: 1 },
  ];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 140" preserveAspectRatio="xMidYMax slice">
      <Rect x="0" y="0" width="320" height="140" fill={color.background} />
      <Circle cx="270" cy="30" r="16" fill={SUN_SOFT} />
      <Path d="M0 100 C 80 86, 160 96, 230 88 C 270 84, 300 88, 320 86 L 320 140 L 0 140 Z" fill={HILL_FAR} />
      <Rect x="0" y="118" width="320" height="22" fill={SOIL} />
      {plants.map((p) => (
        <Ellipse key={`soil-${p.x}`} cx={p.x} cy={120} rx={16 * p.s + 6} ry={4} fill={ill.soilDark} />
      ))}
      {plants.map((p) => (
        <Sprout key={p.x} x={p.x} y={120} s={p.s} />
      ))}
    </Svg>
  );
}

function IllustrationBase({ scene, height }: { scene: "saved" | "growth"; height: number }) {
  return (
    <View
      style={{ height, alignSelf: "stretch", overflow: "hidden" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {scene === "saved" ? <SavedScene /> : <GrowthScene />}
    </View>
  );
}

export const Illustration = memo(IllustrationBase);
