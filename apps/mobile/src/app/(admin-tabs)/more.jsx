// More screen
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/utils/auth/useUser";
import { useAuth } from "@/utils/auth/useAuth";
import { useRouter } from "expo-router";
import { Users, Timer, LogOut, ChevronRight, Globe } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#FF00CC";

export default function AdminMore() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile");
      return res.json();
    },
    enabled: !!user,
  });

  const menuItems = [
    {
      icon: Users,
      label: "Captain View",
      sub: "Switch to team captain portal",
      color: "#00FF9C",
      onPress: () => router.replace("/(captain-tabs)"),
    },
    {
      icon: Timer,
      label: "Referee View",
      sub: "Switch to referee match kiosk",
      color: "#A42DB4",
      onPress: () => router.replace("/(referee-tabs)"),
    },
    {
      icon: Globe,
      label: "Web Admin Panel",
      sub: "Full admin features on web",
      color: "#00F5D4",
      onPress: () => {}, // Could open webview or link
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#091833" }}>
      <StatusBar style="light" />
      <View style={{ position: "absolute", inset: 0 }} pointerEvents="none">
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * 60,
              height: 1,
              backgroundColor: "rgba(255,0,204,0.04)",
            }}
          />
        ))}
      </View>

      <View
        style={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 16 }}
      >
        <Text
          style={{
            fontFamily: F.mono,
            fontSize: 10,
            color: "rgba(255,0,204,0.5)",
            letterSpacing: 4,
            marginBottom: 8,
          }}
        >
          // SETTINGS
        </Text>
        <Text
          style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
        >
          MORE
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Admin profile card */}
        <View
          style={{
            backgroundColor: "rgba(11,20,40,0.9)",
            borderWidth: 1,
            borderColor: "rgba(255,0,204,0.2)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            borderTopWidth: 3,
            borderTopColor: C,
          }}
        >
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              color: "rgba(255,0,204,0.4)",
              letterSpacing: 3,
              marginBottom: 10,
            }}
          >
            // VENUE ADMIN
          </Text>
          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 18,
              color: "#F4F4F9",
              marginBottom: 4,
            }}
          >
            {adminProfile?.user?.venue_name || "Loading..."}
          </Text>
          <Text
            style={{
              fontFamily: F.rajdhani,
              fontSize: 14,
              color: "rgba(255,0,204,0.5)",
            }}
          >
            {adminProfile?.user?.name || user?.email}
          </Text>
        </View>

        {/* Switch view options */}
        <Text
          style={{
            fontFamily: F.mono,
            fontSize: 10,
            color: "rgba(255,0,204,0.4)",
            letterSpacing: 3,
            marginBottom: 12,
          }}
        >
          // SWITCH VIEW
        </Text>
        <View style={{ gap: 10, marginBottom: 28 }}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(11,20,40,0.9)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.1)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  backgroundColor: `${item.color}12`,
                  borderWidth: 1,
                  borderColor: `${item.color}30`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 16,
                }}
              >
                <item.icon size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: F.rajdhaniBold,
                    fontSize: 16,
                    color: "#F4F4F9",
                    marginBottom: 2,
                  }}
                >
                  {item.label}
                </Text>
                <Text
                  style={{
                    fontFamily: F.rajdhani,
                    fontSize: 13,
                    color: "rgba(180,200,220,0.4)",
                  }}
                >
                  {item.sub}
                </Text>
              </View>
              <ChevronRight size={18} color="rgba(255,0,204,0.3)" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={() => {
            signOut();
            router.replace("/auth/login");
          }}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,50,50,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,50,50,0.2)",
            borderRadius: 10,
            padding: 16,
            gap: 12,
          }}
        >
          <LogOut size={18} color="rgba(255,80,80,0.8)" />
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 12,
              color: "rgba(255,80,80,0.8)",
              letterSpacing: 2,
            }}
          >
            SIGN OUT
          </Text>
        </TouchableOpacity>

        <View style={{ marginTop: 40, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 14,
              color: "rgba(255,0,204,0.2)",
              letterSpacing: 4,
              marginBottom: 4,
            }}
          >
            NOVACHRONO
          </Text>
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 9,
              color: "rgba(180,200,220,0.15)",
              letterSpacing: 2,
            }}
          >
            // TIME PAUSES. YOUR LEAGUE NEVER DOES.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
