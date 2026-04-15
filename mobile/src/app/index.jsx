import { Redirect } from "expo-router";
import { View, Text } from "react-native";
import { useAuth } from "@/utils/auth/useAuth";

export default function Index() {
  const { auth, isReady } = useAuth();

  // Show loading while auth is initializing
  if (!isReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#091833",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderWidth: 3,
            borderColor: "#00F5D4",
            borderTopColor: "transparent",
            borderRadius: 24,
            marginBottom: 16,
          }}
        />
        <Text
          style={{
            color: "#00F5D4",
letterSpacing: 4,
            fontSize: 12,
          }}
        >
          LOADING...
        </Text>
      </View>
    );
  }

  // If not authenticated, redirect to welcome screen which will trigger AuthModal
  if (!auth) return <Redirect href="/auth/login" />;

  // Route based on user role
  const role = auth.user?.role;
  if (role === "referee") return <Redirect href="/(referee-tabs)" />;
  if (role === "captain") return <Redirect href="/(captain-tabs)" />;
  if (role === "venue_admin" || role === "org_admin" || role === "super_admin")
    return <Redirect href="/(captain-tabs)" />;
  return <Redirect href="/auth/login" />;
}
