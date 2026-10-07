import { isValidJoinCode } from "../../utils/join-code";
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
import { captainSignUp } from "@/utils/api";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};

function strengthCheck(p) {
  if (!p) return null;
  if (p.length < 8) return { label: "TOO SHORT", color: "rgba(255,80,80,0.7)", pct: 0.2 };
  if (p.length < 10 || !/[0-9]/.test(p)) return { label: "WEAK", color: "rgba(255,160,0,0.7)", pct: 0.4 };
  if (!/[A-Z]/.test(p) || !/[^a-zA-Z0-9]/.test(p)) return { label: "FAIR", color: "rgba(255,215,0,0.7)", pct: 0.65 };
  return { label: "STRONG", color: "#00FF9C", pct: 1 };
}

export default function SignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [teamName, setTeamName] = useState("");

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const strength = strengthCheck(password);
  const passwordsMatch = confirm.length > 0 && password === confirm;

  const canSubmit =
    !loading &&
    isValidJoinCode(joinCode) &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    strength &&
    strength.label !== "TOO SHORT" &&
    passwordsMatch &&
    teamName.trim().length > 0;

  const handleSignUp = async () => {
    setError(null);
    if (!joinCode.trim() || !name.trim() || !email.trim() || !password || !teamName.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (!isValidJoinCode(joinCode)) {
      setError("League code must be 6 or 8 letters or digits.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!strength || strength.label === "TOO SHORT") {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await captainSignUp({ joinCode: joinCode.trim(), name: name.trim(), email: email.trim().toLowerCase(), password, teamName: teamName.trim() });
      setDone(true);
    } catch (err) {
      const msg = err.message || "Failed to create account. Please try again.";
      if (msg.toLowerCase().includes("email already exists") || msg.toLowerCase().includes("already exists")) {
        setError("__EMAIL_EXISTS__");
      } else {
        setError(msg);
      }
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

        {/* Grid */}
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
              marginBottom: 28,
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

          {done ? (
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
                <Text style={{ fontFamily: F.orbitron, fontSize: 28, color: "#00FF9C" }}>✓</Text>
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
                WELCOME TO THE LEAGUE
              </Text>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(0,245,212,0.5)",
                  letterSpacing: 2,
                  textAlign: "center",
                  lineHeight: 20,
                  marginBottom: 36,
                }}
              >
                YOUR TEAM IS REGISTERED.{"\n"}CHECK YOUR EMAIL, THEN SIGN IN.
              </Text>
              <TouchableOpacity
                onPress={() => router.replace("/auth/login")}
                activeOpacity={0.8}
                style={{
                  height: 56,
                  paddingHorizontal: 36,
                  backgroundColor: "rgba(0,245,212,0.1)",
                  borderWidth: 1,
                  borderColor: "#00F5D4",
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.orbitron,
                    fontSize: 14,
                    color: "#00F5D4",
                    letterSpacing: 3,
                  }}
                >
                  SIGN IN NOW →
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Form */
            <View>
              {/* Heading */}
              <View style={{ alignItems: "center", marginBottom: 32 }}>
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
                    marginBottom: 6,
                  }}
                >
                  CAPTAIN REGISTRATION
                </Text>
                <Text
                  style={{
                    fontFamily: F.orbitron,
                    fontSize: 20,
                    color: "#F4F4F9",
                    letterSpacing: 2,
                  }}
                >
                  JOIN A LEAGUE
                </Text>
              </View>

              {/* League code */}
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>LEAGUE CODE</Text>
                <TextInput
                  value={joinCode}
                  onChangeText={(t) => { setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(null); }}
                  placeholder="XXXXXX"
                  placeholderTextColor="rgba(0,245,212,0.2)"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  style={[inputStyle, {
                    letterSpacing: 8,
                    fontFamily: F.mono,
                    fontSize: 20,
                    textAlign: "center",
                  }]}
                />
              </View>

              {/* Full name */}
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>FULL NAME</Text>
                <TextInput
                  value={name}
                  onChangeText={(t) => { setName(t); setError(null); }}
                  placeholder="e.g. John Smith"
                  placeholderTextColor="rgba(0,245,212,0.2)"
                  autoComplete="name"
                  style={inputStyle}
                />
              </View>

              {/* Email */}
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>EMAIL ADDRESS</Text>
                <TextInput
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(null); }}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(0,245,212,0.2)"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={inputStyle}
                />
              </View>

              {/* Password */}
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>PASSWORD</Text>
                <TextInput
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(null); }}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="rgba(0,245,212,0.2)"
                  secureTextEntry
                  autoComplete="new-password"
                  style={inputStyle}
                />
                {strength && (
                  <View style={{ marginTop: 8 }}>
                    <View
                      style={{
                        height: 3,
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${strength.pct * 100}%`,
                          backgroundColor: strength.color,
                          borderRadius: 2,
                        }}
                      />
                    </View>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: strength.color,
                        letterSpacing: 3,
                        marginTop: 4,
                      }}
                    >
                      {strength.label}
                    </Text>
                  </View>
                )}
              </View>

              {/* Confirm password */}
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>CONFIRM PASSWORD</Text>
                <TextInput
                  value={confirm}
                  onChangeText={(t) => { setConfirm(t); setError(null); }}
                  placeholder="Re-enter password"
                  placeholderTextColor="rgba(0,245,212,0.2)"
                  secureTextEntry
                  autoComplete="new-password"
                  style={inputStyle}
                />
                {confirm.length > 0 && (
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9,
                      letterSpacing: 2,
                      marginTop: 6,
                      color: passwordsMatch ? "#00FF9C" : "rgba(255,80,80,0.7)",
                    }}
                  >
                    {passwordsMatch ? "✓ PASSWORDS MATCH" : "✗ PASSWORDS DO NOT MATCH"}
                  </Text>
                )}
              </View>

              {/* Team name */}
              <View style={{ marginBottom: 24 }}>
                <Text style={labelStyle}>TEAM NAME</Text>
                <TextInput
                  value={teamName}
                  onChangeText={(t) => { setTeamName(t); setError(null); }}
                  placeholder="e.g. Thunder FC"
                  placeholderTextColor="rgba(0,245,212,0.2)"
                  autoComplete="organization"
                  style={inputStyle}
                />
              </View>

              {/* Error */}
              {error === "__EMAIL_EXISTS__" ? (
                <View
                  style={{
                    backgroundColor: "rgba(0,245,212,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(0,245,212,0.3)",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 10,
                      color: "rgba(0,245,212,0.9)",
                      letterSpacing: 2,
                      lineHeight: 18,
                    }}
                  >
                    ALREADY HAVE AN ACCOUNT?{"\n"}
                    <Text
                      style={{ color: "#00F5D4", textDecorationLine: "underline" }}
                      onPress={() => router.replace("/auth/login")}
                    >
                      SIGN IN AND USE YOUR LEAGUE CODE TO JOIN.
                    </Text>
                  </Text>
                </View>
              ) : error ? (
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
              ) : null}

              {/* Submit */}
              <TouchableOpacity
                onPress={handleSignUp}
                disabled={!canSubmit}
                activeOpacity={0.8}
                style={{
                  height: 60,
                  backgroundColor: canSubmit
                    ? "rgba(0,245,212,0.1)"
                    : "rgba(0,245,212,0.04)",
                  borderWidth: 1,
                  borderColor: canSubmit ? "#00F5D4" : "rgba(0,245,212,0.2)",
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#00F5D4" />
                ) : (
                  <Text
                    style={{
                      fontFamily: F.orbitron,
                      fontSize: 14,
                      color: canSubmit ? "#00F5D4" : "rgba(0,245,212,0.3)",
                      letterSpacing: 3,
                    }}
                  >
                    JOIN LEAGUE →
                  </Text>
                )}
              </TouchableOpacity>

              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(180,200,220,0.15)",
                  letterSpacing: 2,
                  textAlign: "center",
                }}
              >
                © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const labelStyle = {
  fontFamily: "ShareTechMono_400Regular",
  fontSize: 9,
  color: "rgba(0,245,212,0.4)",
  letterSpacing: 2,
  marginBottom: 8,
};

const inputStyle = {
  height: 52,
  backgroundColor: "rgba(0,245,212,0.05)",
  borderWidth: 1,
  borderColor: "rgba(0,245,212,0.25)",
  borderRadius: 8,
  paddingHorizontal: 16,
  fontFamily: "Rajdhani_400Regular",
  fontSize: 16,
  color: "#F4F4F9",
};
