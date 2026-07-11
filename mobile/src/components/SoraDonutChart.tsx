import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "react-native-paper";

import { useAppSettings } from "../context/AppSettingsContext";
import { formatCurrencyCompact, parseAmount } from "../utils/format";

const chartColors = [
  "#6C48F5",
  "#2F9E55",
  "#F79009",
  "#5B7BEF",
  "#D95FA7",
  "#0F766E",
  "#D94841",
  "#8A6AF8",
];

export type DonutChartRow = {
  label: string;
  value: string | number;
  count?: number;
  color?: string;
};

export function SoraDonutChart({
  rows,
  size = 172,
}: {
  rows: DonutChartRow[];
  size?: number;
}) {
  const { colors, t } = useAppSettings();
  const strokeWidth = Math.max(18, Math.round(size * 0.13));
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const values = rows.map((row) => parseAmount(row.value));
  const total = values.reduce((sum, value) => sum + value, 0);
  let offset = 0;

  if (!total) {
    return (
      <View style={styles.emptyChart}>
        <Text style={[styles.emptyText, { color: colors.muted }]}>{t("No spending data for chart.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.chartBox, { height: size, width: size }]}>
        <Svg height={size} width={size}>
          <Circle
            cx={center}
            cy={center}
            fill="transparent"
            r={radius}
            stroke={colors.border}
            strokeWidth={strokeWidth}
          />
          {rows.map((row, index) => {
            const value = values[index];
            const length = (value / total) * circumference;
            const dashOffset = -offset;
            offset += length;

            return (
              <Circle
                key={`${row.label}-${index}`}
                cx={center}
                cy={center}
                fill="transparent"
                r={radius}
                stroke={row.color ?? chartColors[index % chartColors.length]}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                strokeWidth={strokeWidth}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
          })}
        </Svg>
        <View style={styles.chartCenter}>
          <Text style={[styles.centerAmount, { color: colors.text }]}>{formatCurrencyCompact(total)}</Text>
          <Text style={[styles.centerLabel, { color: colors.muted }]}>{t("Total")}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {rows.map((row, index) => {
          const value = values[index];
          const percent = total ? Math.round((value / total) * 100) : 0;
          return (
            <View key={`${row.label}-${index}`} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: row.color ?? chartColors[index % chartColors.length] }]} />
              <View style={styles.legendText}>
                <Text numberOfLines={1} style={[styles.legendLabel, { color: colors.text }]}>
                  {row.label}
                </Text>
                <Text style={[styles.legendMeta, { color: colors.muted }]}>
                  {formatCurrencyCompact(value)} - {percent}%
                  {row.count ? ` - ${t(row.count === 1 ? "{count} transaction" : "{count} transactions", { count: row.count })}` : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 18,
  },
  chartBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  chartCenter: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  },
  centerAmount: {
    fontSize: 18,
    fontWeight: "900",
  },
  centerLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  legend: {
    alignSelf: "stretch",
    gap: 10,
  },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  dot: {
    borderRadius: 6,
    height: 12,
    marginRight: 10,
    width: 12,
  },
  legendText: {
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    fontSize: 15,
    fontWeight: "900",
  },
  legendMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyChart: {
    alignItems: "center",
    paddingVertical: 14,
  },
  emptyText: {
    fontSize: 14,
  },
});
