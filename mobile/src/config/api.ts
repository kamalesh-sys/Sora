const env = (globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

export const API_BASE_URL =
  env?.EXPO_PUBLIC_API_BASE_URL ?? "https://sora-expense-backend.onrender.com/api";
