import { Component, ErrorInfo, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error("Sora Expense recovered from a render error", error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Sora Expense</Text>
        <Text style={styles.message}>Something went wrong on this screen.</Text>
        <Pressable
          android_ripple={{ color: "#dbeafe" }}
          onPress={() => this.setState({ hasError: false })}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 999,
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  message: {
    color: "#64748b",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  screen: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "900",
  },
});
