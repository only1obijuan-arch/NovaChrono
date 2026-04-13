import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Timer } from "lucide-react-native";
import { useAuth } from "@/utils/auth/useAuth";
import { signInWithCredentials } from "@/utils/api";

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
  const { auth, isReady, setAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isReady || !auth?.user) return;
    const role = auth.user.role;
    if (role === "referee") router.replace("/(referee-tabs)");
    else router.replace("/(captain-tabs)");
  }, [auth, isReady]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await signInWithCredentials(email, password);
      await setAuth({ token: data.token, user: data.user });
    } catch (err) {
      setError(err.message || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, backgroundColor: "#091833" }}>
        <StatusBar style="light" />

        {/* Grid lines */}
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

        {/* Glow blobs */}
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
          {/* Logo + headline */}
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
              <Timer size={44} color="#00F5D4" />
            </View>

            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 28,
                color: "#00F5D4",
                letterSpacing: 4,
                marginBottom: 6,
              }}
            >
              NOVACHRONO
            </Text>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(0,245,212,0.4)",
                letterSpacing: 3,
                marginBottom: 40,
              }}
            >
              // TIME PAUSES. YOUR LEAGUE NEVER DOES.
            </Text>

            {/* Role pills */}
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {[
                ["CAPTAINS", "#00FF9C"],
                ["REFEREES", "#A42DB4"],
              ].map(([label, color]) => (
                <View
                  key={label}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: `${color}40`,
                    backgroundColor: `${color}08`,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9,
                      color,
                      letterSpacing: 2,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Form */}
          <View>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(0,245,212,0.5)",
                letterSpacing: 3,
                marginBottom: 20,
              }}
            >
              // SIGN IN TO YOUR ACCOUNT
            </Text>

            {/* Email */}
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(0,245,212,0.4)",
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                EMAIL
              </Text>
              <TextInput
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); }}
                placeholder="your@email.com"
                placeholderTextColor="rgba(0,245,212,0.2)"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={{
                  height: 52,
                  backgroundColor: "rgba(0,245,212,0.05)",
                  borderWidth: 1,
                  borderColor: "rgba(0,245,212,0.25)",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  fontFamily: F.rajdhani,
                  fontSize: 16,
                  color: "#F4F4F9",
                }}
              />
            </View>

            {/* Password */}
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(0,245,212,0.4)",
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                PASSWORD
              </Text>
              <TextInput
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                placeholder="••••••••"
                placeholderTextColor="rgba(0,245,212,0.2)"
                secureTextEntry
                autoComplete="password"
                style={{
                  height: 52,
                  backgroundColor: "rgba(0,245,212,0.05)",
                  borderWidth: 1,
                  borderColor: "rgba(0,245,212,0.25)",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  fontFamily: F.rajdhani,
                  fontSize: 16,
                  color: "#F4F4F9",
                }}
              />
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => router.push("/auth/forgot-password")}
              style={{ alignSelf: "flex-end", marginBottom: 20 }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(0,245,212,0.45)",
                  letterSpacing: 2,
                }}
              >
                FORGOT PASSWORD?
              </Text>
            </TouchableOpacity>

            {/* Error */}
            {error && (
              <View
                style={{
                  backgroundColor: "rgba(255,80,80,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,80,80,0.3)",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: F.rajdhani,
                    fontSize: 13,
                    color: "rgba(255,100,100,0.9)",
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              </View>
            )}

            {/* Sign in button */}
            <TouchableOpacity
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.8}
              style={{
                height: 60,
                backgroundColor: loading
                  ? "rgba(0,245,212,0.05)"
                  : "rgba(0,245,212,0.1)",
                borderWidth: 1,
                borderColor: loading ? "rgba(0,245,212,0.2)" : "#00F5D4",
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#00F5D4" />
              ) : (
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
              )}
            </TouchableOpacity>

            {/* Create account */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: F.rajdhani,
                  fontSize: 13,
                  color: "rgba(180,200,220,0.35)",
                }}
              >
                New captain?
              </Text>
              <TouchableOpacity onPress={() => router.push("/auth/signup")}>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 10,
                    color: "#00F5D4",
                    letterSpacing: 1,
                  }}
                >
                  CREATE ACCOUNT →
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(180,200,220,0.15)",
                letterSpacing: 2,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
