import * as SecureStore from "expo-secure-store";

export const BASE_URL = process.env.EXPO_PUBLIC_BASE_URL || "https://novachrono.app";
export const MOBILE_SECRET = process.env.EXPO_PUBLIC_MOBILE_SECRET || "";

const AUTH_KEY = "novachrono-jwt";

export async function getStoredAuth() {
  const raw = await SecureStore.getItemAsync(AUTH_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setStoredAuth(auth) {
  if (auth) {
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(auth));
  } else {
    await SecureStore.deleteItemAsync(AUTH_KEY);
  }
}

// Authenticated fetch — prepends BASE_URL and attaches Bearer token.
// path must start with "/"
export async function apiFetch(path, options = {}) {
  const stored = await getStoredAuth();
  console.log("apiFetch token:", stored?.token?.slice(0, 20), "path:", path);
  console.log("[token full]", stored?.token);
  const headers = {
    "Content-Type": "application/json",
    ...(stored?.token ? { Authorization: `Bearer ${stored.token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  return res;
}

// Sign in — calls mobile-signin, stores result, returns { token, user } or throws.
export async function signInWithCredentials(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/mobile-signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mobile-secret": MOBILE_SECRET,
    },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Sign in failed");
  }

  await setStoredAuth({ token: data.token, user: data.user });
  return data;
}

export async function signOut() {
  await setStoredAuth(null);
}

// Request a password reset email.
export async function requestPasswordReset(email) {
  const res = await fetch(`${BASE_URL}/api/auth/request-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Captain sign-up — creates account + team and joins a league.
export async function captainSignUp({ joinCode, name, email, password, teamName }) {
  const res = await fetch(`${BASE_URL}/api/account/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ joinCode, name, email, password, teamName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sign up failed");
  return data;
}
