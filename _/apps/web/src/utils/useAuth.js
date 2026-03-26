import { useCallback } from "react";
import { signIn, signOut } from "@auth/create/react";

function useAuth() {
  const callbackUrl =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("callbackUrl")
      : null;

  const signInWithCredentials = useCallback(
    (options) => {
      return signIn("credentials", {
        ...options,
        isSignup: "false",
        callbackUrl: callbackUrl ?? options.callbackUrl,
      });
    },
    [callbackUrl],
  );

  const signUpWithCredentials = useCallback(
    (options) => {
      return signIn("credentials", {
        ...options,
        isSignup: "true",
        callbackUrl: callbackUrl ?? options.callbackUrl,
      });
    },
    [callbackUrl],
  );

  const signInWithGoogle = useCallback(
    (options) => {
      return signIn("google", {
        ...options,
        callbackUrl: callbackUrl ?? options.callbackUrl,
      });
    },
    [callbackUrl],
  );
  const signInWithFacebook = useCallback((options) => {
    return signIn("facebook", options);
  }, []);
  const signInWithTwitter = useCallback((options) => {
    return signIn("twitter", options);
  }, []);
  const signInWithApple = useCallback(
    (options) => {
      return signIn("apple", {
        ...options,
        callbackUrl: callbackUrl ?? options.callbackUrl,
      });
    },
    [callbackUrl],
  );

  return {
    signInWithCredentials,
    signUpWithCredentials,
    signInWithGoogle,
    signInWithFacebook,
    signInWithTwitter,
    signInWithApple,
    signOut,
  };
}

export default useAuth;
