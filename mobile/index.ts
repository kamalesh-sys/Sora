import "react-native-gesture-handler";

import { registerRootComponent } from "expo";

import App from "./App";

declare const require: (moduleName: string) => unknown;

registerRootComponent(App);

try {
  const widgetModule = require("react-native-android-widget") as typeof import("react-native-android-widget");
  const widgetHandlerModule = require("./src/widgets/widgetTaskHandler") as typeof import("./src/widgets/widgetTaskHandler");

  widgetModule.registerWidgetTaskHandler(widgetHandlerModule.widgetTaskHandler);
} catch (error) {
  if (__DEV__) {
    console.warn("Sora Expense Android widget is available only in a custom native Android build.", error);
  }
}
