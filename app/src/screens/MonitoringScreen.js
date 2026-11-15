import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Pressable,
	RefreshControl,
	ScrollView,
	Text,
	View,
	StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
	FadeIn,
	FadeInDown,
	useReducedMotion,
} from "react-native-reanimated";
import { useMqttSensor } from "../hooks/useMqttSensor.js";
import { Api } from "../services/api.js";
import { DataTable } from "../components/DataTable.js";
import { Pagination } from "../components/Pagination.js";
import { TempOrb } from "../components/TempOrb.js";
import { TrendChart } from "../components/TrendChart.js";
import { tokens } from "../theme/tokens.js";

const { color, space, radius, shadow } = tokens;
const MAX_TREND_POINTS = 12;
const READINGS_PAGE_SIZE = 20;

function StatusChip({ connectionState, hasError, onRetry }) {
	const config = useMemo(() => {
		if (
			hasError ||
			connectionState === "error" ||
			connectionState === "disconnected"
		) {
			return {
				bg: color.dangerBg,
				border: color.dangerBorder,
				text: color.dangerText,
				dot: color.dangerText,
				label: "Offline",
				actionable: true,
			};
		}
		if (connectionState === "reconnecting") {
			return {
				bg: color.warnBg,
				border: color.warnBorder,
				text: color.warnText,
				dot: color.warnText,
				label: "Reconnecting…",
				actionable: false,
			};
		}
		return {
			bg: color.successBg,
			border: color.successBorder,
			text: color.successText,
			dot: color.successText,
			label: "Connected",
			actionable: false,
		};
	}, [connectionState, hasError]);

	const chip = (
		<View
			style={[
				styles.chip,
				{ backgroundColor: config.bg, borderColor: config.border },
			]}
			accessible
			accessibilityLabel={`Sensor feed ${config.label}`}
			accessibilityRole="text"
		>
			<View style={[styles.dot, { backgroundColor: config.dot }]} />
			<Text style={[styles.chipText, { color: config.text }]}>
				{config.label}
			</Text>
			{config.actionable ? (
				<Ionicons name="refresh" size={14} color={config.text} />
			) : null}
		</View>
	);

	if (config.actionable && onRetry) {
		return (
			<Pressable
				onPress={onRetry}
				accessibilityLabel="Retry sensor feed"
				accessibilityRole="button"
				accessibilityHint="Attempts to reload sensor history"
				hitSlop={8}
				style={({ pressed }) => [pressed && styles.pressed]}
			>
				{chip}
			</Pressable>
		);
	}
	return chip;
}

