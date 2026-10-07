import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft, Timer } from "lucide-react-native";
import { requestPasswordReset } from "@/utils/api";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};

export default function ForgotPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
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

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 16,
            paddingHorizontal: 28,
            paddingBottom: insets.bottom + 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 32,
              alignSelf: "flex-start",
            }}
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
              BACK TO SIGN IN
            </Text>
          </TouchableOpacity>

          {sent ? (
            /* Success state */
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  backgroundColor: "rgba(0,255,156,0.08)",
                  borderWidth: 2,
                  borderColor: "rgba(0,255,156,0.4)",
                  borderRadius: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                }}
              >
                <Text style={{ fontSize: 32 }}>📨</Text>
              </View>
              <Text
                style={{
                  fontFamily: F.orbitron,
                  fontSize: 18,
                  color: "#F4F4F9",
                  letterSpacing: 2,
                  marginBottom: 14,
                  textAlign: "center",
                }}
              >
                CHECK YOUR EMAIL
              </Text>
              <Text
                style={{
                  fontFamily: F.rajdhani,
                  fontSize: 15,
                  color: "rgba(180,200,220,0.5)",
                  textAlign: "center",
                  lineHeight: 22,
                  marginBottom: 8,
                  paddingHorizontal: 16,
                }}
              >
                If an account exists for{" "}
                <Text style={{ color: "#00F5D4" }}>{email}</Text>, a password
                reset link has been sent. Check your inbox and spam folder.
              </Text>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(0,245,212,0.3)",
                  letterSpacing: 3,
                  marginTop: 8,
                }}
              >
                LINK EXPIRES IN 1 HOUR
              </Text>
            </View>
          ) : (
            /* Form */
            <View>
              {/* Icon + heading */}
              <View style={{ alignItems: "center", marginBottom: 36 }}>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    backgroundColor: "rgba(0,245,212,0.08)",
                    borderWidth: 2,
                    borderColor: "rgba(0,245,212,0.4)",
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                  }}
                >
                  <Timer size={36} color="#00F5D4" />
                </View>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,245,212,0.4)",
                    letterSpacing: 4,
                    marginBottom: 8,
                  }}
                >
                  ACCOUNT RECOVERY
                </Text>
                <Text
                  style={{
                    fontFamily: F.orbitron,
                    fontSize: 20,
                    color: "#F4F4F9",
                    letterSpacing: 2,
                    marginBottom: 8,
                  }}
                >
                  FORGOT PASSWORD
                </Text>
                <Text
                  style={{
                    fontFamily: F.rajdhani,
                    fontSize: 14,
                    color: "rgba(180,200,220,0.4)",
                    textAlign: "center",
                    lineHeight: 20,
                  }}
                >
                  Enter your email and we’ll send you a reset link.
                </Text>
              </View>

              {/* Email field */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,245,212,0.4)",
                    letterSpacing: 2,
                    marginBottom: 8,
                  }}
                >
                  EMAIL ADDRESS
                </Text>
                <TextInput
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(null); }}
                  placeholder="you@example.com"
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
                      fontFamily: F.mono,
                      fontSize: 10,
                      color: "rgba(255,100,100,0.9)",
                      letterSpacing: 2,
                      textAlign: "center",
                    }}
                  >
                    {error.toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Submit button */}
              <TouchableOpacity
                onPress={handleSubmit}
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
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#00F5D4" />
                ) : (
                  <Text
                    style={{
                      fontFamily: F.orbitron,
                      fontSize: 14,
                      color: "#00F5D4",
                      letterSpacing: 3,
                    }}
                  >
                    SEND RESET LINK →
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
