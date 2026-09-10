// ui.tsx: shared presentational primitives for the reporter app.
// Screen frame, card, primary/secondary buttons, status pill, reassurance line,
// row-with-chevron, section label, progress dots, notice box. Token-driven only.
// Distinct from components/icons/Icon.tsx (drawing) and the screen files (composition).

import type { ReactNode } from "react";
import {
  AccessibilityRole,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  color,
  radius,
  shadow,
  space,
  statusStyle,
  target,
  type,
  type FriendlyStatus,
} from "../theme";
import { Icon, type IconName } from "./icons/Icon";

/**
 * Top padding for the screen frame: apply the real safe-area inset when there is
 * one (notch / status bar), with a small floor when there is none. The previous
 * rule inverted the ternary and dropped the pad exactly when a device had an
 * inset, so every header rendered under the OS clock.
 */
export function screenPaddingTop(insetTop: number): number {
  return insetTop || space.md;
}

/** Full-screen frame: ivory ground, safe-area aware, optional scroll. */
export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? { padding: space.lg } : undefined;
  const body = scroll ? (
    <ScrollView
      style={s.flex}
      contentContainerStyle={[pad, { paddingBottom: space.xl, gap: space.lg }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.flex, pad, { gap: space.lg }]}>{children}</View>
  );

  return (
    <View style={[s.screen, { paddingTop: screenPaddingTop(insets.top) }]}>
      {body}
      {footer ? (
        <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
      ) : null}
    </View>
  );
}

export function ScreenTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={s.title} accessibilityRole="header">
        {children}
      </Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = <View style={[s.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [pressed && s.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      accessibilityLabel={busy ? `${label}, working` : label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        s.primary,
        pressed && !off && s.primaryPressed,
        off && s.primaryOff,
      ]}
    >
      <Text style={s.primaryText}>{busy ? "Working..." : label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [s.secondary, pressed && s.pressed, disabled && s.primaryOff]}
    >
      {icon ? <Icon name={icon} size={18} color={color.text} /> : null}
      <Text style={s.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ status, count }: { status: FriendlyStatus; count?: number }) {
  const st = statusStyle[status];
  const label =
    status === "confirmed" && count && count > 1 ? `Confirmed by ${count} people` : st.label;
  return (
    <View style={[s.pill, { backgroundColor: st.tint }]} accessibilityRole="text">
      <View style={[s.pillDot, { backgroundColor: st.hue }]} />
      <Text style={s.pillText}>{label}</Text>
    </View>
  );
}

/**
 * "Step X of N" header for the guided report flow (Identity / Capture / Questions / Review).
 * `total` defaults to 4 but drops to 3 when the identity step is flagged out.
 */
export function ReportProgress({ step, total = 4, label }: { step: number; total?: number; label: string }) {
  return (
    <View style={{ gap: space.xs }} accessibilityRole="header">
      <Text style={s.stepCount}>
        Step {step} of {total} · {label}
      </Text>
      <View style={s.dots}>
        {Array.from({ length: total }, (_, i) => i + 1).map((i) => (
          <View
            key={i}
            style={[s.dot, i <= step ? { backgroundColor: color.primary } : { backgroundColor: color.border }]}
          />
        ))}
      </View>
    </View>
  );
}

export function Reassurance({ title, body }: { title: string; body: string }) {
  return (
    <View style={s.reassure}>
      <Icon name="privacy" size={20} color={color.success} accessibilityLabel="Privacy" />
      <View style={s.flex}>
        <Text style={s.reassureTitle}>{title}</Text>
        <Text style={s.reassureBody}>{body}</Text>
      </View>
    </View>
  );
}

export function Notice({
  tone,
  children,
  icon = "info",
  role = "text",
}: {
  tone: "info" | "warning" | "attention" | "success";
  children: ReactNode;
  icon?: IconName;
  role?: AccessibilityRole;
}) {
  const map = {
    info: { bg: color.informationSoft, fg: color.information },
    warning: { bg: color.warningSoft, fg: color.warning },
    attention: { bg: color.attentionSoft, fg: color.attention },
    success: { bg: color.successSoft, fg: color.success },
  }[tone];
  return (
    <View style={[s.notice, { backgroundColor: map.bg }]} accessibilityLiveRegion="polite" accessibilityRole={role}>
      <Icon name={icon} size={18} color={map.fg} />
      <Text style={s.noticeText}>{children}</Text>
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  onPress,
  accent = color.text,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <View style={[s.rowIcon, { backgroundColor: color.surfaceSoft }]}>
        <Icon name={icon} size={20} color={accent} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      <Icon name="chevron" size={18} color={color.faint} />
    </Pressable>
  );
}

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.back, pressed && s.pressed]}
    >
      <Icon name="back" size={20} color={color.muted} />
      <Text style={s.backText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.background },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: color.background,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  title: { ...type.display, color: color.text },
  hint: { ...type.body, color: color.muted },
  sectionLabel: {
    ...type.meta,
    color: color.faint,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    gap: space.sm,
    ...shadow.card,
  },
  pressed: { opacity: 0.7 },
  primary: {
    minHeight: target.primary,
    borderRadius: radius.md,
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryOff: { opacity: 0.5 },
  primaryText: { ...type.action, color: color.onPrimary },
  secondary: {
    minHeight: target.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  secondaryText: { ...type.subtitle, color: color.text },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    alignSelf: "flex-start",
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  pillDot: { width: 8, height: 8, borderRadius: radius.pill },
  pillText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: color.text },
  stepCount: { ...type.label, color: color.muted, textTransform: "uppercase" },
  reassure: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.successSoft,
  },
  reassureTitle: { ...type.subtitle, color: color.text },
  reassureBody: { ...type.meta, color: color.muted },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    alignItems: "flex-start",
  },
  noticeText: { ...type.meta, flex: 1, fontWeight: "600", color: color.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: target.min + 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { ...type.subtitle, color: color.text },
  rowSub: { ...type.meta, color: color.muted },
  dots: { flexDirection: "row", gap: space.xs },
  dot: { height: 6, flex: 1, borderRadius: radius.pill },
  back: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: target.min, alignSelf: "flex-start" },
  backText: { ...type.subtitle, color: color.muted },
});
