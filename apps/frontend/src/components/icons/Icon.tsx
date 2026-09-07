// Icon.tsx: the single SVG icon set for the reporter app (react-native-svg).
// One 24x24 grid, 1.75 stroke. `filled` swaps outlined nav icons to a solid state.
// Functional meaning always pairs an icon with text or an accessibility label; this
// component only draws. Distinct from components/* screen pieces.

import { memo } from "react";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";
import { color as tokens } from "../../theme";

export type IconName =
  | "home"
  | "tasks"
  | "report"
  | "updates"
  | "profile"
  | "location"
  | "clock"
  | "photo"
  | "video"
  | "questions"
  | "privacy"
  | "offline"
  | "check"
  | "warning"
  | "back"
  | "chevron"
  | "filter"
  | "search"
  | "more"
  | "download"
  | "programme"
  | "community"
  | "review"
  | "flash"
  | "camera"
  | "retry"
  | "help"
  | "language"
  | "accessibility"
  | "info"
  | "signout";

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Solid state for selected bottom-nav items. */
  filled?: boolean;
  /** Decorative by default; screens attach the real label to the pressable. */
  accessibilityLabel?: string;
}

function IconBase({ name, size = 24, color = tokens.text, filled = false, accessibilityLabel }: IconProps) {
  const s = 1.75;
  const common = {
    stroke: color,
    strokeWidth: s,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  };
  const solid = { fill: color, stroke: color, strokeWidth: 0.5 };

  const a11y = accessibilityLabel
    ? { accessibilityRole: "image" as const, accessibilityLabel }
    : {};

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...a11y}>
      {render(name, common, solid, filled)}
    </Svg>
  );
}

