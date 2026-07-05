import axios, { AxiosRequestConfig } from "axios";

import { API_BASE_URL } from "../config/api";

export const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

const GET_CACHE_TTL_MS = 30000;
const responseCache = new Map<string, { expiresAt: number; data: unknown }>();
const inFlightGets = new Map<string, Promise<unknown>>();

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") {
    return String(value ?? "");
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${key}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join("|");
}

function getCacheKey(url: string, config?: AxiosRequestConfig) {
  return `${url}?${stableStringify(config?.params)}`;
}

export async function cachedGet<T>(url: string, config?: AxiosRequestConfig, ttlMs = GET_CACHE_TTL_MS) {
  const key = getCacheKey(url, config);
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { data: cached.data as T };
  }

  const existing = inFlightGets.get(key);
  if (existing) {
    return { data: (await existing) as T };
  }

  const request = client.get<T>(url, config).then((response) => {
    responseCache.set(key, { data: response.data, expiresAt: Date.now() + ttlMs });
    return response.data;
  });
  inFlightGets.set(key, request);
  try {
    return { data: await request };
  } finally {
    inFlightGets.delete(key);
  }
}

export function clearApiCache() {
  responseCache.clear();
  inFlightGets.clear();
}

client.interceptors.response.use(
  (response) => {
    if ((response.config.method ?? "get").toLowerCase() !== "get") {
      clearApiCache();
    }
    return response;
  },
  (error) => {
    if ((error?.config?.method ?? "get").toLowerCase() !== "get") {
      clearApiCache();
    }
    return Promise.reject(error);
  }
);

export function setAuthToken(token: string | null) {
  clearApiCache();
  if (token) {
    client.defaults.headers.common.Authorization = `Token ${token}`;
  } else {
    delete client.defaults.headers.common.Authorization;
  }
}
