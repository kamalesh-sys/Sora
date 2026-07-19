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
        actionIcon: tiny ? 56 : compact ? 62 : 76,
        actionIconSize: tiny ? 26 : compact ? 28 : 32,
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
        headerIcon: tiny ? 30 : compact ? 32 : 34,
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
        fabSize: tiny ? 60 : compact ? 64 : 72,
        height: tiny ? 76 : compact ? 82 : 90,
        iconBoxHeight: tiny ? 36 : compact ? 38 : 42,
        iconBoxWidth: tiny ? 44 : compact ? 46 : 52,
        iconSize: tiny ? 24 : compact ? 26 : 28,
        label: tiny ? 10 : 11,
        paddingBottom: tiny ? 8 : compact ? 10 : 14,
        paddingHorizontal: tiny ? 8 : compact ? 10 : 14,
        paddingTop: tiny ? 8 : compact ? 10 : 12,
      },
      screen: {
        contentPaddingX: tiny ? 14 : compact ? 16 : 18,
        bottomNavPadding: tiny ? 96 : compact ? 108 : 124,
      },
    };
  }, [fontScale, height, width]);
}
