import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { API_BASE_URL, TURNSTILE_SITE_KEY } from "../config/api";
import { useAppSettings } from "../context/AppSettingsContext";

type TurnstileMessage =
  | { type: "success"; token: string }
  | { type: "expired" }
  | { type: "error"; error?: string }
  | { type: "loaded" };

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

    <style>
      html, body {
        background: transparent;
        margin: 0;
        min-height: 110px;
        overflow: hidden;
      }

      body {
        align-items: center;
        display: flex;
        justify-content: center;
      }

      .cf-turnstile {
        min-height: 70px;
      }
    </style>

    <script>
      function send(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      window.onTurnstileSuccess = function(token) {
        send({ type: "success", token: token });
      };

      window.onTurnstileExpired = function() {
        send({ type: "expired" });
      };

      window.onTurnstileError = function(error) {
        send({
          type: "error",
          error: String(error || "unknown")
        });
      };

      window.onloadTurnstile = function() {
        send({ type: "loaded" });
      };
    </script>
  </head>

  <body>
    <div
      class="cf-turnstile"
      data-sitekey="${TURNSTILE_SITE_KEY}"
      data-theme="${theme}"
      data-callback="onTurnstileSuccess"
      data-expired-callback="onTurnstileExpired"
      data-error-callback="onTurnstileError"
    ></div>

    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstile"
      async
      defer
    ></script>
  </body>
</html>`;
}

export function TurnstileBox({ resetKey, token, onError, onToken }: Props) {
  const { themeMode } = useAppSettings();
  const html = useMemo(() => buildHtml(themeMode), [themeMode, resetKey]);
  const baseUrl = useMemo(getBaseUrl, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as TurnstileMessage;

      if (payload.type === "loaded") {
        return;
      }

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
      onError(
        payload.error
          ? `Human verification failed: ${payload.error}`
          : "Human verification failed to load. Try again."
      );
    } catch {
      onToken("");
      onError("Human verification failed. Try again.");
    }
  };

  return (
    <View style={styles.wrap}>
      <WebView
        key={`${themeMode}-${resetKey}`}
        automaticallyAdjustContentInsets={false}
        domStorageEnabled
        javaScriptEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="compatibility"
        onMessage={handleMessage}
        onError={(event) => {
          onToken("");
          onError(`Human verification WebView error: ${event.nativeEvent.description}`);
        }}
        onHttpError={(event) => {
          onToken("");
          onError(`Human verification HTTP error: ${event.nativeEvent.statusCode}`);
        }}
        originWhitelist={["*"]}
        scrollEnabled={false}
        source={{ baseUrl, html }}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {
    backgroundColor: "transparent",
    height: 110,
    width: "100%",
  },
  wrap: {
    marginBottom: 12,
    overflow: "hidden",
  },
});
