// LaunchSplash.tsx: the opening moment — the Prufture sprout (same mark as the home BrandMark) grows
// from its stem, the two leaves unfold, the wordmark rises in below, then the overlay fades into the
// app. About 4.6 s so the mark and the wordmark can be read; with reduce motion or celebrations off it
// shows the finished mark for 1.4 s and fades out. The native splash is blank, so this is the only mark.

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { celebrationsAllowed } from "../feedback";
import { color, illustration, type } from "../theme";

const MARK = 132;

// Sprout pieces on the 24-unit icon grid (see Icon.tsx "sprout"), split so each can move on its own.
const STEM = "M12 21V12.3";
const RIGHT_LEAF = "M12 12.3c0-4 2.6-6.8 7.5-7-0.2 4.7-3 7.3-7.5 7.3Z";
const LEFT_LEAF = "M12 14.5c0-3.3-2.2-5.6-6.5-5.8.2 3.9 2.6 6 6.5 6Z";

function Piece({ d, stroke }: { d: string; stroke?: boolean }) {
  return (
    <Svg width={MARK} height={MARK} viewBox="0 0 24 24">
      {stroke ? (
        <Path d={d} stroke={color.primary} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      ) : (
        <Path d={d} fill={color.primary} />
      )}
    </Svg>
  );
}

export function LaunchSplash({ onDone }: { onDone: () => void }) {
  const glow = useRef(new Animated.Value(0)).current;
  const stem = useRef(new Animated.Value(0)).current;
  const right = useRef(new Animated.Value(0)).current;
  const left = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    const finish = () =>
      Animated.timing(out, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        () => !cancelled && onDone(),
      );

    void celebrationsAllowed()
      .catch(() => false)
      .then((allowed) => {
        if (cancelled) return;
        if (!allowed) {
          [glow, stem, right, left, word].forEach((v) => v.setValue(1));
          setTimeout(finish, 1400);
          return;
        }
        const grow = (v: Animated.Value, duration: number) =>
          Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true });
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(stem, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          grow(right, 620),
          grow(left, 580),
          Animated.timing(word, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.delay(1300),
        ]).start(() => !cancelled && finish());
      });
    return () => {
      cancelled = true;
    };
  }, [glow, stem, right, left, word, out, onDone]);

  const pop = (v: Animated.Value, from: string) => ({
    opacity: v,
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
      { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [from, "0deg"] }) },
    ],
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { opacity: out, transform: [{ scale: out.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Prufture"
    >
      <View style={styles.mark}>
        <Animated.View
          style={[
            styles.layer,
            { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
        >
          <Svg width={MARK} height={MARK} viewBox="0 0 24 24">
            <Circle cx="12" cy="13" r="11" fill={illustration.sunSoft} />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[
            styles.layer,
            { transformOrigin: "50% 87.5%", opacity: stem, transform: [{ scaleY: stem }] },
          ]}
        >
          <Piece d={STEM} stroke />
        </Animated.View>
        <Animated.View style={[styles.layer, { transformOrigin: "50% 51%" }, pop(right, "-35deg")]}>
          <Piece d={RIGHT_LEAF} />
        </Animated.View>
        <Animated.View style={[styles.layer, { transformOrigin: "50% 60%" }, pop(left, "35deg")]}>
          <Piece d={LEFT_LEAF} />
        </Animated.View>
      </View>

      <Animated.View
        style={{
          opacity: word,
          transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          alignItems: "center",
        }}
      >
        <Text style={styles.word}>Prufture</Text>
        <Text style={styles.tag}>Stronger communities, brighter tomorrows.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: color.background, alignItems: "center", justifyContent: "center", gap: 12, zIndex: 10 },
  mark: { width: MARK, height: MARK },
  layer: { position: "absolute", top: 0, left: 0, width: MARK, height: MARK },
  word: { ...type.display, fontSize: 34, lineHeight: 40, color: color.text },
  tag: { ...type.meta, color: color.muted, marginTop: 4 },
});
