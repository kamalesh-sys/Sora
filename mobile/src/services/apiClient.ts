import axios from "axios";

import { API_BASE_URL } from "../config/api";

export const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function setAuthToken(token: string | null) {
  if (token) {
    client.defaults.headers.common.Authorization = `Token ${token}`;
  } else {
    delete client.defaults.headers.common.Authorization;
  }
}
