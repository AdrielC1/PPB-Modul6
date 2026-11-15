import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  LinearGradient,
  Path,
  rect,
  rrect,
} from "react-native-skia";
import { useIsFocused } from "@react-navigation/native";
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { tokens } from "../theme/tokens.js";

const { color } = tokens;

const EMPTY_PATH = "M 0 0 L 0 0 Z";
const SCALE_MIN = 10;
const WAVE_SAMPLES = 28;

// Seeded rising bubbles clipped below the active wave surface.
const BUBBLES = [
  { xFrac: -0.46, r: 3.4, speed: 0.42, offset: 0.12, wobble: 5 },
  { xFrac: -0.18, r: 2.5, speed: 0.58, offset: 0.48, wobble: 4 },
  { xFrac: 0.14, r: 3.8, speed: 0.36, offset: 0.78, wobble: 6 },
  { xFrac: 0.44, r: 2.8, speed: 0.52, offset: 0.31, wobble: 4.5 },
  { xFrac: -0.02, r: 2.2, speed: 0.68, offset: 0.64, wobble: 3.5 },
];

// Blue (Normal) -> Yellow (Near limit) -> Red (Over limit).
const WATER_PALETTES = {
  normal: {
    backWave: "rgba(56, 189, 248, 0.36)",
    frontGradient: ["rgba(14, 165, 233, 0.54)", "rgba(2, 132, 199, 0.78)"],
    ring: "#7DD3FC",
    beatRing: "rgba(2, 132, 199, 0.35)",
    threshLine: "rgba(15, 23, 42, 0.45)",
    threshDot: "#0F172A",
  },
  near: {
    backWave: "rgba(250, 204, 21, 0.40)",
    frontGradient: ["rgba(250, 204, 21, 0.54)", "rgba(234, 179, 8, 0.78)"],
    ring: "#FDE047",
    beatRing: "rgba(234, 179, 8, 0.36)",
    threshLine: "rgba(120, 53, 15, 0.50)",
    threshDot: "#92400E",
  },
  over: {
    backWave: "rgba(248, 113, 113, 0.38)",
    frontGradient: ["rgba(239, 68, 68, 0.54)", "rgba(220, 38, 38, 0.78)"],
    ring: "#FCA5A5",
    beatRing: "rgba(220, 38, 38, 0.36)",
    threshLine: "rgba(185, 28, 28, 0.78)",
    threshDot: "#B91C1C",
  },
  offline: {
    backWave: "rgba(148, 163, 184, 0.22)",
    frontGradient: ["rgba(148, 163, 184, 0.26)", "rgba(100, 116, 139, 0.38)"],
    ring: "#CBD5E1",
    beatRing: "rgba(148, 163, 184, 0)",
    threshLine: "rgba(100, 116, 139, 0.45)",
    threshDot: "#64748B",
  },
};

