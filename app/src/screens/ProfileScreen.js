import { ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { MQTT_TOPIC } from "../services/config.js";
import { tokens } from "../theme/tokens.js";

const { color, space, radius, shadow } = tokens;

const GROUP_MEMBERS = [
  {
    nim: "21120124120007",
    name: "Robertus William Susanto",
    initials: "RW",
  },
  {
    nim: "21120124130069",
    name: "Muhammad Farhan Abdillah",
    initials: "MF",
  },
  {
    nim: "21120124120033",
    name: "Adriel Christofer Widya",
    initials: "AC",
  },
  {
    nim: "21120124130065",
    name: "Muhammad Naufal Adinata",
    initials: "MN",
  },
];

export function ProfileScreen() {
  const reduceMotion = useReducedMotion();
  const appName = Constants.expoConfig?.name || "LiveTemp";
  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic"
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
            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>Group Profile</Text>
              <Text style={styles.title}>Kelompok 26</Text>
            </View>
            <View
              style={styles.countPill}
              accessible
              accessibilityLabel={`${GROUP_MEMBERS.length} group members`}
            >
              <Ionicons name="people-outline" size={15} color={color.text2} />
              <Text style={styles.countText}>
                {GROUP_MEMBERS.length} members
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            Praktikum Pemrograman Perangkat Bergerak · Modul 6
          </Text>

          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Ionicons
                name="hardware-chip-outline"
                size={15}
                color={color.text3}
              />
              <Text style={styles.metaText}>
                {appName} v{appVersion}
              </Text>
            </View>
            {MQTT_TOPIC ? (
              <View style={styles.metaRow}>
                <Ionicons name="radio-outline" size={15} color={color.text3} />
                <Text style={styles.metaText} selectable>
                  Topic {MQTT_TOPIC}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Group Members</Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{GROUP_MEMBERS.length}</Text>
            </View>
          </View>
        </View>

        <Animated.View
          style={styles.membersCard}
          entering={
            reduceMotion
              ? FadeIn.duration(150)
              : FadeInDown.delay(60).duration(tokens.motion.entering)
          }
        >
          {GROUP_MEMBERS.map((member, index) => (
            <View
              key={member.nim}
              style={[
                styles.memberRow,
                index === 0 && styles.firstMemberRow,
              ]}
              accessible
              accessibilityLabel={`Member ${index + 1}, ${member.name}, NIM ${member.nim}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{member.initials}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberNim} selectable>
                  NIM {member.nim}
                </Text>
              </View>
              <View style={styles.indexBadge}>
                <Text style={styles.indexText}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>
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
    alignItems: "flex-start",
    gap: space.md,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: color.text3,
  },
  title: {
    fontSize: tokens.type.title,
    fontWeight: "700",
    color: color.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: color.text2,
  },
  metaBlock: {
    gap: space.sm,
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.sm,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: color.surface2,
    borderRadius: radius.pill,
    borderCurve: "continuous",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
  membersCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    borderCurve: "continuous",
    overflow: "hidden",
    boxShadow: shadow.card,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border,
    minHeight: 72,
  },
  firstMemberRow: {
    borderTopWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.cta,
    borderCurve: "continuous",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1D4ED8",
    letterSpacing: 0.4,
  },
  memberInfo: {
    flex: 1,
    gap: 3,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: color.text,
  },
  memberNim: {
    fontSize: 13,
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
  indexBadge: {
    backgroundColor: color.surface2,
    borderRadius: radius.input,
    borderCurve: "continuous",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  indexText: {
    fontSize: 12,
    fontWeight: "600",
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
});
