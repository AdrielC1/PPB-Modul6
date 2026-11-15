import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { tokens } from "../theme/tokens.js";

const { color, space, radius } = tokens;
const MAX_VISIBLE_PAGES = 5;

function getVisiblePages(currentPage, totalPages, maxButtons = MAX_VISIBLE_PAGES) {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, currentPage - half);
  let end = start + maxButtons - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - maxButtons + 1);
  }
  const pages = [];
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }
  return pages;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize = 20,
  onPageChange,
}) {
  if (!totalItems || totalItems <= 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safePage * pageSize);
  const pages = getVisiblePages(safePage, totalPages);

  const isFirst = safePage <= 1;
  const isLast = safePage >= totalPages;

  return (
    <View
      style={styles.wrap}
      accessible={false}
      accessibilityLabel="Pagination controls"
    >
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          Showing {startItem}–{endItem} of {totalItems}
        </Text>
        <Text style={styles.summaryPage}>
          Page {safePage} of {totalPages}
        </Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => onPageChange?.(safePage - 1)}
          disabled={isFirst}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          accessibilityState={{ disabled: isFirst }}
          style={({ pressed }) => [
            styles.blockButton,
            styles.navButton,
            isFirst && styles.disabledButton,
            pressed && !isFirst && styles.pressed,
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={isFirst ? color.text3 : color.text}
          />
        </Pressable>

        <View style={styles.pagesGroup}>
          {pages.map((page) => {
            const active = page === safePage;
            return (
              <Pressable
                key={page}
                onPress={() => onPageChange?.(page)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Page ${page}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.blockButton,
                  active ? styles.activeBlock : styles.inactiveBlock,
                  pressed && !active && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.pageText,
                    active ? styles.activePageText : styles.inactivePageText,
                  ]}
                >
                  {page}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => onPageChange?.(safePage + 1)}
          disabled={isLast}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          accessibilityState={{ disabled: isLast }}
          style={({ pressed }) => [
            styles.blockButton,
            styles.navButton,
            isLast && styles.disabledButton,
            pressed && !isLast && styles.pressed,
          ]}
        >
          <Ionicons
            name="chevron-forward"
            size={16}
            color={isLast ? color.text3 : color.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  summaryText: {
    fontSize: 12,
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
  summaryPage: {
    fontSize: 12,
    fontWeight: "600",
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  pagesGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexShrink: 1,
  },
  blockButton: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: radius.input,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  navButton: {
    backgroundColor: color.surface,
    borderColor: color.border,
  },
  inactiveBlock: {
    backgroundColor: color.surface,
    borderColor: color.border,
  },
  activeBlock: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  disabledButton: {
    opacity: 0.4,
  },
  pageText: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  inactivePageText: {
    color: color.text,
  },
  activePageText: {
    color: color.onPrimary,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
