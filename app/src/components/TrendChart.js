import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Canvas, Circle, Line, vec } from "react-native-skia";
import Ionicons from "@expo/vector-icons/Ionicons";
import { tokens } from "../theme/tokens.js";

const { color, space, radius, shadow } = tokens;

const CHART_HEIGHT = 168;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
const PAD_X = 14;

function formatTime(iso) {
	if (!iso) return "--";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "--";
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatSignedDelta(delta) {
	if (typeof delta !== "number" || Number.isNaN(delta)) return "--";
	if (delta > 0) return `+${delta.toFixed(2)}°C`;
	if (delta < 0) return `${delta.toFixed(2)}°C`;
	return "0.00°C";
}

export function TrendChart({
	points = [],
	threshold = null,
	connectionState = "disconnected",
	mqttError = null,
	onReset,
	onRetry,
}) {
	const [canvasWidth, setCanvasWidth] = useState(0);
	const [selectedIndex, setSelectedIndex] = useState(null);

	// Keep selection pinned to the newest reading unless the user inspected an older point.
	useEffect(() => {
		if (points.length === 0) {
			setSelectedIndex(null);
			return;
		}
		setSelectedIndex((prev) => {
			if (prev === null || prev >= points.length - 2) {
				return points.length - 1;
			}
			return prev;
		});
	}, [points.length]);

	const activeIndex =
		selectedIndex !== null && points[selectedIndex]
			? selectedIndex
			: points.length - 1;
	const activePoint = activeIndex >= 0 ? points[activeIndex] : null;

	const stats = useMemo(() => {
		if (points.length === 0) return null;
		let min = points[0].temperature;
		let max = points[0].temperature;
		let sum = 0;
		for (let i = 0; i < points.length; i++) {
			const v = points[i].temperature;
			if (v < min) min = v;
			if (v > max) max = v;
			sum += v;
		}
		const avg = sum / points.length;
		const latest = points[points.length - 1];
		const first = points[0];
		const sessionDelta =
			points.length > 1 ? latest.temperature - first.temperature : null;
		return {
			min,
			max,
			avg,
			latestDelta: latest.delta,
			sessionDelta,
		};
	}, [points]);

	const geometry = useMemo(() => {
		if (points.length < 2 || canvasWidth <= PAD_X * 2) return null;

		let domainMin = stats.min;
		let domainMax = stats.max;
		if (typeof threshold === "number") {
			domainMin = Math.min(domainMin, threshold);
			domainMax = Math.max(domainMax, threshold);
		}
		// Pad flat or tight domains so a steady temperature sits centered rather than hugging an edge.
		const span = domainMax - domainMin;
		const pad = span < 1 ? 1.5 : span * 0.18;
		const minY = domainMin - pad;
		const maxY = domainMax + pad;
		const rangeY = Math.max(0.5, maxY - minY);

		const usableWidth = canvasWidth - PAD_X * 2;
		const usableHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

		const toY = (val) =>
			PAD_TOP + usableHeight - ((val - minY) / rangeY) * usableHeight;
		const toX = (idx) =>
			PAD_X + (idx / Math.max(1, points.length - 1)) * usableWidth;

		const coords = points.map((pt, idx) => ({
			x: toX(idx),
			y: toY(pt.temperature),
			point: pt,
			overLimit: typeof threshold === "number" && pt.temperature >= threshold,
		}));

		const segments = [];
		for (let i = 0; i < coords.length - 1; i++) {
			segments.push({
				p1: vec(coords[i].x, coords[i].y),
				p2: vec(coords[i + 1].x, coords[i + 1].y),
			});
		}

		const thresholdY =
			typeof threshold === "number" ? toY(threshold) : null;

		return {
			coords,
			segments,
			thresholdY,
			minY,
			midY: (minY + maxY) / 2,
			maxY,
		};
	}, [points, stats, threshold, canvasWidth]);

	const activeComparison = useMemo(() => {
		if (!activePoint) return null;
		const delta = activePoint.delta;
		if (typeof delta !== "number") {
			return {
				label: "First reading in session",
				icon: "radio-button-on-outline",
				bg: color.surface2,
				border: color.border,
				text: color.text2,
			};
		}
		if (delta > 0.01) {
			return {
				label: `${formatSignedDelta(delta)} vs prev (Rising)`,
				icon: "trending-up",
				bg: color.warnBg,
				border: color.warnBorder,
				text: color.warnText,
			};
		}
		if (delta < -0.01) {
			return {
				label: `${formatSignedDelta(delta)} vs prev (Cooling)`,
				icon: "trending-down",
				bg: color.successBg,
				border: color.successBorder,
				text: color.successText,
			};
		}
		return {
			label: "0.00°C vs prev (Steady)",
			icon: "remove",
			bg: color.surface2,
			border: color.border,
			text: color.text2,
		};
	}, [activePoint]);

	return (
		<View
			style={styles.card}
			accessible
			accessibilityRole="summary"
			accessibilityLabel="Temperature trend comparison chart"
		>
			<View style={styles.headerRow}>
				<View style={styles.titleBlock}>
					<Text style={styles.title}>
						How is temperature moving vs. previous readings?
					</Text>
					<Text style={styles.subtitle}>
						Local session buffer (up to 12 live readings, clears on refresh)
					</Text>
				</View>
				{points.length > 0 && onReset ? (
					<Pressable
						onPress={onReset}
						accessibilityRole="button"
						accessibilityLabel="Clear local trend readings"
						hitSlop={8}
						style={({ pressed }) => [
							styles.resetButton,
							pressed && styles.pressed,
						]}
					>
						<Ionicons name="refresh-outline" size={14} color={color.text2} />
						<Text style={styles.resetText}>Clear</Text>
					</Pressable>
				) : null}
			</View>

			{mqttError && points.length === 0 ? (
				<View
					style={styles.stateBoxError}
					accessible
					accessibilityLiveRegion="polite"
				>
					<Ionicons
						name="alert-circle-outline"
						size={18}
						color={color.dangerText}
					/>
					<View style={styles.stateTextWrap}>
						<Text style={styles.stateTitleError}>
							Cannot record trend while sensor feed is offline
						</Text>
						<Text style={styles.stateBodyError}>{mqttError}</Text>
					</View>
					{onRetry ? (
						<Pressable
							onPress={onRetry}
							accessibilityRole="button"
							accessibilityLabel="Retry sensor connection"
							style={({ pressed }) => [
								styles.retryBtn,
								pressed && styles.pressed,
							]}
						>
							<Text style={styles.retryBtnText}>Retry</Text>
						</Pressable>
					) : null}
				</View>
			) : null}

			{points.length === 0 && !mqttError ? (
				<View style={styles.stateBoxEmpty}>
					<Ionicons name="analytics-outline" size={22} color={color.text2} />
					<Text style={styles.stateTitle}>No local readings in this session</Text>
					<Text style={styles.stateBody}>
						{connectionState === "connected"
							? "Connected to MQTT broker. Waiting for the sensor simulator to publish the first reading..."
							: "Waiting for MQTT connection. Start the sensor simulator to compare incoming readings."}
					</Text>
				</View>
			) : null}

			{points.length === 1 ? (
				<View style={styles.stateBoxEmpty}>
					<View style={styles.firstPointBadge}>
						<Text style={styles.firstPointValue}>
							{points[0].temperature.toFixed(2)}°C
						</Text>
						<Text style={styles.firstPointTime}>
							at {formatTime(points[0].timestamp)}
						</Text>
					</View>
					<Text style={styles.stateTitle}>
						1st reading captured, waiting for 2nd reading to compare
					</Text>
					<Text style={styles.stateBody}>
						The trend line and delta comparison appear as soon as the next 5-second MQTT reading arrives.
					</Text>
				</View>
			) : null}

			{points.length >= 2 && stats ? (
				<>
					<View style={styles.statsRow}>
						<View style={styles.statCell}>
							<Text style={styles.statLabel}>Vs. previous</Text>
							<Text style={styles.statValue}>
								{formatSignedDelta(stats.latestDelta)}
							</Text>
						</View>
						<View style={styles.statCell}>
							<Text style={styles.statLabel}>Vs. session start</Text>
							<Text style={styles.statValue}>
								{formatSignedDelta(stats.sessionDelta)}
							</Text>
						</View>
						<View style={styles.statCell}>
							<Text style={styles.statLabel}>Min / Max</Text>
							<Text style={styles.statValue}>
								{stats.min.toFixed(1)}° / {stats.max.toFixed(1)}°
							</Text>
						</View>
						<View style={styles.statCell}>
							<Text style={styles.statLabel}>Average</Text>
							<Text style={styles.statValue}>{stats.avg.toFixed(2)}°C</Text>
						</View>
					</View>

					{activePoint && activeComparison ? (
						<View style={styles.inspectBar}>
							<View style={styles.inspectLeft}>
								<Text style={styles.inspectTemp}>
									{activePoint.temperature.toFixed(2)}°C
								</Text>
								<Text style={styles.inspectMeta}>
									#{activeIndex + 1} at {formatTime(activePoint.timestamp)}
								</Text>
							</View>
							<View
								style={[
									styles.deltaPill,
									{
										backgroundColor: activeComparison.bg,
										borderColor: activeComparison.border,
									},
								]}
							>
								<Ionicons
									name={activeComparison.icon}
									size={14}
									color={activeComparison.text}
								/>
								<Text
									style={[
										styles.deltaPillText,
										{ color: activeComparison.text },
									]}
								>
									{activeComparison.label}
								</Text>
							</View>
						</View>
					) : null}

					<View style={styles.chartRow}>
						{geometry ? (
							<View style={styles.yAxis} pointerEvents="none">
								<Text style={styles.axisText}>
									{geometry.maxY.toFixed(1)}°
								</Text>
								<Text style={styles.axisText}>
									{geometry.midY.toFixed(1)}°
								</Text>
								<Text style={styles.axisText}>
									{geometry.minY.toFixed(1)}°
								</Text>
							</View>
						) : null}

						<View
							style={styles.canvasWrap}
							onLayout={(e) => {
								const w = Math.round(e.nativeEvent.layout.width);
								if (w > 0 && w !== canvasWidth) {
									setCanvasWidth(w);
								}
							}}
						>
							{geometry && canvasWidth > 0 ? (
								<>
									<Canvas
										style={{ width: canvasWidth, height: CHART_HEIGHT }}
									>
										<Line
											p1={vec(PAD_X, PAD_TOP)}
											p2={vec(canvasWidth - PAD_X, PAD_TOP)}
											color={color.border}
											strokeWidth={1}
										/>
										<Line
											p1={vec(PAD_X, CHART_HEIGHT / 2)}
											p2={vec(canvasWidth - PAD_X, CHART_HEIGHT / 2)}
											color={color.border}
											strokeWidth={1}
										/>
										<Line
											p1={vec(PAD_X, CHART_HEIGHT - PAD_BOTTOM)}
											p2={vec(canvasWidth - PAD_X, CHART_HEIGHT - PAD_BOTTOM)}
											color={color.border}
											strokeWidth={1}
										/>

										{typeof geometry.thresholdY === "number" &&
										geometry.thresholdY >= PAD_TOP &&
										geometry.thresholdY <= CHART_HEIGHT - PAD_BOTTOM ? (
											<Line
												p1={vec(PAD_X, geometry.thresholdY)}
												p2={vec(canvasWidth - PAD_X, geometry.thresholdY)}
												color={color.warnText}
												strokeWidth={1.5}
											/>
										) : null}

										{geometry.segments.map((seg, idx) => (
											<Line
												key={`seg-${idx}`}
												p1={seg.p1}
												p2={seg.p2}
												color={color.primary}
												strokeWidth={2.5}
											/>
										))}

										{geometry.coords.map((c, idx) => {
											const isSelected = idx === activeIndex;
											const dotColor = c.overLimit
												? color.dangerText
												: color.primary;
											return (
												<Circle
													key={c.point.id}
													cx={c.x}
													cy={c.y}
													r={isSelected ? 6 : c.overLimit ? 5 : 4}
													color={dotColor}
												/>
											);
										})}
									</Canvas>

									<View style={styles.touchOverlay}>
										{points.map((pt, idx) => {
											const isSelected = idx === activeIndex;
											return (
												<Pressable
													key={pt.id}
													onPress={() => setSelectedIndex(idx)}
													accessibilityRole="button"
													accessibilityState={{ selected: isSelected }}
													accessibilityLabel={`Reading ${idx + 1}: ${pt.temperature.toFixed(
														2,
													)} degrees Celsius at ${formatTime(pt.timestamp)}${
														typeof pt.delta === "number"
															? `, change ${formatSignedDelta(pt.delta)}`
															: ""
													}`}
													style={styles.touchColumn}
												/>
											);
										})}
									</View>
								</>
							) : null}
						</View>
					</View>

					<View style={styles.footerRow}>
						<Text style={styles.footerText}>
							Start {formatTime(points[0].timestamp)}
						</Text>
						<View style={styles.legendRow}>
							<View style={styles.legendItem}>
								<View
									style={[
										styles.legendSwatch,
										{ backgroundColor: color.primary },
									]}
								/>
								<Text style={styles.legendText}>Normal</Text>
							</View>
							<View style={styles.legendItem}>
								<View
									style={[
										styles.legendSwatch,
										{ backgroundColor: color.dangerText },
									]}
								/>
								<Text style={styles.legendText}>Over limit</Text>
							</View>
							{typeof threshold === "number" ? (
								<View style={styles.legendItem}>
									<View
										style={[
											styles.legendLine,
											{ backgroundColor: color.warnText },
										]}
									/>
									<Text style={styles.legendText}>
										Limit {threshold.toFixed(1)}°C
									</Text>
								</View>
							) : null}
						</View>
						<Text style={styles.footerText}>
							Latest {formatTime(points[points.length - 1].timestamp)}
						</Text>
					</View>
				</>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: color.surface,
		padding: space.xl,
		borderRadius: radius.card,
		borderCurve: "continuous",
		gap: space.md,
		borderWidth: 1,
		borderColor: color.border,
		boxShadow: shadow.card,
	},
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		gap: space.md,
	},
	titleBlock: {
		flex: 1,
		gap: 4,
	},
	title: {
		fontSize: tokens.type.section,
		fontWeight: "700",
		color: color.text,
	},
	subtitle: {
		fontSize: 12,
		color: color.text2,
	},
	resetButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: tokens.hit,
		paddingHorizontal: space.md,
		borderRadius: radius.input,
		borderWidth: 1,
		borderColor: color.border,
		backgroundColor: color.surface2,
	},
	resetText: {
		fontSize: 13,
		fontWeight: "600",
		color: color.text2,
	},
	stateBoxEmpty: {
		backgroundColor: color.surface2,
		borderRadius: radius.input,
		borderWidth: 1,
		borderColor: color.border,
		padding: space.lg,
		gap: 6,
		alignItems: "flex-start",
	},
	stateTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: color.text,
	},
	stateBody: {
		fontSize: 13,
		color: color.text2,
		lineHeight: 18,
	},
	firstPointBadge: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 6,
		backgroundColor: color.surface,
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderRadius: radius.input,
		borderWidth: 1,
		borderColor: color.border,
	},
	firstPointValue: {
		fontSize: 16,
		fontWeight: "700",
		color: color.primary,
		fontVariant: ["tabular-nums"],
	},
	firstPointTime: {
		fontSize: 12,
		color: color.text2,
		fontVariant: ["tabular-nums"],
	},
	stateBoxError: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		backgroundColor: color.dangerBg,
		borderRadius: radius.input,
		borderWidth: 1,
		borderColor: color.dangerBorder,
		padding: space.md,
	},
	stateTextWrap: {
		flex: 1,
		gap: 2,
	},
	stateTitleError: {
		fontSize: 14,
		fontWeight: "600",
		color: color.dangerText,
	},
	stateBodyError: {
		fontSize: 13,
		color: color.dangerText,
	},
	retryBtn: {
		minHeight: tokens.hit,
		justifyContent: "center",
		paddingHorizontal: space.md,
	},
	retryBtnText: {
		fontSize: 14,
		fontWeight: "600",
		color: color.dangerText,
	},
	statsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: space.sm,
	},
	statCell: {
		flex: 1,
		minWidth: 120,
		backgroundColor: color.surface2,
		borderRadius: radius.input,
		paddingVertical: space.sm,
		paddingHorizontal: space.md,
		gap: 2,
	},
	statLabel: {
		fontSize: 12,
		color: color.text2,
		fontWeight: "500",
	},
	statValue: {
		fontSize: 14,
		fontWeight: "700",
		color: color.text,
		fontVariant: ["tabular-nums"],
	},
	inspectBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		flexWrap: "wrap",
		gap: space.sm,
		paddingVertical: space.sm,
		paddingHorizontal: space.md,
		backgroundColor: color.bg,
		borderRadius: radius.input,
		borderWidth: 1,
		borderColor: color.border,
	},
	inspectLeft: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: space.sm,
	},
	inspectTemp: {
		fontSize: 16,
		fontWeight: "700",
		color: color.text,
		fontVariant: ["tabular-nums"],
	},
	inspectMeta: {
		fontSize: 12,
		color: color.text2,
		fontVariant: ["tabular-nums"],
	},
	deltaPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderRadius: radius.chip,
		borderWidth: 1,
	},
	deltaPillText: {
		fontSize: 12,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
	chartRow: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: space.sm,
	},
	yAxis: {
		justifyContent: "space-between",
		paddingVertical: PAD_TOP - 6,
		minWidth: 42,
		alignItems: "flex-end",
	},
	axisText: {
		fontSize: 11,
		fontWeight: "600",
		color: color.text2,
		fontVariant: ["tabular-nums"],
	},
	canvasWrap: {
		flex: 1,
		height: CHART_HEIGHT,
		position: "relative",
	},
	touchOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
	},
	touchColumn: {
		flex: 1,
		minHeight: tokens.hit,
	},
	footerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		flexWrap: "wrap",
		gap: space.sm,
	},
	footerText: {
		fontSize: 11,
		color: color.text2,
		fontVariant: ["tabular-nums"],
	},
	legendRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: space.md,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	legendSwatch: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	legendLine: {
		width: 12,
		height: 2,
	},
	legendText: {
		fontSize: 11,
		color: color.text2,
		fontWeight: "500",
	},
	pressed: {
		opacity: 0.85,
		transform: [{ scale: 0.98 }],
	},
});

