import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  WebView,
  WebViewMessageEvent,
} from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewRenderProcessGoneEvent,
} from "react-native-webview/lib/WebViewTypes";

import { API_BASE_URL } from "../config/api";
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

type VerificationStatus = "loading" | "ready" | "verified" | "error";

const TURNSTILE_TIMEOUT_MS = 14000;
const DEEP_LINK_PREFIX = "soraexpense://turnstile";

function getApiOrigin() {
  try {
    const url = new URL(API_BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://sora-expense-backend.onrender.com";
  }
}

function getChallengeUrl(theme: "light" | "dark", external = false) {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`;
  const redirect = external ? `&redirect=${encodeURIComponent(DEEP_LINK_PREFIX)}` : "";
  return `${base}auth/turnstile/?theme=${theme}${redirect}`;
}

function parseDeepLink(url: string) {
  if (!url.startsWith(DEEP_LINK_PREFIX)) {
    return null;
  }

  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return query.split("&").reduce<Record<string, string>>((params, pair) => {
    const [rawKey, rawValue = ""] = pair.split("=");
    if (!rawKey) return params;
    params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, " "));
    return params;
  }, {});
}

function isAllowedTurnstileNavigation(url: string) {
  if (url.startsWith(DEEP_LINK_PREFIX)) return true;
  if (url === "about:blank" || url.startsWith("about:srcdoc")) return true;
  if (url.startsWith("https://challenges.cloudflare.com/")) return true;
  return url.startsWith(getApiOrigin());
}

export function TurnstileBox({ resetKey, token, onError, onToken }: Props) {
  const { colors, themeMode } = useAppSettings();
  const [status, setStatus] = useState<VerificationStatus>(token ? "verified" : "loading");
  const [webViewKey, setWebViewKey] = useState(0);
  const challengeUrl = useMemo(() => getChallengeUrl(themeMode), [themeMode, resetKey, webViewKey]);
  const browserChallengeUrl = useMemo(() => getChallengeUrl(themeMode, true), [themeMode, resetKey, webViewKey]);

  const applyDeepLink = useCallback(
    (url: string) => {
      const params = parseDeepLink(url);
      if (!params) return false;

      if (params.token) {
        setStatus("verified");
        onError("");
        onToken(params.token);
        return true;
      }

      setStatus("error");
      onToken("");
      onError("Human verification could not finish. Try again.");
      return true;
    },
    [onError, onToken]
  );

  useEffect(() => {
    setStatus(token ? "verified" : "loading");
  }, [resetKey, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus((current) => {
        if (current === "loading") {
          onToken("");
          onError("Human verification is taking too long. Retry or use browser verification.");
          return "error";
        }
        return current;
      });
    }, TURNSTILE_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [challengeUrl, onError, onToken]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      applyDeepLink(event.url);
    });

    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl) applyDeepLink(initialUrl);
      })
      .catch(() => undefined);

    return () => subscription.remove();
  }, [applyDeepLink]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as TurnstileMessage;

      if (payload.type === "loaded") {
        setStatus((current) => (current === "verified" ? current : "ready"));
        return;
      }

      if (payload.type === "success") {
        setStatus("verified");
        onError("");
        onToken(payload.token);
        return;
      }

      if (payload.type === "expired") {
        onToken("");
        onError("Human verification expired. Try again.");
        return;
      }

      onToken("");
      setStatus("error");
      onError("Human verification failed to load. Try again.");
    } catch {
      onToken("");
      setStatus("error");
      onError("Human verification failed. Try again.");
    }
  };

  const retry = () => {
    setStatus("loading");
    onToken("");
    onError("");
    setWebViewKey((current) => current + 1);
  };

  const openBrowserVerification = () => {
    setStatus("loading");
    onError("");
    setWebViewKey((current) => current + 1);
    Linking.openURL(browserChallengeUrl).catch(() => {
      setStatus("error");
      onError("Could not open browser verification on this device.");
    });
  };

  const handleWebViewError = (event: WebViewErrorEvent) => {
    event.preventDefault();
    setStatus("error");
    onToken("");
    onError("Human verification could not load. Check your connection and try again.");
  };

  const handleHttpError = (event: WebViewHttpErrorEvent) => {
    const url = event.nativeEvent.url;
    if (!url.startsWith(getApiOrigin()) && !url.startsWith("https://challenges.cloudflare.com/")) {
      return;
    }

    setStatus("error");
    onToken("");
    onError("Human verification could not load. Retry or use browser verification.");
  };

  const handleRenderProcessGone = (_event: WebViewRenderProcessGoneEvent) => {
    setStatus("error");
    onToken("");
    onError("Human verification stopped on this Android WebView. Retry or use browser verification.");
  };

  const handleShouldStart = (request: ShouldStartLoadRequest) => {
    if (applyDeepLink(request.url)) {
      return false;
    }
    return isAllowedTurnstileNavigation(request.url);
  };

  const showOverlay = status === "loading" || status === "error" || status === "verified";

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <WebView
        key={`${themeMode}-${resetKey}-${webViewKey}`}
        allowFileAccess
        automaticallyAdjustContentInsets={false}
        cacheEnabled
        containerStyle={styles.webviewContainer}
        domStorageEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        onMessage={handleMessage}
        onError={handleWebViewError}
        onHttpError={handleHttpError}
        onRenderProcessGone={handleRenderProcessGone}
        onShouldStartLoadWithRequest={handleShouldStart}
        originWhitelist={["https://*", "http://*", "about:blank", "about:srcdoc", "soraexpense://*"]}
        renderError={() => <View />}
        scrollEnabled={false}
        source={{ uri: challengeUrl }}
        style={styles.webview}
        textZoom={100}
      />
      {showOverlay ? (
        <View pointerEvents={status === "loading" ? "none" : "auto"} style={[styles.overlay, { backgroundColor: colors.card }]}>
          {status === "loading" ? (
            <>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.statusText, { color: colors.muted }]}>Loading verification...</Text>
            </>
          ) : null}
          {status === "verified" ? (
            <Text style={[styles.statusText, styles.verifiedText, { color: colors.success }]}>Verified</Text>
          ) : null}
          {status === "error" ? (
            <View style={styles.errorActions}>
              <Text style={[styles.statusText, { color: colors.muted }]}>Verification did not load on this WebView.</Text>
              <View style={styles.actionRow}>
                <Pressable accessibilityRole="button" onPress={retry} style={[styles.actionButton, { backgroundColor: colors.border }]}>
                  <Text style={[styles.actionText, { color: colors.text }]}>Retry</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={openBrowserVerification} style={[styles.actionButton, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.actionText, { color: "#FFFFFF" }]}>Use browser</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    borderRadius: 999,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 10,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "800",
  },
  errorActions: {
    alignItems: "center",
    width: "100%",
  },
  overlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    top: 0,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  verifiedText: {
    marginTop: 0,
  },
  webviewContainer: {
    backgroundColor: "transparent",
  },
  webview: {
    backgroundColor: "transparent",
    height: 118,
    width: "100%",
  },
  wrap: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 118,
    marginBottom: 12,
    overflow: "hidden",
  },
});
