import { useAuthStore } from "./store";
import { signOut as apiSignOut } from "@/utils/api";
import { useCallback } from "react";

export const useAuth = () => {
  const { isReady, auth, setAuth, initiate } = useAuthStore();

  const signOut = useCallback(async () => {
    await apiSignOut();
    setAuth(null);
  }, [setAuth]);

  return {
    isReady,
    isAuthenticated: isReady ? !!auth : null,
    auth,
    setAuth,
    initiate,
    signOut,
  };
};

export default useAuth;