function render(
  name: IconName,
  o: Record<string, unknown>,
  solid: Record<string, unknown>,
  filled: boolean,
) {
  switch (name) {
    case "home":
      return filled ? (
        <Path {...solid} d="M12 3.2 3.5 10v10.3c0 .3.2.5.5.5h5V15h5v5.8h5c.3 0 .5-.2.5-.5V10L12 3.2Z" />
      ) : (
        <Path {...o} d="M4 10.5 12 4l8 6.5V20a.5.5 0 0 1-.5.5H15V15H9v5.5H4.5A.5.5 0 0 1 4 20v-9.5Z" />
      );
    case "tasks":
      return (
        <>
          <Rect {...(filled ? solid : o)} x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <Polyline {...o} stroke={filled ? tokens.surface : (o.stroke as string)} points="8 10 11 13 16.5 7.5" />
        </>
      );
    case "report":
    case "camera":
      return (
        <>
          <Path
            {...(filled ? solid : o)}
            d="M4 8.5A2 2 0 0 1 6 6.5h1.6l1-2h4.8l1 2H20a2 2 0 0 1 2 2v9A2 2 0 0 1 20 19.5H6a2 2 0 0 1-2-2Z"
          />
          <Circle {...o} stroke={filled ? tokens.surface : (o.stroke as string)} cx="12" cy="12.5" r="3.4" />
        </>
      );
    case "updates":
      return (
        <>
          <Circle {...(filled ? solid : o)} cx="12" cy="12" r="8.5" />
          <Polyline {...o} stroke={filled ? tokens.surface : (o.stroke as string)} points="12 7.5 12 12.5 15.5 14" />
        </>
      );
    case "profile":
      return (
        <>
          <Circle {...(filled ? solid : o)} cx="12" cy="9" r="3.6" />
          <Path
            {...(filled ? solid : o)}
            d="M5.5 19.2a6.6 6.6 0 0 1 13 0"
          />
        </>
      );
    case "location":
      return (
        <>
          <Path {...o} d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21Z" />
          <Circle {...o} cx="12" cy="10.5" r="2.4" />
        </>
      );
    case "clock":
      return (
        <>
          <Circle {...o} cx="12" cy="12" r="8.5" />
          <Polyline {...o} points="12 7 12 12 16 14" />
        </>
      );
    case "photo":
      return (
        <>
          <Rect {...o} x="3.5" y="5.5" width="17" height="13" rx="2.5" />
          <Circle {...o} cx="9" cy="10" r="1.8" />
          <Path {...o} d="m4.5 17 4.5-4 3.5 3 3-2.5 4 3.5" />
        </>
      );
    case "video":
      return (
        <>
          <Rect {...o} x="3.5" y="6.5" width="12" height="11" rx="2.5" />
          <Path {...o} d="m16 10.5 4.5-2.7v8.4L16 13.5Z" />
        </>
      );
    case "questions":
    case "review":
      return (
        <>
          <Path {...o} d="M6 3.5h8.5L19 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
          <Polyline {...o} points="14 3.5 14 8.5 19 8.5" />
          <Line {...o} x1="8" y1="12.5" x2="15" y2="12.5" />
          <Line {...o} x1="8" y1="16" x2="13" y2="16" />
        </>
      );
    case "privacy":
      return (
        <>
          <Path {...o} d="M12 3.2 5.5 6v6c0 4.4 3 7.5 6.5 8.8 3.5-1.3 6.5-4.4 6.5-8.8V6L12 3.2Z" />
          <Polyline {...o} points="9 12 11.2 14.2 15.5 9.5" />
        </>
      );
    case "offline":
      return (
        <>
          <Path {...o} d="M6.5 18.5a3.5 3.5 0 0 1-.4-6.98A5.5 5.5 0 0 1 17 10.5a3.8 3.8 0 0 1 1 7.5Z" />
          <Line {...o} x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
        </>
      );
    case "check":
      return <Polyline {...o} points="5 12.5 10 17.5 19 7" />;
    case "warning":
      return (
        <>
          <Path {...o} d="M12 4.5 21 19H3l9-14.5Z" />
          <Line {...o} x1="12" y1="10" x2="12" y2="14" />
          <Circle {...solid} cx="12" cy="16.6" r="1" />
        </>
      );
    case "back":
      return <Polyline {...o} points="14.5 5 8 12 14.5 19" />;
    case "chevron":
      return <Polyline {...o} points="9.5 5 16 12 9.5 19" />;
    case "filter":
      return <Path {...o} d="M4 6h16l-6 7v5l-4 2v-9L4 6Z" />;
    case "search":
      return (
        <>
          <Circle {...o} cx="11" cy="11" r="6.5" />
          <Line {...o} x1="16" y1="16" x2="20.5" y2="20.5" />
        </>
      );
    case "more":
      return (
        <>
          <Circle {...solid} cx="6" cy="12" r="1.4" />
          <Circle {...solid} cx="12" cy="12" r="1.4" />
          <Circle {...solid} cx="18" cy="12" r="1.4" />
        </>
      );
    case "download":
      return (
        <>
          <Line {...o} x1="12" y1="4" x2="12" y2="15" />
          <Polyline {...o} points="7.5 10.5 12 15 16.5 10.5" />
          <Path {...o} d="M5 18.5h14" />
        </>
      );
    case "programme":
      return (
        <>
          <Line {...o} x1="4.5" y1="19.5" x2="4.5" y2="6" />
          <Rect {...o} x="7.5" y="12" width="3.5" height="7.5" />
          <Rect {...o} x="13" y="8" width="3.5" height="11.5" />
          <Line {...o} x1="4.5" y1="19.5" x2="20" y2="19.5" />
        </>
      );
    case "community":
      return (
        <>
          <Circle {...o} cx="8.5" cy="9" r="2.6" />
          <Circle {...o} cx="15.5" cy="9" r="2.6" />
          <Path {...o} d="M4 18.5a4.5 4.5 0 0 1 9 0M11 18.5a4.5 4.5 0 0 1 9 0" />
        </>
      );
    case "flash":
      return <Path {...o} d="M13 3.5 6 13h5l-1 7.5L18 11h-5l0-7.5Z" />;
    case "retry":
      return <Path {...o} d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" />;
    case "help":
      return (
        <>
          <Circle {...o} cx="12" cy="12" r="8.5" />
          <Path {...o} d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2-2.5 3.6" />
          <Circle {...solid} cx="12" cy="16.6" r="1" />
        </>
      );
    case "language":
      return (
        <>
          <Circle {...o} cx="12" cy="12" r="8.5" />
          <Path {...o} d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5S14.5 18.1 12 20.5c-2.5-2.4-3.8-5.4-3.8-8.5S9.5 5.9 12 3.5Z" />
        </>
      );
    case "accessibility":
      return (
        <>
          <Circle {...solid} cx="12" cy="5.5" r="1.6" />
          <Path {...o} d="M4.5 8.5h15M12 8.5v6M12 14.5 8.5 20M12 14.5 15.5 20" />
        </>
      );
    case "info":
      return (
        <>
          <Circle {...o} cx="12" cy="12" r="8.5" />
          <Line {...o} x1="12" y1="11" x2="12" y2="16.5" />
          <Circle {...solid} cx="12" cy="7.6" r="1" />
        </>
      );
    case "signout":
      return (
        <>
          <Path {...o} d="M14 5.5H6.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H14" />
          <Polyline {...o} points="16.5 8.5 20.5 12 16.5 15.5" />
          <Line {...o} x1="10" y1="12" x2="20" y2="12" />
        </>
      );
    default:
      return null;
  }
}

export const Icon = memo(IconBase);
