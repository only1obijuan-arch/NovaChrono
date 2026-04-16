import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useUser } from "@/utils/auth/useUser";
import { useAuth } from "@/utils/auth/useAuth";
import { useRouter } from "expo-router";
import { MapPin, LogOut, User as UserIcon } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#A42DB4";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();

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
              backgroundColor: "rgba(164,45,180,0.04)",
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
            color: "rgba(164,45,180,0.5)",
            letterSpacing: 4,
            marginBottom: 8,
          }}
        >
          // REFEREE PROFILE
        </Text>
        <Text
          style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
        >
          PROFILE
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
        {/* Avatar card */}
        <View
          style={{
            backgroundColor: "rgba(11,20,40,0.9)",
            borderWidth: 1,
            borderColor: "rgba(164,45,180,0.25)",
            borderRadius: 12,
            padding: 28,
            marginBottom: 16,
            alignItems: "center",
            borderTopWidth: 3,
            borderTopColor: C,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              backgroundColor: "rgba(164,45,180,0.1)",
              borderWidth: 2,
              borderColor: "rgba(164,45,180,0.4)",
              borderRadius: 40,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <UserIcon size={36} color={C} />
          </View>
          <Text
            style={{
              fontFamily: F.orbitronBold,
              fontSize: 18,
              color: "#F4F4F9",
              marginBottom: 10,
              letterSpacing: 1,
            }}
          >
            {user?.name || "REFEREE"}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(164,45,180,0.1)",
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: "rgba(164,45,180,0.3)",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#00FF9C",
              }}
            />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: C,
                letterSpacing: 2,
              }}
            >
              ACTIVE
            </Text>
          </View>
        </View>

        {/* Field assignment */}
        {user?.field_number && (
          <View
            style={{
              backgroundColor: "rgba(11,20,40,0.9)",
              borderWidth: 1,
              borderColor: "rgba(164,45,180,0.15)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                backgroundColor: "rgba(164,45,180,0.1)",
                borderWidth: 1,
                borderColor: "rgba(164,45,180,0.3)",
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MapPin size={24} color={C} />
            </View>
            <View>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(164,45,180,0.5)",
                  letterSpacing: 3,
                  marginBottom: 6,
                }}
              >
                ASSIGNED FIELD
              </Text>
              <Text style={{ fontFamily: F.orbitron, fontSize: 22, color: C }}>
                FIELD {user.field_number}
              </Text>
            </View>
          </View>
        )}

        {/* Account details */}
        <View
          style={{
            backgroundColor: "rgba(11,20,40,0.9)",
            borderWidth: 1,
            borderColor: "rgba(164,45,180,0.15)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              color: "rgba(164,45,180,0.5)",
              letterSpacing: 3,
              marginBottom: 20,
            }}
          >
            // ACCOUNT DETAILS
          </Text>
          <View style={{ gap: 18 }}>
            <View>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(164,45,180,0.4)",
                  letterSpacing: 3,
                  marginBottom: 6,
                }}
              >
                EMAIL
              </Text>
              <Text
                style={{
                  fontFamily: F.rajdhaniBold,
                  fontSize: 15,
                  color: "#F4F4F9",
                }}
              >
                {user?.email || "Not set"}
              </Text>
            </View>
            <View
              style={{ height: 1, backgroundColor: "rgba(164,45,180,0.08)" }}
            />
            <View>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(164,45,180,0.4)",
                  letterSpacing: 3,
                  marginBottom: 6,
                }}
              >
                ROLE
              </Text>
              <Text
                style={{
                  fontFamily: F.rajdhaniBold,
                  fontSize: 15,
                  color: "#F4F4F9",
                }}
              >
                {user?.role === "super_admin" ? "Super Admin" : "Referee"}
              </Text>
            </View>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={async () => {
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

        <View style={{ marginTop: 40, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 14,
              color: "rgba(164,45,180,0.2)",
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
