export const API_BASE_URL = "https://sora-expense-backend.onrender.com/api";

const env = (globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

export const TURNSTILE_SITE_KEY =
  env?.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
