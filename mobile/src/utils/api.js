import * as SecureStore from "expo-secure-store";

export const BASE_URL = process.env.EXPO_PUBLIC_BASE_URL || "https://novachrono.app";
export const MOBILE_SECRET = process.env.EXPO_PUBLIC_MOBILE_SECRET || "";

const AUTH_KEY = "novachrono-jwt";
const TWO_DAYS_S = 2 * 24 * 60 * 60;

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

function getTokenExp(token) {
  try {
    const seg = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(seg)).exp ?? 0;
  } catch {
    return 0;
  }
}

// Single in-flight refresh promise — prevents concurrent requests from each
// firing a separate refresh (the server atomically revokes the old JTI on the
// first successful refresh, so subsequent calls with the same token would fail).
let refreshPromise = null;

async function tryRefreshToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const stored = await getStoredAuth();
      if (!stored?.token) return null;
      const res = await fetch(`${BASE_URL}/api/auth/mobile-refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${stored.token}` },
      });
      if (!res.ok) {
        await setStoredAuth(null);
        return null;
      }
      const data = await res.json();
      await setStoredAuth({ token: data.token, user: data.user });
      return data.token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// Authenticated fetch — prepends BASE_URL and attaches Bearer token.
// Proactively refreshes if the token expires within 2 days; retries once on 401.
// path must start with "/"
export async function apiFetch(path, options = {}) {
  let stored = await getStoredAuth();

  if (stored?.token) {
    const exp = getTokenExp(stored.token);
    if (exp > 0 && exp - Math.floor(Date.now() / 1000) < TWO_DAYS_S) {
      await tryRefreshToken();
      stored = await getStoredAuth();
    }
  }

  const makeHeaders = (token) => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  });

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: makeHeaders(stored?.token),
  });

  if (res.status === 401 && stored?.token) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: makeHeaders(newToken),
      });
    }
  }

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
  const stored = await getStoredAuth();
  if (stored?.token) {
    try {
      await fetch(`${BASE_URL}/api/auth/mobile-signout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${stored.token}` },
      });
    } catch {
      // offline or server error — proceed with local clear regardless
    }
  }
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
