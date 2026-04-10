import { create } from "zustand";
import { getStoredAuth, setStoredAuth } from "@/utils/api";

/**
 * Central auth store.
 * auth shape: { token: string, user: { id, email, name, role, venue_id, organization_id } }
 */
export const useAuthStore = create((set) => ({
  isReady: false,
  auth: null,
  setAuth: (auth) => {
    setStoredAuth(auth);
    set({ auth });
  },
  initiate: async () => {
    const stored = await getStoredAuth();
    set({ auth: stored ?? null, isReady: true });
  },
}));
