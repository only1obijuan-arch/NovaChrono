// Login screen
import { useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, useRef } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/utils/auth/useAuth";
import { useAuthModal } from "@/utils/auth/store";
import { Timer } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth, isReady } = useAuth();
  const { open } = useAuthModal();

  // Route based on role once authenticated
  useEffect(() => {
    if (!isReady || !auth?.user) return;
    const role = auth.user.role;
    if (role === "captain") {
      router.replace("/(captain-tabs)");
    } else if (role === "referee") {
      router.replace("/(referee-tabs)");
    } else if (role === "venue_admin") {
      router.replace("/(admin-tabs)");
    } else if (role === "super_admin") {
      // Super admin — let them choose captain or referee view
      router.replace("/auth/role-select");
    } else {
      // Default fallback
      router.replace("/(captain-tabs)");
    }
  }, [auth, isReady]);

  const handleSignIn = () => open({ mode: "signin" });
  const handleForgotPassword = () => open({ mode: "forgot-password" });

  return (
    <View style={{ flex: 1, backgroundColor: "#091833" }}>
      <StatusBar style="light" />

      {/* Grid background */}
      <View style={{ position: "absolute", inset: 0 }} pointerEvents="none">
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={`h${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * 60,
              height: 1,
              backgroundColor: "rgba(0,245,212,0.05)",
            }}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={`v${i}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: i * 60,
              width: 1,
              backgroundColor: "rgba(0,245,212,0.03)",
            }}
          />
        ))}
      </View>

      {/* Glow */}
      <View
        style={{
          position: "absolute",
          top: -150,
          left: -150,
          width: 400,
          height: 400,
          borderRadius: 200,
          backgroundColor: "rgba(0,245,212,0.04)",
        }}
        pointerEvents="none"
      />
      <View
        style={{
          position: "absolute",
          bottom: -150,
          right: -150,
          width: 400,
          height: 400,
          borderRadius: 200,
          backgroundColor: "rgba(255,0,204,0.03)",
        }}
        pointerEvents="none"
      />

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 40,
          paddingHorizontal: 28,
          paddingBottom: insets.bottom + 24,
          justifyContent: "space-between",
        }}
      >
        {/* Logo section */}
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 88,
              height: 88,
              backgroundColor: "rgba(0,245,212,0.08)",
              borderWidth: 2,
              borderColor: "rgba(0,245,212,0.4)",
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Timer size={40} color="#00F5D4" />
          </View>

          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 32,
              color: "#00F5D4",
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            NOVACHRONO
          </Text>
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              color: "rgba(0,245,212,0.4)",
              letterSpacing: 3,
              marginBottom: 48,
            }}
          >
            // TIME PAUSES. YOUR LEAGUE NEVER DOES.
          </Text>

          {/* Feature pills */}
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {["CAPTAINS", "REFEREES", "ADMINS"].map((label, i) => {
              const colors = ["#00FF9C", "#A42DB4", "#FF00CC"];
              return (
                <View
                  key={label}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: `${colors[i]}40`,
                    backgroundColor: `${colors[i]}08`,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9,
                      color: colors[i],
                      letterSpacing: 2,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Login section */}
        <View>
          {/* Sign in button */}
          <TouchableOpacity
            onPress={handleSignIn}
            activeOpacity={0.8}
            style={{
              height: 60,
              backgroundColor: "rgba(0,245,212,0.1)",
              borderWidth: 1,
              borderColor: "#00F5D4",
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 15,
                color: "#00F5D4",
                letterSpacing: 3,
              }}
            >
              SIGN IN →
            </Text>
          </TouchableOpacity>

          {/* Forgot password */}
          <TouchableOpacity
            onPress={handleForgotPassword}
            activeOpacity={0.7}
            style={{ alignItems: "center", paddingVertical: 12 }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(0,245,212,0.4)",
                letterSpacing: 2,
              }}
            >
              FORGOT PASSWORD?
            </Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 9,
              color: "rgba(180,200,220,0.15)",
              letterSpacing: 2,
              textAlign: "center",
              marginTop: 16,
            }}
          >
            © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
          </Text>
        </View>
      </View>
    </View>
  );
}