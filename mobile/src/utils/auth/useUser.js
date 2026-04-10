import { useAuth } from "./useAuth";

export const useUser = () => {
  const { auth, isReady } = useAuth();
  return { user: auth?.user ?? null, loading: !isReady };
};

export default useUser;
