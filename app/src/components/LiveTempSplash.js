import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import {
  Canvas,
  Group,
  LinearGradient,
  Path,
} from "react-native-skia";
import Animated, {
  Easing,
  ReduceMotion,
  clamp,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { tokens } from "../theme/tokens.js";

const COLORS = {
  background: "#F8FAFC",
  surface: tokens.color.surface,
  border: tokens.color.border,
  accent: "#0284C7",
  textPrimary: tokens.color.text,
  textSecondary: tokens.color.text3,
  track: tokens.color.border,
  floorShadow: "rgba(15, 23, 42, 0.14)",
  ring: "rgba(2, 132, 199, 0.28)",
};

const WAVE_GRADIENT_COLORS = [
  "rgba(240, 249, 255, 0.92)",
  "#BAE6FD",
  "#38BDF8",
  "#0284C7",
  "#0369A1",
  "#0284C7",
  "#38BDF8",
  "rgba(186, 230, 253, 0.78)",
  "rgba(240, 249, 255, 0.45)",
  "rgba(255, 255, 255, 0.14)",
  "rgba(255, 255, 255, 0)",
];
const WAVE_GRADIENT_POSITIONS = [
  0.0, 0.04, 0.11, 0.21, 0.33, 0.47, 0.62, 0.76, 0.87, 0.95, 1.0,
];

const MID_WAVE_COLORS = [
  "rgba(224, 242, 254, 0.72)",
  "rgba(3, 105, 161, 0.56)",
  "rgba(56, 189, 248, 0.30)",
  "rgba(255, 255, 255, 0)",
];
const MID_WAVE_POSITIONS = [0.0, 0.22, 0.58, 1.0];

// Heavy drop timing & stage orchestration
const SWEEP_START_DELAY = 1380;
const SWEEP_DURATION = 2400;
const WAVE_SEGMENTS = 22;
const EMPTY_SVG_PATH = "M 0 0 L 0 0 Z";

const LETTERS = [
  { char: "L", isAccent: false, startRot: -14, bounce: -15, sweepRot: -24, defaultX: -66 },
  { char: "i", isAccent: false, startRot: 12, bounce: -12, sweepRot: -18, defaultX: -48 },
  { char: "v", isAccent: false, startRot: -11, bounce: -14, sweepRot: -26, defaultX: -32 },
  { char: "e", isAccent: false, startRot: 15, bounce: -13, sweepRot: -20, defaultX: -14 },
  { char: "T", isAccent: true, startRot: -16, bounce: -16, sweepRot: -28, defaultX: 6 },
  { char: "e", isAccent: true, startRot: 12, bounce: -13, sweepRot: -22, defaultX: 26 },
  { char: "m", isAccent: true, startRot: -13, bounce: -12, sweepRot: -25, defaultX: 49 },
  { char: "p", isAccent: true, startRot: 14, bounce: -15, sweepRot: -30, defaultX: 72 },
];

const BUBBLES = [
  { sFrac: -0.58, uOff: 46, r: 5.5, speed: 1.1 },
  { sFrac: -0.31, uOff: 92, r: 4.0, speed: 0.9 },
  { sFrac: -0.08, uOff: 34, r: 6.5, speed: 1.3 },
  { sFrac: 0.16, uOff: 128, r: 4.5, speed: 1.0 },
  { sFrac: 0.39, uOff: 58, r: 5.0, speed: 1.2 },
  { sFrac: 0.62, uOff: 105, r: 3.5, speed: 0.85 },
];

function playTiming(toValue, config, callback) {
  return withTiming(
    toValue,
    { ...config, reduceMotion: ReduceMotion.Never },
    callback
  );
}

function playDelay(delayMs, animation) {
  return withDelay(delayMs, animation, ReduceMotion.Never);
}

function startHeavyDrop({
  dropY,
  scaleX,
  scaleY,
  rotate,
  shadowScale,
  shadowOpacity,
  opacity,
  startY,
  bounceHeight,
  delay,
}) {
  dropY.value = startY;
  scaleX.value = 0.92;
  scaleY.value = 1.10;
  opacity.value = 0;
  shadowScale.value = 0.18;
  shadowOpacity.value = 0;

  opacity.value = playDelay(delay, playTiming(1, { duration: 85 }));

  dropY.value = playDelay(
    delay,
    withSequence(
      ReduceMotion.Never,
      playTiming(0, { duration: 290, easing: Easing.in(Easing.cubic) }),
      playTiming(0, { duration: 44 }),
      playTiming(bounceHeight, { duration: 105, easing: Easing.out(Easing.quad) }),
      playTiming(0, { duration: 100, easing: Easing.in(Easing.quad) }),
      playTiming(bounceHeight * 0.24, { duration: 55, easing: Easing.out(Easing.quad) }),
      playTiming(0, { duration: 55, easing: Easing.in(Easing.quad) })
    )
  );

  rotate.value = playDelay(
    delay + 280,
    playTiming(0, { duration: 55, easing: Easing.out(Easing.quad) })
  );

  scaleX.value = playDelay(
    delay,
    withSequence(
      ReduceMotion.Never,
      playTiming(0.93, { duration: 290 }),
      playTiming(1.20, { duration: 44, easing: Easing.out(Easing.quad) }),
      playTiming(0.96, { duration: 105 }),
      playTiming(1.07, { duration: 100 }),
      playTiming(1, { duration: 120, easing: Easing.out(Easing.quad) })
    )
  );

  scaleY.value = playDelay(
    delay,
    withSequence(
      ReduceMotion.Never,
      playTiming(1.09, { duration: 290 }),
      playTiming(0.79, { duration: 44, easing: Easing.out(Easing.quad) }),
      playTiming(1.04, { duration: 105 }),
      playTiming(0.93, { duration: 100 }),
      playTiming(1, { duration: 120, easing: Easing.out(Easing.quad) })
    )
  );

  shadowScale.value = playDelay(
    delay,
    withSequence(
      ReduceMotion.Never,
      playTiming(1.24, { duration: 290, easing: Easing.in(Easing.cubic) }),
      playTiming(1.24, { duration: 44 }),
      playTiming(0.78, { duration: 105 }),
      playTiming(1.08, { duration: 100 }),
      playTiming(1, { duration: 110 })
    )
  );

  shadowOpacity.value = playDelay(
    delay,
    withSequence(
      ReduceMotion.Never,
      playTiming(1, { duration: 290, easing: Easing.in(Easing.cubic) }),
      playTiming(1, { duration: 44 }),
      playTiming(0.55, { duration: 105 }),
      playTiming(0.88, { duration: 100 }),
      playTiming(0.76, { duration: 110 })
    )
  );
}

// Computes buoyant wave-ride displacement along the top-right -> bottom-left diagonal
function computeWaveRide(crest, contact, phase, exitSpan, targetRot, seed) {
  "worklet";
  const pen = crest - contact;
  if (pen <= 0) {
    return { dx: 0, dy: 0, rot: 0, scale: 1, alpha: 1, shadowFade: 1 };
  }
  const surge = Math.sin(Math.min(1, pen / 58) * Math.PI) * 10;
  const bob = Math.sin(pen * 0.022 + seed) * 7 * Math.min(1, pen / 85);
  const travel = pen * 1.05;
  const invSqrt2 = 0.70710678;

  const dx = -travel * invSqrt2 - (surge + bob) * invSqrt2 * 0.4;
  const dy = travel * invSqrt2 - surge * 0.85 + bob * invSqrt2;

  const rotRatio = Math.min(1, pen / 220);
  const wobble = Math.sin(pen * 0.028 + seed + phase * 0.35) * 4 * rotRatio;
  const rot = targetRot * rotRatio + wobble;
  const scale = 1 - 0.14 * Math.min(1, pen / Math.max(240, exitSpan));
  const fadeStart = Math.max(120, exitSpan - 110);
  const alpha = 1 - clamp((pen - fadeStart) / 100, 0, 1);
  const shadowFade = 1 - clamp(pen / 28, 0, 1);

  return { dx, dy, rot, scale, alpha, shadowFade };
}

function waveCrestPrimary(s, phase, ampScale) {
  "worklet";
  return (
    (Math.sin(s * 0.014 + phase) * 12 +
      Math.sin(s * 0.031 - phase * 1.35) * 6 +
      Math.cos(s * 0.008 + phase * 0.65) * 4) *
    ampScale
  );
}

function waveCrestSecondary(s, phase) {
  "worklet";
  return (
    Math.sin(s * 0.017 - phase * 1.15 + 1.1) * 13 +
    Math.cos(s * 0.029 + phase * 0.9) * 6
  );
}

function evalWaveU(s, baseU, phase, waveType) {
  "worklet";
  if (waveType === 1) {
    return baseU + waveCrestPrimary(s, phase, 1);
  }
  if (waveType === 2) {
    return baseU + waveCrestSecondary(s, phase);
  }
  if (waveType === 3) {
    return baseU + waveCrestPrimary(s, phase, 0.7);
  }
  if (waveType === 4) {
    return baseU + waveCrestPrimary(s, phase, 1) + 4;
  }
  const thickness = 8 + Math.sin(s * 0.026 + phase * 1.4) * 4;
  return baseU + waveCrestPrimary(s, phase, 1) - thickness;
}

function fmtSvg(value) {
  "worklet";
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

function traceWaveEdgeSvg(sFrom, sTo, baseU, phase, waveType, moveToStart) {
  "worklet";
  const step = (sTo - sFrom) / WAVE_SEGMENTS;
  let prevS = sFrom;
  let prevU = evalWaveU(prevS, baseU, phase, waveType);
  let d = `${moveToStart ? "M" : " L"} ${fmtSvg(prevS)} ${fmtSvg(prevU)}`;
  for (let i = 1; i <= WAVE_SEGMENTS; i++) {
    const s = sFrom + i * step;
    const u = evalWaveU(s, baseU, phase, waveType);
    if (i < WAVE_SEGMENTS) {
      d += ` Q ${fmtSvg(prevS)} ${fmtSvg(prevU)} ${fmtSvg((prevS + s) * 0.5)} ${fmtSvg((prevU + u) * 0.5)}`;
    } else {
      d += ` L ${fmtSvg(s)} ${fmtSvg(u)}`;
    }
    prevS = s;
    prevU = u;
  }
  return d;
}

function circleSvg(cx, cy, r) {
  "worklet";
  const startX = fmtSvg(cx - r);
  const startY = fmtSvg(cy);
  const rr = fmtSvg(r);
  const d2 = fmtSvg(r * 2);
  const nd2 = fmtSvg(-r * 2);
  return ` M ${startX} ${startY} a ${rr} ${rr} 0 1 0 ${d2} 0 a ${rr} ${rr} 0 1 0 ${nd2} 0`;
}

function DropLetter({
  item,
  index,
  screenHeight,
  crestU,
  wavePhase,
  dimsSV,
  titleRowMetrics,
}) {
  const startedRef = useRef(false);
  const dropY = useSharedValue(-screenHeight * 0.46);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const rotate = useSharedValue(item.startRot);
  const shadowScale = useSharedValue(0.18);
  const shadowOpacity = useSharedValue(0);
  const opacity = useSharedValue(0);
  const localCenterX = useSharedValue(null);

  // Recomputed whenever either row layout or child layout completes
  const contactU = useDerivedValue(() => {
    const m = titleRowMetrics.value;
    const dx =
      localCenterX.value !== null && m.rowLeftOffset !== null
        ? m.rowLeftOffset + localCenterX.value
        : item.defaultX;
    const dy = m.centerYOffset;
    return (-dx + dy) / Math.SQRT2;
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startHeavyDrop({
      dropY,
      scaleX,
      scaleY,
      rotate,
      shadowScale,
      shadowOpacity,
      opacity,
      startY: -screenHeight * 0.46,
      bounceHeight: item.bounce,
      delay: 140 + index * 45,
    });
  }, [
    dropY,
    scaleX,
    scaleY,
    rotate,
    shadowScale,
    shadowOpacity,
    opacity,
    screenHeight,
    item.bounce,
    index,
  ]);

  const handleLayout = useCallback(
    (e) => {
      const { x, width } = e.nativeEvent.layout;
      localCenterX.value = x + width * 0.5;
    },
    [localCenterX]
  );

  const textStyle = useAnimatedStyle(() => {
    const ride = computeWaveRide(
      crestU.value,
      contactU.value,
      wavePhase.value,
      dimsSV.value.uBL - contactU.value + 90,
      item.sweepRot,
      index * 0.75
    );
    const squashOffset = (1 - scaleY.value) * 18;
    return {
      opacity: opacity.value * ride.alpha,
      transform: [
        { translateX: ride.dx },
        { translateY: dropY.value + squashOffset + ride.dy },
        { rotate: `${rotate.value + ride.rot}deg` },
        { scaleX: scaleX.value * ride.scale },
        { scaleY: scaleY.value * ride.scale },
      ],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const ride = computeWaveRide(
      crestU.value,
      contactU.value,
      wavePhase.value,
      dimsSV.value.uBL - contactU.value + 90,
      item.sweepRot,
      index * 0.75
    );
    return {
      opacity: shadowOpacity.value * ride.shadowFade,
      transform: [{ scaleX: shadowScale.value }],
    };
  });

  return (
    <View style={styles.letterColumn} onLayout={handleLayout}>
      <Animated.Text
        style={[
          item.isAccent ? styles.titleTemp : styles.titleLive,
          textStyle,
        ]}
      >
        {item.char}
      </Animated.Text>
      <Animated.View
        style={[
          styles.letterFloorShadow,
          item.isAccent && styles.letterShadowAccent,
          shadowStyle,
        ]}
      />
    </View>
  );
}

function WaveBackdropCanvas({ width, height, crestU, wavePhase, dimsSV }) {
  const cx = width * 0.5;
  const cy = height * 0.5;

  // Solid #F8FAFC curtain ahead of the wave; tucked behind opaque deep ocean core
  const curtainPath = useDerivedValue(() => {
    const { halfSpan, uBL, waveLen } = dimsSV.value;
    const edgeU = crestU.value - waveLen * 0.25;
    if (edgeU > uBL + 40) {
      return EMPTY_SVG_PATH;
    }
    const bottomU = uBL + 120;
    const topEdge = traceWaveEdgeSvg(
      -halfSpan,
      halfSpan,
      edgeU,
      wavePhase.value,
      1,
      true
    );
    return `${topEdge} L ${fmtSvg(halfSpan)} ${fmtSvg(bottomU)} L ${fmtSvg(-halfSpan)} ${fmtSvg(bottomU)} Z`;
  });

  const mainWavePath = useDerivedValue(() => {
    const { halfSpan, uTR, uBL, waveLen } = dimsSV.value;
    const uFront = crestU.value;
    const uBack = uFront - waveLen;
    if (uFront < uTR - 32 || uBack > uBL + 32) {
      return EMPTY_SVG_PATH;
    }
    const phase = wavePhase.value;
    return `${traceWaveEdgeSvg(
      -halfSpan,
      halfSpan,
      uBack,
      phase + 1.6,
      3,
      true
    )}${traceWaveEdgeSvg(halfSpan, -halfSpan, uFront, phase, 1, false)} Z`;
  });

  const midWavePath = useDerivedValue(() => {
    const { halfSpan, uTR, uBL, waveLen } = dimsSV.value;
    const uFront = crestU.value - 36;
    const uBack = crestU.value - waveLen * 0.65;
    if (uFront < uTR - 32 || uBack > uBL + 32) {
      return EMPTY_SVG_PATH;
    }
    const phase = wavePhase.value;
    return `${traceWaveEdgeSvg(
      -halfSpan,
      halfSpan,
      uBack,
      phase + 2.3,
      3,
      true
    )}${traceWaveEdgeSvg(halfSpan, -halfSpan, uFront, phase, 2, false)} Z`;
  });

  const foamPath = useDerivedValue(() => {
    const { halfSpan, uTR, uBL } = dimsSV.value;
    const uFront = crestU.value;
    if (uFront < uTR - 28 || uFront - 24 > uBL + 28) {
      return EMPTY_SVG_PATH;
    }
    const phase = wavePhase.value;
    let d = `${traceWaveEdgeSvg(
      -halfSpan,
      halfSpan,
      uFront,
      phase,
      4,
      true
    )}${traceWaveEdgeSvg(halfSpan, -halfSpan, uFront, phase, 5, false)} Z`;

    for (let b = 0; b < BUBBLES.length; b++) {
      const item = BUBBLES[b];
      const bx = item.sFrac * halfSpan + Math.sin(phase * item.speed + b) * 14;
      const by = uFront - item.uOff + Math.cos(phase * 1.2 + b) * 6;
      if (by > uTR - 10 && by < uBL + 10) {
        d += circleSvg(bx, by, item.r);
      }
    }
    return d;
  });

  const gradStart = useDerivedValue(() => ({
    x: 0,
    y: crestU.value + 24,
  }));
  const gradEnd = useDerivedValue(() => ({
    x: 0,
    y: crestU.value - dimsSV.value.waveLen - 18,
  }));
  const midGradStart = useDerivedValue(() => ({
    x: 0,
    y: crestU.value - 20,
  }));
  const midGradEnd = useDerivedValue(() => ({
    x: 0,
    y: crestU.value - dimsSV.value.waveLen * 0.65,
  }));

  return (
    <Canvas
      style={{ position: "absolute", top: 0, left: 0, width, height }}
      android={{ surfaceType: "TextureView" }}
      pointerEvents="none"
    >
      <Group
        transform={[
          { translateX: cx },
          { translateY: cy },
          { rotate: Math.PI / 4 },
        ]}
      >
        <Path path={curtainPath} color={COLORS.background} />
        <Path path={mainWavePath}>
          <LinearGradient
            start={gradStart}
            end={gradEnd}
            colors={WAVE_GRADIENT_COLORS}
            positions={WAVE_GRADIENT_POSITIONS}
          />
        </Path>
        <Path path={midWavePath}>
          <LinearGradient
            start={midGradStart}
            end={midGradEnd}
            colors={MID_WAVE_COLORS}
            positions={MID_WAVE_POSITIONS}
          />
        </Path>
        <Path path={foamPath} color="rgba(255, 255, 255, 0.78)" />
      </Group>
    </Canvas>
  );
}

export function LiveTempSplash({
  onFinish,
  onSweepStart,
  tagline = "Real-Time Temperature Monitor",
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [layoutSize, setLayoutSize] = useState(null);
  const safeW = layoutSize?.width > 0 ? layoutSize.width : winW > 0 ? winW : 390;
  const safeH = layoutSize?.height > 0 ? layoutSize.height : winH > 0 ? winH : 844;

  const [passThrough, setPassThrough] = useState(false);
  const startedRef = useRef(false);
  const sweepNotifiedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const onSweepStartRef = useRef(onSweepStart);
  onFinishRef.current = onFinish;
  onSweepStartRef.current = onSweepStart;

  const handleContainerLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setLayoutSize((prev) => {
      if (
        prev &&
        Math.abs(prev.width - width) < 1 &&
        Math.abs(prev.height - height) < 1
      ) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const halfScreenDiag = (safeW + safeH) / (2 * Math.SQRT2);
  const halfSpan = halfScreenDiag + 64;
  const uTR = -halfScreenDiag;
  const uBL = halfScreenDiag;
  const waveLen = Math.max(380, Math.min(540, (safeW + safeH) * 0.44));
  const startU = uTR - 44;
  const endU = uBL + waveLen + 72;

  const dimsSV = useSharedValue({
    halfSpan,
    uTR,
    uBL,
    waveLen,
    startU,
    endU,
  });

  useEffect(() => {
    dimsSV.value = { halfSpan, uTR, uBL, waveLen, startU, endU };
  }, [dimsSV, halfSpan, uTR, uBL, waveLen, startU, endU]);

  const waveProgress = useSharedValue(0);
  const wavePhase = useSharedValue(0);

  // Emblem animation values
  const emblemDropY = useSharedValue(-safeH * 0.44);
  const emblemScaleX = useSharedValue(1);
  const emblemScaleY = useSharedValue(1);
  const emblemRotate = useSharedValue(-14);
  const emblemOpacity = useSharedValue(0);
  const emblemShadowScale = useSharedValue(0.18);
  const emblemShadowOpacity = useSharedValue(0);
  const emblemContactU = useSharedValue(-48);
  const fillTranslateY = useSharedValue(34);
  const ringScale = useSharedValue(0.35);
  const ringOpacity = useSharedValue(0);

  // Tagline animation values
  const taglineOpacity = useSharedValue(0);
  const taglineDropY = useSharedValue(12);
  const taglineContactU = useSharedValue(42);

  // Track title row geometry relative to screen center for exact letter wave contact
  const titleRowMetrics = useSharedValue({
    centerYOffset: 12,
    rowLeftOffset: null,
  });

  const crestU = useDerivedValue(() => {
    const d = dimsSV.value;
    return d.startU + waveProgress.value * (d.endU - d.startU);
  });

  const handleComplete = useCallback(() => {
    if (__DEV__) {
      console.log("[LiveTempSplash] finish");
    }
    onFinishRef.current?.();
  }, []);

  const handleSweepStart = useCallback(() => {
    if (sweepNotifiedRef.current) return;
    sweepNotifiedRef.current = true;
    if (__DEV__) {
      console.log("[LiveTempSplash] stage2 sweep start");
    }
    onSweepStartRef.current?.();
  }, []);

  const handlePassThrough = useCallback(() => {
    setPassThrough(true);
  }, []);

  useFrameCallback((info) => {
    "worklet";
    if (waveProgress.value <= 0 || waveProgress.value >= 1) {
      return;
    }
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    wavePhase.value += dt * 3.8;
  });

  useAnimatedReaction(
    () => waveProgress.value > 0.008,
    (started, prev) => {
      if (started && !prev) {
        scheduleOnRN(handleSweepStart);
      }
    }
  );

  useAnimatedReaction(
    () => waveProgress.value >= 0.85,
    (ready, prev) => {
      if (ready && !prev) {
        scheduleOnRN(handlePassThrough);
      }
    }
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (__DEV__) {
      console.log("[LiveTempSplash] mount", { width: safeW, height: safeH });
    }

    startHeavyDrop({
      dropY: emblemDropY,
      scaleX: emblemScaleX,
      scaleY: emblemScaleY,
      rotate: emblemRotate,
      shadowScale: emblemShadowScale,
      shadowOpacity: emblemShadowOpacity,
      opacity: emblemOpacity,
      startY: -safeH * 0.44,
      bounceHeight: -18,
      delay: 0,
    });

    // Subtle floor impact shockwave ring when heavy emblem lands
    ringScale.value = playDelay(
      290,
      playTiming(1.55, { duration: 520, easing: Easing.out(Easing.cubic) })
    );
    ringOpacity.value = playDelay(
      290,
      withSequence(
        ReduceMotion.Never,
        playTiming(0.8, { duration: 90 }),
        playTiming(0, { duration: 430, easing: Easing.out(Easing.quad) })
      )
    );

    fillTranslateY.value = playDelay(
      340,
      playTiming(7, { duration: 480, easing: Easing.out(Easing.cubic) })
    );

    taglineOpacity.value = playDelay(
      950,
      playTiming(1, { duration: 280, easing: Easing.out(Easing.quad) })
    );
    taglineDropY.value = playDelay(
      950,
      playTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
    );

    waveProgress.value = playDelay(
      SWEEP_START_DELAY,
      playTiming(
        1,
        {
          duration: SWEEP_DURATION,
          easing: Easing.bezier(0.26, 0.04, 0.24, 1),
        },
        (finished) => {
          "worklet";
          if (finished) {
            scheduleOnRN(handleComplete);
          }
        }
      )
    );
  }, [
    emblemDropY,
    emblemScaleX,
    emblemScaleY,
    emblemRotate,
    emblemShadowScale,
    emblemShadowOpacity,
    emblemOpacity,
    ringScale,
    ringOpacity,
    fillTranslateY,
    taglineOpacity,
    taglineDropY,
    waveProgress,
    safeH,
    handleComplete,
  ]);

  const handleEmblemLayout = useCallback(
    (e) => {
      const { y, height: h } = e.nativeEvent.layout;
      const dy = y + h * 0.5 - safeH * 0.5;
      emblemContactU.value = dy / Math.SQRT2;
    },
    [safeH, emblemContactU]
  );

  const handleTitleRowLayout = useCallback(
    (e) => {
      const { x, y, height: h } = e.nativeEvent.layout;
      titleRowMetrics.value = {
        centerYOffset: y + h * 0.5 - safeH * 0.5,
        rowLeftOffset: x - safeW * 0.5,
      };
    },
    [safeW, safeH, titleRowMetrics]
  );

  const handleTaglineLayout = useCallback(
    (e) => {
      const { y, height: h } = e.nativeEvent.layout;
      const dy = y + h * 0.5 - safeH * 0.5;
      taglineContactU.value = dy / Math.SQRT2;
    },
    [safeH, taglineContactU]
  );

  const emblemCardStyle = useAnimatedStyle(() => {
    const ride = computeWaveRide(
      crestU.value,
      emblemContactU.value,
      wavePhase.value,
      dimsSV.value.uBL - emblemContactU.value + 90,
      -26,
      0.3
    );
    const squashOffset = (1 - emblemScaleY.value) * 36;
    return {
      opacity: emblemOpacity.value * ride.alpha,
      transform: [
        { translateX: ride.dx },
        { translateY: emblemDropY.value + squashOffset + ride.dy },
        { rotate: `${emblemRotate.value + ride.rot}deg` },
        { scaleX: emblemScaleX.value * ride.scale },
        { scaleY: emblemScaleY.value * ride.scale },
      ],
    };
  });

  const emblemShadowStyle = useAnimatedStyle(() => {
    const ride = computeWaveRide(
      crestU.value,
      emblemContactU.value,
      wavePhase.value,
      dimsSV.value.uBL - emblemContactU.value + 90,
      -26,
      0.3
    );
    return {
      opacity: emblemShadowOpacity.value * ride.shadowFade,
      transform: [{ scaleX: emblemShadowScale.value }],
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fillTranslateY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => {
    const ride = computeWaveRide(
      crestU.value,
      taglineContactU.value,
      wavePhase.value,
      dimsSV.value.uBL - taglineContactU.value + 90,
      -14,
      2.1
    );
    return {
      opacity: taglineOpacity.value * ride.alpha,
      transform: [
        { translateX: ride.dx },
        { translateY: taglineDropY.value + ride.dy },
        { rotate: `${ride.rot}deg` },
        { scale: ride.scale },
      ],
    };
  });

  // Solid #F8FAFC native backdrop during Stage 1 before Skia curtain hands over
  const stage1BackdropStyle = useAnimatedStyle(() => ({
    opacity: waveProgress.value > 0.008 ? 0 : 1,
  }));

  return (
    <View
      style={styles.overlayContainer}
      onLayout={handleContainerLayout}
      pointerEvents={passThrough ? "none" : "auto"}
      accessible
      accessibilityLabel="Loading LiveTemp"
    >
      <Animated.View
        style={[styles.stage1SolidBg, stage1BackdropStyle]}
        pointerEvents="none"
      />
      <WaveBackdropCanvas
        width={safeW}
        height={safeH}
        crestU={crestU}
        wavePhase={wavePhase}
        dimsSV={dimsSV}
      />

      <View style={styles.centerStage} pointerEvents="none">
        <View style={styles.emblemWrapper} onLayout={handleEmblemLayout}>
          <Animated.View style={[styles.floorRing, ringStyle]} />
          <Animated.View style={[styles.emblemCard, emblemCardStyle]}>
            <View style={styles.thermoStem}>
              <Animated.View style={[styles.thermoFill, fillStyle]} />
            </View>
            <View style={styles.thermoBulb} />
          </Animated.View>
          <Animated.View style={[styles.emblemFloorShadow, emblemShadowStyle]} />
        </View>

        <View
          style={styles.titleRow}
          onLayout={handleTitleRowLayout}
          accessibilityLabel="LiveTemp"
        >
          {LETTERS.map((item, idx) => (
            <DropLetter
              key={`${item.char}-${idx}`}
              item={item}
              index={idx}
              screenHeight={safeH}
              crestU={crestU}
              wavePhase={wavePhase}
              dimsSV={dimsSV}
              titleRowMetrics={titleRowMetrics}
            />
          ))}
        </View>

        <Animated.Text
          style={[styles.tagline, taglineStyle]}
          onLayout={handleTaglineLayout}
        >
          {tagline}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  stage1SolidBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
  },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emblemWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  floorRing: {
    position: "absolute",
    bottom: -3,
    width: 86,
    height: 18,
    borderRadius: 43,
    borderWidth: 1.5,
    borderColor: COLORS.ring,
  },
  emblemCard: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  emblemFloorShadow: {
    width: 54,
    height: 8,
    borderRadius: 27,
    backgroundColor: COLORS.floorShadow,
    marginTop: 7,
  },
  thermoStem: {
    width: 10,
    height: 30,
    borderRadius: 5,
    backgroundColor: COLORS.track,
    overflow: "hidden",
    marginBottom: -3,
    zIndex: 1,
  },
  thermoFill: {
    width: "100%",
    height: "100%",
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  thermoBulb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    borderWidth: 2.5,
    borderColor: COLORS.surface,
    zIndex: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  letterColumn: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  titleLive: {
    fontSize: 38,
    lineHeight: 46,
    includeFontPadding: false,
    fontWeight: "300",
    letterSpacing: 0.5,
    color: COLORS.textPrimary,
  },
  titleTemp: {
    fontSize: 38,
    lineHeight: 46,
    includeFontPadding: false,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: COLORS.accent,
  },
  letterFloorShadow: {
    width: 16,
    height: 4,
    borderRadius: 8,
    backgroundColor: "rgba(15, 23, 42, 0.12)",
    marginTop: 2,
  },
  letterShadowAccent: {
    backgroundColor: "rgba(2, 132, 199, 0.20)",
  },
  tagline: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
  },
});