export function MonitoringScreen() {
	const {
		temperature,
		timestamp,
		connectionState,
		error: mqttError,
	} = useMqttSensor();
	const [readings, setReadings] = useState([]);
	const [currentPage, setCurrentPage] = useState(1);
	const [trendPoints, setTrendPoints] = useState([]);
	const [latestThreshold, setLatestThreshold] = useState(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [apiError, setApiError] = useState(null);
	const reduceMotion = useReducedMotion();
	const scrollViewRef = useRef(null);
	const historyTopYRef = useRef(0);

	useEffect(() => {
		if (typeof temperature !== "number" || !timestamp) return;
		setTrendPoints((prev) => {
			const last = prev[prev.length - 1];
			if (
				last &&
				last.timestamp === timestamp &&
				last.temperature === temperature
			) {
				return prev;
			}
			const delta = last
				? Number((temperature - last.temperature).toFixed(2))
				: null;
			const nextPoint = {
				id: `${timestamp}-${temperature}`,
				temperature,
				timestamp,
				delta,
			};
			return [...prev.slice(-(MAX_TREND_POINTS - 1)), nextPoint];
		});
	}, [temperature, timestamp]);

	const clearTrendPoints = useCallback(() => {
		setTrendPoints([]);
	}, []);

	const fetchReadings = useCallback(async () => {
		setLoading(true);
		setApiError(null);
		try {
			const [history, thresholds] = await Promise.all([
				Api.getSensorReadings(),
				Api.getThresholds().catch(() => null),
			]);
			setReadings(history ?? []);
			const latest = Array.isArray(thresholds) ? thresholds[0]?.value : null;
			setLatestThreshold(typeof latest === "number" ? latest : null);
		} catch (err) {
			setApiError(err.message || "Couldn't load history.");
		} finally {
			setLoading(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			fetchReadings();
		}, [fetchReadings]),
	);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		setTrendPoints([]);
		setCurrentPage(1);
		try {
			await fetchReadings();
		} finally {
			setRefreshing(false);
		}
	}, [fetchReadings]);

	const totalReadings = Array.isArray(readings) ? readings.length : 0;
	const totalPages = Math.max(1, Math.ceil(totalReadings / READINGS_PAGE_SIZE));
	const safePage = Math.min(Math.max(1, currentPage), totalPages);

	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(totalPages);
		}
	}, [currentPage, totalPages]);

	const pagedReadings = useMemo(() => {
		if (!Array.isArray(readings) || readings.length === 0) {
			return [];
		}
		const start = (safePage - 1) * READINGS_PAGE_SIZE;
		return readings.slice(start, start + READINGS_PAGE_SIZE);
	}, [readings, safePage]);

	const handlePageChange = useCallback(
		(nextPage) => {
			const target = Math.max(1, Math.min(nextPage, totalPages));
			if (target === safePage) return;
			Haptics.selectionAsync().catch(() => {});
			setCurrentPage(target);
			scrollViewRef.current?.scrollTo({
				y: Math.max(0, historyTopYRef.current - space.md),
				animated: !reduceMotion,
			});
		},
		[totalPages, safePage, reduceMotion],
	);

	const proximity = useMemo(() => {
		if (
			typeof temperature !== "number" ||
			typeof latestThreshold !== "number"
		) {
			return null;
		}
		let status = "normal";
		let tone = "below threshold";
		let statusWord = "Normal";
		let statusColor = "#0369A1";
		if (temperature >= latestThreshold) {
			status = "over";
			tone = "at or above threshold";
			statusWord = "Over limit";
			statusColor = color.dangerText;
		} else if (temperature >= latestThreshold - 2) {
			status = "near";
			tone = "near threshold";
			statusWord = "Near limit";
			statusColor = color.warnText;
		}
		return { status, tone, statusWord, statusColor };
	}, [temperature, latestThreshold]);

	const freshness = useMemo(() => {
		if (!Array.isArray(readings) || readings.length === 0) {
			return "No readings yet";
		}
		const first = readings[0];
		const t = new Date(first.recorded_at ?? first.timestamp ?? Date.now());
		const s = Number.isNaN(t.getTime())
			? 0
			: Math.max(0, Math.round((Date.now() - t.getTime()) / 1000));
		const rel =
			s < 10 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
		return `Updated ${rel} · ${readings.length} ${
			readings.length === 1 ? "reading" : "readings"
		}`;
	}, [readings]);

	const tempLabel =
		typeof temperature === "number" ? `${temperature.toFixed(2)}` : "--";

	const beatKey =
		typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))
			? Date.parse(timestamp)
			: 0;

	return (
		<View style={styles.safe}>
			<ScrollView
				ref={scrollViewRef}
				contentContainerStyle={styles.container}
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={color.primary}
					/>
				}
			>
				<Animated.View
					style={styles.card}
					entering={
						reduceMotion
							? FadeIn.duration(150)
							: FadeInDown.duration(tokens.motion.entering)
					}
				>
					<View style={styles.cardTopRow}>
						<Text style={styles.eyebrow}>Live temperature</Text>
						<StatusChip
							connectionState={connectionState}
							hasError={Boolean(mqttError)}
							onRetry={onRefresh}
						/>
					</View>

					<View
						style={styles.orbStage}
						accessible
						accessibilityLabel={`Current temperature ${tempLabel} degrees Celsius${
							proximity ? `, ${proximity.statusWord}` : ""
						}`}
					>
						<View style={styles.orbWrap}>
							<TempOrb
								temperature={temperature}
								threshold={latestThreshold}
								status={proximity ? proximity.status : "normal"}
								beatKey={beatKey}
								dimmed={
									connectionState !== "connected" &&
									connectionState !== "reconnecting"
								}
								size={320}
							/>
							<View style={styles.orbNumber} pointerEvents="none">
								<View style={styles.orbReadoutPill}>
									<View style={styles.orbNumberRow}>
										<Text
											style={[
												styles.temperatureText,
												{ color: proximity ? proximity.statusColor : color.text },
											]}
											selectable
										>
											{tempLabel}
										</Text>
										<Text
											style={[
												styles.unitText,
												{
													color: proximity ? proximity.statusColor : color.text2,
												},
											]}
										>
											°C
										</Text>
									</View>
									{proximity ? (
										<Text
											style={[
												styles.statusWord,
												{ color: proximity.statusColor },
											]}
										>
											{proximity.statusWord}
										</Text>
									) : null}
								</View>
							</View>
						</View>
					</View>

					<View style={styles.metaBlock}>
						{typeof latestThreshold === "number" ? (
							<View style={styles.metaRow}>
								<Ionicons
									name="speedometer-outline"
									size={15}
									color={color.text3}
								/>
								<Text style={styles.metaText}>
									Threshold {latestThreshold.toFixed(2)}°C
								</Text>
							</View>
						) : null}
						{timestamp ? (
							<View style={styles.metaRow}>
								<Ionicons name="time-outline" size={15} color={color.text3} />
								<Text style={styles.metaText}>
									Last update {new Date(timestamp).toLocaleString()}
								</Text>
							</View>
						) : null}
						<View style={styles.metaRow}>
							<Ionicons name="refresh-outline" size={15} color={color.text3} />
							<Text style={styles.metaText}>{freshness}</Text>
						</View>
					</View>

					{mqttError ? (
						<View
							style={styles.errorBanner}
							accessible
							accessibilityLiveRegion="polite"
							accessibilityLabel={`Sensor feed offline. ${mqttError}`}
						>
							<Ionicons
								name="cloud-offline-outline"
								size={18}
								color={color.dangerText}
							/>
							<View style={styles.errorBannerTextWrap}>
								<Text style={styles.errorBannerTitle}>Sensor feed offline</Text>
								<Text style={styles.errorBannerText}>{mqttError}</Text>
							</View>
							<Pressable
								onPress={onRefresh}
								accessibilityLabel="Retry sensor feed"
								accessibilityRole="button"
								hitSlop={8}
								style={({ pressed }) => [
									styles.retryButton,
									pressed && styles.pressed,
								]}
							>
								<Text style={styles.retryText}>Retry</Text>
							</Pressable>
						</View>
					) : null}
				</Animated.View>

				<TrendChart
					points={trendPoints}
					threshold={latestThreshold}
					connectionState={connectionState}
					mqttError={mqttError}
					onReset={clearTrendPoints}
					onRetry={onRefresh}
				/>

				{apiError && !loading ? (
					<View
						style={styles.errorBanner}
						accessible
						accessibilityLiveRegion="polite"
						accessibilityLabel={`Couldn't load history. ${apiError}`}
					>
						<Ionicons
							name="alert-circle-outline"
							size={18}
							color={color.dangerText}
						/>
						<View style={styles.errorBannerTextWrap}>
							<Text style={styles.errorBannerTitle}>Couldn't load history</Text>
							<Text style={styles.errorBannerText}>{apiError}</Text>
						</View>
						<Pressable
							onPress={fetchReadings}
							accessibilityLabel="Retry loading history"
							accessibilityRole="button"
							hitSlop={8}
							style={({ pressed }) => [
								styles.retryButton,
								pressed && styles.pressed,
							]}
						>
							<Text style={styles.retryText}>Retry</Text>
						</Pressable>
					</View>
				) : null}

				<View
					style={styles.sectionHeader}
					onLayout={(e) => {
						historyTopYRef.current = e.nativeEvent.layout.y;
					}}
				>
					<View style={styles.sectionTitleRow}>
						<Text style={styles.sectionTitle}>Triggered Alarm History</Text>
						{totalReadings > 0 ? (
							<View style={styles.countPill}>
								<Text style={styles.countText}>
									{totalReadings}{" "}
									{totalReadings === 1 ? "reading" : "readings"}
								</Text>
							</View>
						) : null}
					</View>
				</View>

				<DataTable
					columns={[
						{
							key: "recorded_at",
							title: "Timestamp",
							flex: 1.5,
							// ponytail: same single-line format as threshold history
							render: (value) =>
								value ? new Date(value).toLocaleString() : "--",
						},
						{
							key: "temperature",
							title: "Temp °C",
							flex: 0.9,
							numeric: true,
							render: (value) =>
								typeof value === "number" ? Number(value).toFixed(2) : "--",
						},
						{
							key: "threshold_value",
							title: "Limit °C",
							flex: 0.9,
							numeric: true,
							render: (value) =>
								typeof value === "number" ? Number(value).toFixed(2) : "--",
						},
					]}
					data={pagedReadings}
					keyExtractor={(item) => item.id}
					loading={loading && !refreshing}
					emptyTitle="No readings yet"
					emptyMessage="Triggered readings appear here. Pull to refresh."
					emptyActionLabel="Refresh"
					onEmptyAction={fetchReadings}
					footer={
						<Pagination
							currentPage={safePage}
							totalItems={totalReadings}
							pageSize={READINGS_PAGE_SIZE}
							onPageChange={handlePageChange}
						/>
					}
				/>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: color.bg,
	},
	container: {
		padding: space.lg,
		paddingBottom: space.xxl,
		gap: space.lg,
		backgroundColor: color.bg,
	},
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
	cardTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: space.md,
	},
	eyebrow: {
		fontSize: 12,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.8,
		color: color.text3,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: radius.chip,
		borderCurve: "continuous",
		borderWidth: 1,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	chipText: {
		fontSize: 12,
		fontWeight: "600",
	},
	orbStage: {
		alignItems: "center",
		gap: space.sm,
		minHeight: 320,
	},
	orbWrap: {
		width: 320,
		height: 320,
		alignSelf: "center",
		position: "relative",
	},
	orbNumber: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	orbReadoutPill: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
		paddingHorizontal: space.lg,
		paddingVertical: space.sm,
		borderRadius: 18,
		borderCurve: "continuous",
		backgroundColor: "rgba(255, 255, 255, 0.88)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.95)",
	},
	orbNumberRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 6,
	},
	temperatureText: {
		fontSize: 30,
		fontWeight: "700",
		color: color.text,
		fontVariant: ["tabular-nums"],
	},
	unitText: {
		fontSize: 15,
		fontWeight: "600",
		color: color.text2,
	},
	statusWord: {
		fontSize: 13,
		fontWeight: "700",
	},
	metaBlock: {
		gap: space.sm,
		marginTop: space.sm,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	metaText: {
		fontSize: 13,
		color: color.text2,
		fontVariant: ["tabular-nums"],
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		// ponytail: taller break above, table tucked under header
		marginTop: space.md,
		marginBottom: -space.sm,
	},
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
	},
	sectionTitle: {
		fontSize: tokens.type.section,
		fontWeight: "700",
		color: color.text,
	},
	countPill: {
		backgroundColor: color.surface2,
		borderRadius: radius.pill,
		borderCurve: "continuous",
		paddingVertical: 4,
		paddingHorizontal: 8,
	},
	countText: {
		fontSize: 12,
		fontWeight: "600",
		color: color.text2,
		fontVariant: ["tabular-nums"],
	},
	errorBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		backgroundColor: color.dangerBg,
		borderWidth: 1,
		borderColor: color.dangerBorder,
		borderRadius: radius.input,
		borderCurve: "continuous",
		padding: space.md,
	},
	errorBannerTextWrap: {
		flex: 1,
		gap: 2,
	},
	errorBannerTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: color.dangerText,
	},
	errorBannerText: {
		fontSize: 13,
		color: color.dangerText,
	},
	retryButton: {
		minHeight: tokens.hit,
		justifyContent: "center",
		paddingHorizontal: space.md,
	},
	retryText: {
		fontSize: 14,
		fontWeight: "600",
		color: color.dangerText,
	},
	pressed: {
		opacity: 0.9,
		transform: [{ scale: 0.98 }],
	},
});
