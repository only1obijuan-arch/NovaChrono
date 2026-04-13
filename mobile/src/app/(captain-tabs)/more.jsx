import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Users,
  FileText,
  LogOut,
} from "lucide-react-native";
import { apiFetch } from "@/utils/api";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#00FF9C";

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: team } = useQuery({
    queryKey: ["captain-team"],
    queryFn: async () => {
      const res = await apiFetch("/api/captain/team");
      const data = await res.json();
      return data.team ?? null;
    },
  });

  const menuItems = [
    {
      icon: Users,
      label: "Manage Players",
      sub: "Add, remove or edit your squad",
      onPress: () => router.push("/players/manage"),
      color: C,
    },
    {
      icon: FileText,
      label: "League Rules",
      sub: "Match format, fair play & points",
      onPress: () => {
        if (team?.league_id) router.push(`/rules/${team.league_id}`);
      },
      color: "#00F5D4",
      disabled: !team?.league_id,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#091833" }}>
      <StatusBar style="light" />

      {/* Grid bg */}
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
              backgroundColor: "rgba(0,255,156,0.04)",
            }}
          />
        ))}
      </View>

      {/* Header */}
      <View
        style={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 16 }}
      >
        <Text
          style={{
            fontFamily: F.mono,
            fontSize: 10,
            color: "rgba(0,255,156,0.5)",
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
        {/* Team card */}
        {team && (
          <View
            style={{
              marginBottom: 28,
              backgroundColor: "rgba(11,20,40,0.9)",
              borderWidth: 1,
              borderColor: "rgba(0,255,156,0.2)",
              borderRadius: 12,
              padding: 20,
              borderLeftWidth: 3,
              borderLeftColor: C,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(0,255,156,0.4)",
                letterSpacing: 3,
                marginBottom: 10,
              }}
            >
              // YOUR TEAM
            </Text>
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 20,
                color: "#F4F4F9",
                marginBottom: 4,
              }}
            >
              {team.name}
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 14,
                color: "rgba(0,255,156,0.6)",
                marginBottom: 16,
              }}
            >
              {team.league_name}
            </Text>
            {team.join_code && (
              <View
                style={{
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(0,255,156,0.1)",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 3,
                    marginBottom: 6,
                  }}
                >
                  JOIN CODE
                </Text>
                <Text
                  style={{
                    fontFamily: F.orbitron,
                    fontSize: 20,
                    color: C,
                    letterSpacing: 4,
                  }}
                >
                  {team.join_code}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Menu items */}
        <View style={{ marginBottom: 28, gap: 10 }}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              disabled={item.disabled}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(11,20,40,0.9)",
                borderWidth: 1,
                borderColor: "rgba(0,255,156,0.1)",
                borderRadius: 10,
                padding: 16,
                opacity: item.disabled ? 0.4 : 1,
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
              <ChevronRight size={18} color="rgba(0,255,156,0.3)" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={async () => {
            const { signOut } = await import("@/utils/api");
            await signOut();
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

        {/* Footer */}
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 14,
              color: "rgba(0,245,212,0.2)",
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
