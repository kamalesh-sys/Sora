import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

export function useSoraResponsive() {
  const { fontScale, height, width } = useWindowDimensions();

  return useMemo(() => {
    const compactWidth = width < 380;
    const tinyWidth = width < 340;
    const compactHeight = height < 760;
    const tinyHeight = height < 700;
    const compact = compactWidth || compactHeight;
    const tiny = tinyWidth || tinyHeight;

    return {
      compact,
      compactHeight,
      compactWidth,
      fontScale,
      height,
      maxContentWidth: Math.min(width, 480),
      maxFontScale: tiny ? 1.02 : compact ? 1.06 : 1.12,
      tiny,
      tinyHeight,
      tinyWidth,
      width,
      dashboard: {
        actionIcon: tiny ? 54 : compact ? 60 : 72,
        actionIconSize: tiny ? 24 : compact ? 26 : 30,
        actionLabel: tiny ? 12 : compact ? 13 : 15,
        balanceAmount: tiny ? 25 : compact ? 28 : 32,
        balanceFooter: tiny ? 12 : compact ? 13 : 15,
        balanceIcon: tiny ? 34 : compact ? 38 : 42,
        balanceLabel: tiny ? 15 : compact ? 16 : 18,
        balanceMinHeight: tiny ? 110 : compact ? 118 : 128,
        cardPadding: tiny ? 16 : compact ? 18 : 22,
        chartBarGap: tiny ? 4 : compact ? 5 : 7,
        chartBarWidth: tiny ? 5 : compact ? 6 : 8,
        chartHeight: tiny ? 88 : compact ? 100 : 118,
        chartWidth: tiny ? 70 : compact ? 84 : 112,
        contentPaddingX: tiny ? 16 : compact ? 20 : 24,
        greeting: tiny ? 19 : compact ? 21 : 24,
        headerIcon: tiny ? 28 : compact ? 30 : 32,
        headerMarginBottom: tiny ? 18 : compact ? 22 : 26,
        monthPillFont: tiny ? 14 : compact ? 16 : 18,
        sectionGap: tiny ? 24 : compact ? 28 : 34,
        sectionTitle: tiny ? 23 : compact ? 24 : 27,
        spendingAmount: tiny ? 40 : compact ? 45 : 52,
        spendingComparison: tiny ? 15 : compact ? 16 : 18,
        spendingLabel: tiny ? 17 : compact ? 18 : 20,
        spendingMinHeight: tiny ? 160 : compact ? 172 : 190,
      },
      nav: {
        fabSize: tiny ? 56 : compact ? 60 : 68,
        height: tiny ? 72 : compact ? 78 : 86,
        iconBoxHeight: tiny ? 34 : compact ? 36 : 38,
        iconBoxWidth: tiny ? 40 : compact ? 42 : 46,
        iconSize: tiny ? 20 : compact ? 21 : 23,
        label: tiny ? 10 : 11,
        paddingBottom: tiny ? 8 : compact ? 10 : 14,
        paddingHorizontal: tiny ? 8 : compact ? 10 : 14,
        paddingTop: tiny ? 8 : compact ? 10 : 12,
      },
      screen: {
        contentPaddingX: tiny ? 14 : compact ? 16 : 18,
        bottomNavPadding: tiny ? 92 : compact ? 104 : 118,
      },
    };
  }, [fontScale, height, width]);
}