function fmt(n) {
  "worklet";
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function computeNormalizedLevels(temperature, threshold) {
  const upperRef = Math.max(
    50,
    typeof threshold === "number" ? threshold + 10 : 50,
    typeof temperature === "number" ? temperature + 4 : 50
  );
  const scaleMax = Math.ceil(upperRef / 10) * 10;
  const span = scaleMax - SCALE_MIN;

  const level =
    typeof temperature === "number"
      ? clamp((temperature - SCALE_MIN) / span, 0.08, 0.94)
      : 0.22;

  const threshLevel =
    typeof threshold === "number"
      ? clamp((threshold - SCALE_MIN) / span, 0.1, 0.9)
      : -1;

  return { level, threshLevel };
}

function buildWaveFillSvg(
  xStart,
  xEnd,
  fillY,
  bottomY,
  phase,
  freq,
  amp
) {
  "worklet";
  const step = (xEnd - xStart) / WAVE_SAMPLES;
  const y0 = fillY + Math.sin(xStart * freq + phase) * amp;
  let d = `M ${fmt(xStart)} ${fmt(bottomY)} L ${fmt(xStart)} ${fmt(y0)}`;
  for (let i = 1; i <= WAVE_SAMPLES; i++) {
    const x = xStart + step * i;
    const y = fillY + Math.sin(x * freq + phase) * amp;
    d += ` L ${fmt(x)} ${fmt(y)}`;
  }
  d += ` L ${fmt(xEnd)} ${fmt(bottomY)} Z`;
  return d;
}

function circleArcSvg(cx, cy, r) {
  "worklet";
  return (
    `M ${fmt(cx - r)} ${fmt(cy)} ` +
    `A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} ` +
    `A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} Z `
  );
}

/**
 * Circular liquid wave visualizer reacting to temperature level, status, and MQTT beats.
 */
export function TempOrb({
  temperature = null,
  threshold = null,
  status = "normal",
  beatKey = 0,
  size = 320,
  dimmed = false,
}) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const firstBeat = useRef(true);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  const { level: initialLevel, threshLevel: initialThresh } =
    computeNormalizedLevels(temperature, threshold);

  const levelSV = useSharedValue(initialLevel);
  const threshSV = useSharedValue(initialThresh);
  const statusCodeSV = useSharedValue(
    status === "over" ? 2 : status === "near" ? 1 : 0
  );
  const phaseSV = useSharedValue(0);
  const bubbleClockSV = useSharedValue(0);
  const beatSV = useSharedValue(0);
  const beatRingProgSV = useSharedValue(1);
  const dimSV = useSharedValue(dimmed ? 1 : 0);
  const reduceMotionSV = useSharedValue(reduceMotion ? 1 : 0);

  const clipRRect = useMemo(
    () => rrect(rect(cx - radius, cy - radius, radius * 2, radius * 2), radius, radius),
    [cx, cy, radius]
  );

  useEffect(() => {
    reduceMotionSV.set(reduceMotion ? 1 : 0);
  }, [reduceMotion, reduceMotionSV]);

  useEffect(() => {
    const { level, threshLevel } = computeNormalizedLevels(
      temperature,
      threshold
    );
    const timingOpts = {
      duration: reduceMotion ? 180 : 650,
      easing: Easing.out(Easing.cubic),
    };
    levelSV.set(withTiming(level, timingOpts));
    if (threshLevel < 0 || threshSV.value < 0) {
      threshSV.set(threshLevel);
    } else {
      threshSV.set(withTiming(threshLevel, timingOpts));
    }
  }, [temperature, threshold, reduceMotion, levelSV, threshSV]);

  useEffect(() => {
    statusCodeSV.set(status === "over" ? 2 : status === "near" ? 1 : 0);
  }, [status, statusCodeSV]);

  useEffect(() => {
    dimSV.set(withTiming(dimmed ? 1 : 0, { duration: 360 }));
  }, [dimmed, dimSV]);

  useEffect(() => {
    if (firstBeat.current) {
      firstBeat.current = false;
      return;
    }
    if (!beatKey || dimmed || reduceMotion) return;

    beatSV.set(0);
    beatSV.set(
      withSequence(
        withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 650, easing: Easing.out(Easing.quad) })
      )
    );
    beatRingProgSV.set(0);
    beatRingProgSV.set(
      withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) })
    );

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // haptics unsupported — wave pulse still plays
    }
  }, [beatKey, dimmed, reduceMotion, beatSV, beatRingProgSV]);

  const frame = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const speed =
      statusCodeSV.value === 2 ? 3.8 : statusCodeSV.value === 1 ? 2.8 : 1.9;
    phaseSV.value = (phaseSV.value + dt * speed) % (Math.PI * 200);
    bubbleClockSV.value = (bubbleClockSV.value + dt * (1 + beatSV.value * 0.9)) % 1000;
  });

  useEffect(() => {
    frame.setActive(focused && !reduceMotion && !dimmed);
  }, [focused, reduceMotion, dimmed, frame]);

  const backWavePath = useDerivedValue(() => {
    const fillY = cy + radius - levelSV.value * (radius * 2) - 2.5;
    const baseAmp =
      statusCodeSV.value === 2 ? 7 : statusCodeSV.value === 1 ? 5.6 : 4.4;
    const amp = reduceMotionSV.value ? 1.8 : baseAmp + beatSV.value * 4;
    return buildWaveFillSvg(
      cx - radius - 4,
      cx + radius + 4,
      fillY,
      cy + radius + 6,
      phaseSV.value * 0.85 + 1.6,
      0.038,
      amp
    );
  });

  const frontWavePath = useDerivedValue(() => {
    const fillY = cy + radius - levelSV.value * (radius * 2);
    const baseAmp =
      statusCodeSV.value === 2 ? 8.5 : statusCodeSV.value === 1 ? 6.8 : 5.2;
    const amp = reduceMotionSV.value ? 2 : baseAmp + beatSV.value * 5;
    return buildWaveFillSvg(
      cx - radius - 4,
      cx + radius + 4,
      fillY,
      cy + radius + 6,
      -phaseSV.value,
      0.032,
      amp
    );
  });

  const bubblesPath = useDerivedValue(() => {
    if (reduceMotionSV.value || dimSV.value > 0.7) return EMPTY_PATH;
    const fillY = cy + radius - levelSV.value * (radius * 2);
    const bottomInside = cy + radius - 4;
    const waterHeight = bottomInside - fillY;
    if (waterHeight < 24) return EMPTY_PATH;

    let d = "";
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      const prog = (bubbleClockSV.value * b.speed + b.offset) % 1;
      const by = bottomInside - prog * (waterHeight - 6);
      if (by > fillY + b.r + 3 && by < bottomInside) {
        const bx =
          cx +
          b.xFrac * radius +
          Math.sin(phaseSV.value * 1.1 + i * 1.7) * b.wobble;
        const rScale = b.r * (1 + beatSV.value * 0.25);
        d += circleArcSvg(bx, by, rScale);
      }
    }
    return d || EMPTY_PATH;
  });

  const threshLinePath = useDerivedValue(() => {
    if (threshSV.value < 0) return EMPTY_PATH;
    const ty = cy + radius - threshSV.value * (radius * 2);
    const dy = ty - cy;
    const halfChord = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    if (halfChord < 18) return EMPTY_PATH;
    return `M ${fmt(cx - halfChord + 10)} ${fmt(ty)} L ${fmt(cx + halfChord - 8)} ${fmt(ty)}`;
  });

  const threshDotPath = useDerivedValue(() => {
    if (threshSV.value < 0) return EMPTY_PATH;
    const ty = cy + radius - threshSV.value * (radius * 2);
    const dy = ty - cy;
    const halfChord = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    if (halfChord < 18) return EMPTY_PATH;
    return circleArcSvg(cx + halfChord, ty, 3.8);
  });

  const beatRingPath = useDerivedValue(() => {
    const p = beatRingProgSV.value;
    if (p <= 0 || p >= 1) return EMPTY_PATH;
    const rr = radius + p * 16;
    return circleArcSvg(cx, cy, rr);
  });

  const beatRingOpacity = useDerivedValue(() => {
    const p = beatRingProgSV.value;
    if (p <= 0 || p >= 1) return 0;
    return (1 - p) * 0.55 * (1 - dimSV.value);
  });

  const gradStart = useDerivedValue(() => ({
    x: cx,
    y: cy + radius - levelSV.value * (radius * 2) - 10,
  }));

  const gradEnd = useDerivedValue(() => ({
    x: cx,
    y: cy + radius,
  }));

  const vesselOpacity = useDerivedValue(() => 1 - 0.35 * dimSV.value);

  const palette = dimmed
    ? WATER_PALETTES.offline
    : WATER_PALETTES[status] || WATER_PALETTES.normal;

  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <Canvas style={{ width: size, height: size }}>
        <Group opacity={beatRingOpacity}>
          <Path
            path={beatRingPath}
            style="stroke"
            strokeWidth={2}
            color={palette.beatRing}
          />
        </Group>

        <Group opacity={vesselOpacity}>
          <Group clip={clipRRect}>
            <Circle cx={cx} cy={cy} r={radius} color={color.bg} />
            <Path path={backWavePath} color={palette.backWave} />
            <Path path={frontWavePath}>
              <LinearGradient
                start={gradStart}
                end={gradEnd}
                colors={palette.frontGradient}
              />
            </Path>
            <Path path={bubblesPath} color="rgba(255, 255, 255, 0.52)" />
            <Path
              path={threshLinePath}
              style="stroke"
              strokeWidth={1.6}
              color={palette.threshLine}
            >
              <DashPathEffect intervals={[5, 5]} />
            </Path>
          </Group>

          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            style="stroke"
            strokeWidth={2.5}
            color={palette.ring}
          />
          <Path path={threshDotPath} color={palette.threshDot} />
        </Group>
      </Canvas>
    </View>
  );
}
