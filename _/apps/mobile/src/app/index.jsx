import { Redirect } from "expo-router";
import { View, Text } from "react-native";
import { useUser } from "@/utils/auth/useUser";

export default function Index() {
  const { user, loading } = useUser();

  if (loading) {
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
            fontFamily: "ShareTechMono_400Regular",
            letterSpacing: 4,
            fontSize: 12,
          }}
        >
          LOADING...
        </Text>
      </View>
    );
  }

  if (!user) return <Redirect href="/auth/login" />;

  if (user.role === "captain") return <Redirect href="/(captain-tabs)" />;
  if (user.role === "referee") return <Redirect href="/(referee-tabs)" />;
  if (user.role === "venue_admin") return <Redirect href="/(admin-tabs)" />;
  if (user.role === "org_admin") return <Redirect href="/(admin-tabs)" />;
  if (user.role === "super_admin") return <Redirect href="/auth/role-select" />;

  return <Redirect href="/auth/login" />;
}