import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { API_BASE_URL, TURNSTILE_SITE_KEY } from "../config/api";
import { useAppSettings } from "../context/AppSettingsContext";

type TurnstileMessage =
  | { type: "success"; token: string }
  | { type: "expired" }
  | { type: "error"; error?: string };

type Props = {
  resetKey: number;
  token: string;
  onError: (message: string) => void;
  onToken: (token: string) => void;
};

function getBaseUrl() {
  try {
    const url = new URL(API_BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://sora-expense-backend.onrender.com";
  }
}

function buildHtml(theme: "light" | "dark") {
  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
    <style>
      html, body {
        background: transparent;
        margin: 0;
        min-height: 78px;
        overflow: hidden;
      }
      body {
        align-items: center;
        display: flex;
        justify-content: center;
      }
    </style>
  </head>
  <body>
    <div id="turnstile"></div>
    <script>
      function send(payload) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      window.onload = function () {
        if (!window.turnstile) {
          send({ type: "error", error: "Turnstile did not load." });
          return;
        }
        window.turnstile.render("#turnstile", {
          sitekey: "${TURNSTILE_SITE_KEY}",
          theme: "${theme}",
          callback: function(token) {
            send({ type: "success", token: token });
          },
          "expired-callback": function() {
            send({ type: "expired" });
          },
          "error-callback": function(error) {
            send({ type: "error", error: String(error || "unknown") });
          }
        });
      };
    </script>
  </body>
</html>`;
}

export function TurnstileBox({ resetKey, token, onError, onToken }: Props) {
  const { colors, themeMode } = useAppSettings();
  const html = useMemo(() => buildHtml(themeMode), [themeMode, resetKey]);
  const baseUrl = useMemo(getBaseUrl, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as TurnstileMessage;
      if (payload.type === "success") {
        onToken(payload.token);
        return;
      }
      if (payload.type === "expired") {
        onToken("");
        onError("Human verification expired. Try again.");
        return;
      }
      onToken("");
      onError("Human verification failed to load. Try again.");
    } catch {
      onToken("");
      onError("Human verification failed. Try again.");
    }
  };

  return (
    <View style={[styles.wrap, { borderColor: token ? colors.success : colors.border }]}>
      <WebView
        key={`${themeMode}-${resetKey}`}
        automaticallyAdjustContentInsets={false}
        domStorageEnabled
        javaScriptEnabled
        onMessage={handleMessage}
        originWhitelist={["https://*", "http://*", "about:blank"]}
        scrollEnabled={false}
        source={{ baseUrl, html }}
        style={styles.webview}
      />
      <Text style={[styles.status, { color: token ? colors.success : colors.muted }]}>
        {token ? "Human verification ready" : "Complete human verification"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  webview: {
    backgroundColor: "transparent",
    height: 78,
    width: "100%",
  },
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
    paddingVertical: 8,
  },
});
