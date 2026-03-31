import * as React from "react";
import { useSession } from "@auth/create/react";

const useUser = () => {
  const { data: session, status } = useSession();
  const id = session?.user?.id;
  const [user, setUser] = React.useState(null);

  const fetchUser = React.useCallback(async (session) => {
    if (!session?.user?.id) {
      return null;
    }
    try {
      // Use universal profile endpoint — works for ALL roles
      const response = await fetch("/api/profile");
      if (!response.ok) {
        console.warn("useUser: Profile fetch failed, using session data");
        return session?.user || null;
      }
      const data = await response.json();
      return data.user || session?.user || null;
    } catch (error) {
      console.error("useUser: Error fetching profile:", error);
      return session?.user || null;
    }
  }, []);

  const refetchUser = React.useCallback(() => {
    if (id) {
      fetchUser(session).then(setUser);
    } else {
      setUser(null);
    }
  }, [fetchUser, id, session]);

  React.useEffect(refetchUser, [refetchUser]);

  return {
    user,
    data: user,
    loading: status === "loading" || (status === "authenticated" && !user),
    refetch: refetchUser,
  };
};

export { useUser };
export default useUser;
