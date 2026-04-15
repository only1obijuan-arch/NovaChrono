import { create } from "zustand";
import { getStoredAuth, setStoredAuth } from "@/utils/api";

export const useAuthStore = create((set) => ({
  isReady: false,
  auth: null,
  setAuth: async (auth) => {
    set({ auth });
    await setStoredAuth(auth);
  },
  initiate: async () => {
    const stored = await getStoredAuth();
    set({ auth: stored ?? null, isReady: true });
  },
}));