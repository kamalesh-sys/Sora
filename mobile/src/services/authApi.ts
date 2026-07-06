import { AuthResponse, AppUser } from "../types/auth";
import { client } from "./apiClient";

export async function registerWithEmail(
  name: string,
  email: string,
  password: string,
  turnstileToken: string
) {
  const response = await client.post<AuthResponse>("/auth/register/", {
    name,
    email,
    password,
    turnstile_token: turnstileToken,
  });
  return response.data;
}

export async function loginWithEmail(email: string, password: string, turnstileToken: string) {
  const response = await client.post<AuthResponse>("/auth/login/", {
    email,
    password,
    turnstile_token: turnstileToken,
  });
  return response.data;
}

export async function getMe() {
  const response = await client.get<AppUser>("/auth/me/");
  return response.data;
}

export async function logoutOnServer() {
  await client.post("/auth/logout/");
}
