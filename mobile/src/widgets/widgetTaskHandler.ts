import type { WidgetTaskHandler } from "react-native-android-widget";

import { renderSoraExpenseWidget, SORA_EXPENSE_WIDGET_NAME } from "./widgetStorage";

export const widgetTaskHandler: WidgetTaskHandler = async ({ renderWidget, widgetInfo }) => {
  if (widgetInfo.widgetName !== SORA_EXPENSE_WIDGET_NAME) {
    return;
  }

  renderWidget(await renderSoraExpenseWidget());
};
