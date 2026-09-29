// ui.tsx: shared presentational primitives for the reporter app — screen frame, card, buttons,
// status pill, reassurance line, chevron row, section label, progress dots, notice box, category
// badge, brand mark, Offline pill, and the Alternative C pieces every report screen shares: task
// header, numbered evidence slots, answer chip and info card.
// Token-driven only (src/theme.ts); screens compose these.

import { useEffect, useRef, type ReactNode } from "react";
import {
  AccessibilityRole,
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { answerTone } from "../answer-tone";
import { celebrationsAllowed } from "../feedback";
import { categoryAccent, categoryIcon, type Category } from "../tasks";
import {
  categorySoft,
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
 * Top padding for the screen frame: the real safe-area inset when there is one (notch / status bar),
 * else a small floor. An inverted ternary once dropped the pad on inset devices, hiding every header
 * under the OS clock.
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
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  padded?: boolean;
  /** Pull-to-refresh on scrolling screens. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? { padding: space.lg } : undefined;
  const body = scroll ? (
    <ScrollView
      style={s.flex}
      contentContainerStyle={[pad, { paddingBottom: space.xl, gap: space.lg }]}
      keyboardShouldPersistTaps="handled"
      // iOS: scroll the focused field (e.g. the Review note) above the keyboard instead of under it.
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.primary} /> : undefined
      }
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

/**
 * Fades a list row up into place, staggered 40 ms by `index` (audit motion table: "rows reveal in a
 * 40 ms stagger"). With reduce motion or celebrations off it renders in place, no movement.
 */
export function Appear({ index = 0, children }: { index?: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void celebrationsAllowed()
      .catch(() => false)
      .then((allowed) => {
        if (!alive) return;
        if (!allowed) return v.setValue(1);
        Animated.timing(v, {
          toValue: 1,
          duration: 220,
          delay: Math.min(index, 8) * 40,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    return () => {
      alive = false;
    };
  }, [v, index]);
  return (
    <Animated.View
      style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

/** Shown for a moment while a report screen restores the draft saved on this phone. */
export function DraftLoading() {
  return (
    <Screen>
      <Text style={s.hint} accessibilityRole="progressbar">
        Getting your report ready...
      </Text>
    </Screen>
  );
}

/** Soft tinted circle with the programme category icon (mission rows, catalog, report header). */
export function CategoryBadge({ category, size = 48 }: { category: Category; size?: number }) {
  const accent = categoryAccent[category];
  return (
    <View
      style={[s.badge, { width: size, height: size, backgroundColor: categorySoft[accent] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name={categoryIcon[category]} size={Math.round(size * 0.5)} color={color[accent]} />
    </View>
  );
}

/** "Prufture" wordmark with the sprout mark, for the top of tab screens. */
export function BrandMark() {
  return (
    <View style={s.brand} accessibilityRole="header" accessibilityLabel="Prufture">
      <Icon name="sprout" size={24} filled color={color.primary} />
      <Text style={s.brandText}>Prufture</Text>
    </View>
  );
}

/** Shown only without signal. Offline is a normal state, so it is calm, never an error. */
export function OfflinePill({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <View style={s.offlineWrap} accessibilityRole="text" accessibilityLabel="Offline. Reports sync when online.">
      <View style={s.offlinePill}>
        <Icon name="offline" size={14} color={color.primary} />
        <Text style={s.offlineText}>Offline</Text>
      </View>
      <Text style={s.offlineCaption}>Reports sync when online</Text>
    </View>
  );
}

/** Category circle + large title + one-line purpose: the top of every task and report screen. */
export function TaskHeader({ category, title, subtitle }: { category: Category; title: string; subtitle?: string }) {
  return (
    <View style={s.taskHeader}>
      <CategoryBadge category={category} size={52} />
      <View style={s.flex}>
        <Text style={s.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={s.taskSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Numbered round evidence slots ("1 2 3"). A slot shows its photo when taken, a camera outline
 * otherwise; `current` rings the step being captured. Pressable only when `onPress` is given.
 */
export function EvidenceSteps({
  prompts,
  photos = [],
  current,
  onPress,
  size = 84,
}: {
  prompts: string[];
  photos?: (string | undefined)[];
  current?: number;
  onPress?: (index: number) => void;
  size?: number;
}) {
  return (
    <View style={s.steps}>
      {prompts.map((prompt, i) => {
        const uri = photos[i];
        const slot = (
          <>
            <View>
              {uri ? (
                <Image source={{ uri }} style={[s.slot, { width: size, height: size }]} />
              ) : (
                <View
                  style={[
                    s.slot,
                    s.slotEmpty,
                    { width: size, height: size },
                    current === i && s.slotCurrent,
                  ]}
                >
                  <Icon name="camera" size={Math.round(size * 0.3)} color={current === i ? color.primary : color.muted} />
                </View>
              )}
              <View style={[s.slotNum, uri ? s.slotNumDone : current === i ? s.slotNumCurrent : null]}>
                {uri ? <Icon name="check" size={12} color={color.onPrimary} /> : <Text style={s.slotNumText}>{i + 1}</Text>}
              </View>
            </View>
            <Text style={s.slotText} numberOfLines={3}>
              {prompt}
            </Text>
          </>
        );
        const label = `Photo ${i + 1}: ${prompt}. ${uri ? "Taken." : "Not taken yet."}`;
        return onPress ? (
          <Pressable
            key={i}
            onPress={() => onPress(i)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${uri ? "Tap to take again." : "Tap to take it."}`}
            style={({ pressed }) => [s.step, pressed && s.pressed]}
          >
            {slot}
          </Pressable>
        ) : (
          <View key={i} style={s.step} accessibilityLabel={label}>
            {slot}
          </View>
        );
      })}
    </View>
  );
}

/** A chosen answer, toned by meaning: sage check (works), amber warning (problem), neutral (unsure). */
export function AnswerChip({ option }: { option: string }) {
  const tone = answerTone(option);
  const map = {
    good: { bg: color.successSoft, fg: color.success, icon: "check" as const },
    bad: { bg: color.warningSoft, fg: color.warning, icon: "warning" as const },
    neutral: { bg: color.surfaceSoft, fg: color.muted, icon: "info" as const },
  }[tone];
  return (
    <View style={[s.chip, { backgroundColor: map.bg }]}>
      <Icon name={map.icon} size={16} color={map.fg} />
      <Text style={s.chipText}>{option}</Text>
    </View>
  );
}

/** Round icon + title + body on a white card: offline, permission and outcome notes. */
export function InfoCard({
  icon,
  title,
  body,
  tint = color.primary,
  soft = color.primarySoft,
  children,
}: {
  icon: IconName;
  title: string;
  body?: string;
  tint?: string;
  soft?: string;
  children?: ReactNode;
}) {
  return (
    <View style={s.info} accessibilityRole="text">
      <View style={[s.infoIcon, { backgroundColor: soft }]}>
        <Icon name={icon} size={22} color={tint} />
      </View>
      <View style={[s.flex, { gap: 2 }]}>
        <Text style={s.infoTitle}>{title}</Text>
        {body ? <Text style={s.infoBody}>{body}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  taskHeader: { flexDirection: "row", alignItems: "center", gap: space.md },
  taskSub: { ...type.meta, color: color.muted },
  steps: { flexDirection: "row", gap: space.md },
  step: { flex: 1, alignItems: "center", gap: space.sm },
  slot: { borderRadius: radius.pill, backgroundColor: color.surfaceSoft },
  slotEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: color.border },
  slotCurrent: { borderColor: color.primary, borderStyle: "solid", backgroundColor: color.primarySoft },
  slotNum: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: color.background,
  },
  slotNumDone: { backgroundColor: color.success },
  slotNumCurrent: { backgroundColor: color.primary },
  slotNumText: { ...type.meta, fontWeight: "700", color: color.onPrimary },
  slotText: { ...type.meta, color: color.text, textAlign: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.sm,
    minHeight: target.min - space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  chipText: { ...type.subtitle, color: color.text },
  info: {
    flexDirection: "row",
    gap: space.md,
    alignItems: "flex-start",
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  infoIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  infoTitle: { ...type.subtitle, color: color.text },
  infoBody: { ...type.meta, color: color.muted },
  badge: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: space.xs },
  brandText: { ...type.title, color: color.text },
  offlineWrap: { alignItems: "flex-end", gap: 2 },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
  },
  offlineText: { ...type.meta, color: color.text, fontWeight: "700" },
  offlineCaption: { ...type.meta, fontSize: 11, color: color.muted },
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
    borderRadius: radius.pill,
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
