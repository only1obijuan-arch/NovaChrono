import { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Users, Timer, Shield, ChevronLeft } from "lucide-react-native";
import { useAuth } from "@/utils/auth/useAuth";

const { width } = Dimensions.get("window");

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};

export default function RoleSelect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth, signOut } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isSuperAdmin = auth?.user?.role === "super_admin";

  return (
    <View style={{ flex: 1, backgroundColor: "#091833" }}>
      <StatusBar style="light" />

      {/* Grid background */}
      <View
        style={{ position: "absolute", inset: 0, opacity: 0.4 }}
        pointerEvents="none"
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={`h${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * 60,
              height: 1,
              backgroundColor: "rgba(0,245,212,0.06)",
            }}
          />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <View
            key={`v${i}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: i * (width / 9),
              width: 1,
              backgroundColor: "rgba(0,245,212,0.06)",
            }}
          />
        ))}
      </View>

      <View
        style={{
          position: "absolute",
          top: -200,
          left: -200,
          width: 500,
          height: 500,
          borderRadius: 250,
          backgroundColor: "rgba(0,245,212,0.04)",
        }}
        pointerEvents="none"
      />

      <Animated.View
        style={{
          flex: 1,
          paddingTop: insets.top + 16,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {/* Back / sign out row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <ChevronLeft size={16} color="rgba(0,245,212,0.5)" />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 11,
                color: "rgba(0,245,212,0.5)",
                letterSpacing: 2,
              }}
            >
              BACK
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              signOut();
              router.replace("/auth/login");
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: "rgba(255,80,80,0.2)",
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(255,80,80,0.6)",
                letterSpacing: 2,
              }}
            >
              SIGN OUT
            </Text>
          </TouchableOpacity>
        </View>

        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              color: "rgba(0,245,212,0.5)",
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            // SELECT ACCESS LEVEL
          </Text>
          <Text
            style={{
              fontFamily: F.orbitronBold,
              fontSize: 22,
              color: "#F4F4F9",
              letterSpacing: 2,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            CHOOSE YOUR VIEW
          </Text>
          <Text
            style={{
              fontFamily: F.rajdhani,
              fontSize: 14,
              color: "rgba(180,200,220,0.4)",
              textAlign: "center",
            }}
          >
            Logged in as {auth?.user?.name || auth?.user?.email}
          </Text>
        </View>

        {/* Admin card — venue_admin only */}
        {!isSuperAdmin && (
          <>
            <RoleCard
              onPress={() => router.replace("/(captain-tabs)")}
              color="#FF00CC"
              icon={<Shield size={28} color="#FF00CC" />}
              badge="ADMIN"
              title="VENUE ADMIN"
              description="Manage leagues, teams, referees and fixtures"
            />
            <View style={{ height: 14 }} />
          </>
        )}

        {/* Captain card */}
        <RoleCard
          onPress={() => router.replace("/(captain-tabs)")}
          color="#00FF9C"
          icon={<Users size={28} color="#00FF9C" />}
          badge="CAPTAIN"
          title="TEAM CAPTAIN"
          description="Manage your squad, view fixtures and track standings"
        />

        <View style={{ height: 14 }} />

        {/* Referee card */}
        <RoleCard
          onPress={() => router.replace("/(referee-tabs)")}
          color="#A42DB4"
          icon={<Timer size={28} color="#A42DB4" />}
          badge="REF MODE"
          title="REFEREE"
          description="Control matches and record live scores on the pitch"
        />

        {/* Super admin note */}
        {isSuperAdmin && (
          <View
            style={{
              marginTop: 20,
              backgroundColor: "rgba(255,200,0,0.04)",
              borderWidth: 1,
              borderColor: "rgba(255,200,0,0.15)",
              borderRadius: 8,
              padding: 14,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(255,200,0,0.5)",
                letterSpacing: 2,
                textAlign: "center",
              }}
            >
              // SUPER ADMIN — FULL PLATFORM ACCESS VIA WEB
            </Text>
          </View>
        )}

        <Text
          style={{
            fontFamily: F.mono,
            fontSize: 9,
            color: "rgba(180,200,220,0.15)",
            letterSpacing: 3,
            textAlign: "center",
            marginTop: "auto",
            paddingTop: 32,
          }}
        >
          © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
        </Text>
      </Animated.View>
    </View>
  );
}

function RoleCard({ onPress, color, icon, badge, title, description }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scaleAnim, {
            toValue: 0.97,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
          }).start()
        }
        activeOpacity={1}
        style={{
          backgroundColor: "rgba(11,20,40,0.9)",
          borderWidth: 1,
          borderColor: `${color}30`,
          borderRadius: 12,
          padding: 22,
          flexDirection: "row",
          alignItems: "center",
          gap: 20,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: color,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          }}
        />
        <View
          style={{
            width: 56,
            height: 56,
            backgroundColor: `${color}15`,
            borderWidth: 1,
            borderColor: `${color}40`,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 8,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color,
                letterSpacing: 2,
                backgroundColor: `${color}15`,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              {badge}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: F.orbitronBold,
              fontSize: 15,
              color: "#F4F4F9",
              letterSpacing: 1,
              marginBottom: 5,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontFamily: F.rajdhani,
              fontSize: 13,
              color: "rgba(180,200,220,0.5)",
              lineHeight: 18,
            }}
          >
            {description}
          </Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 16, color: `${color}60` }}>
          →
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
