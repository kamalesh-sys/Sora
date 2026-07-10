"use no memo";

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { translate } from "../i18n/catalogs";
import type { SoraExpenseWidgetData } from "./widgetTypes";

const widgetColors = {
  accent: "#2563EB",
  accentDark: "#60A5FA",
  card: "#FFFFFF",
  cardDark: "#111827",
  border: "#E5E7EB",
  borderDark: "#243244",
  muted: "#64748B",
  mutedDark: "#A7B0C0",
  soft: "#EFF6FF",
  softDark: "#1E3A5F",
  text: "#071226",
  textDark: "#F8FAFC",
} as const;

function widgetContent(data: SoraExpenseWidgetData, dark = false) {
  const t = (message: string) => translate(data.language, message);
  const colors = {
    accent: dark ? widgetColors.accentDark : widgetColors.accent,
    card: dark ? widgetColors.cardDark : widgetColors.card,
    border: dark ? widgetColors.borderDark : widgetColors.border,
    muted: dark ? widgetColors.mutedDark : widgetColors.muted,
    soft: dark ? widgetColors.softDark : widgetColors.soft,
    text: dark ? widgetColors.textDark : widgetColors.text,
  };

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: "soraexpense://expenses" }}
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 22,
        borderWidth: 1,
        flexDirection: "column",
        height: "match_parent",
        justifyContent: "space-between",
        padding: 12,
        width: "match_parent",
      }}
    >
      <FlexWidget style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <FlexWidget style={{ flex: 1, flexDirection: "column", paddingRight: 10 }}>
          <TextWidget
            maxLines={1}
            style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}
            text="Sora Expense"
            truncate="END"
          />
          <TextWidget
            maxLines={1}
            style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}
            text={t("Recent expense")}
            truncate="END"
          />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: "soraexpense://add-expense" }}
          style={{
            alignItems: "center",
            backgroundColor: colors.accent,
            borderRadius: 20,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <TextWidget
            allowFontScaling={false}
            style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "400", textAlign: "center" }}
            text="+"
          />
        </FlexWidget>
      </FlexWidget>

      {data.hasExpense ? (
        <FlexWidget
          style={{
            alignItems: "center",
            backgroundColor: colors.soft,
            borderRadius: 16,
            flexDirection: "row",
            marginTop: 10,
            padding: 10,
          }}
        >
          <FlexWidget style={{ flex: 1, flexDirection: "column", paddingRight: 10 }}>
            <TextWidget
              maxLines={1}
              style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}
              text={data.title}
              truncate="END"
            />
            <TextWidget
              maxLines={1}
              style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}
              text={`${data.category} - ${data.paymentMethod} - ${data.dateLabel}`}
              truncate="END"
            />
          </FlexWidget>
          <TextWidget
            maxLines={1}
            style={{ color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right", width: 82 }}
            text={data.amount}
            truncate="END"
          />
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            backgroundColor: colors.soft,
            borderRadius: 16,
            flexDirection: "column",
            marginTop: 10,
            padding: 10,
          }}
        >
          <TextWidget
            maxLines={1}
            style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}
            text={t("No expense yet")}
            truncate="END"
          />
          <TextWidget
            maxLines={2}
            style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}
            text={t("Tap plus to add your first entry.")}
            truncate="END"
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

export function SoraExpenseWidget(data: SoraExpenseWidgetData) {
  return {
    dark: widgetContent(data, true),
    light: widgetContent(data),
  };
}
