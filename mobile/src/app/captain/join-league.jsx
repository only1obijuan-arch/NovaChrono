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
import { apiFetch } from "@/utils/api";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trophy } from "lucide-react-native";

const C = "#00FF9C";

export default function JoinLeague() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [joinCode, setJoinCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError("Please enter a league code.");
      return;
    }
    if (!teamName.trim()) {
      setError("Please enter your team name.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/captain/join-league", {
        method: "POST",
        body: JSON.stringify({
          joinCode: joinCode.trim().toUpperCase(),
          teamName: teamName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to join league");
      }
      setSuccess(`Successfully joined ${data.leagueName}!`);
      await queryClient.invalidateQueries({ queryKey: ["captain-team"] });
      await queryClient.invalidateQueries({ queryKey: ["captain-teams"] });
      setTimeout(() => {
        router.replace("/(captain-tabs)");
      }, 1500);
    } catch (err) {
      setError(err.message || "Failed to join league. Please try again.");
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

        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 40,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 32,
            }}
          >
            <ArrowLeft size={18} color="rgba(0,255,156,0.6)" />
            <Text
              style={{
                fontSize: 13,
                color: "rgba(0,255,156,0.6)",
                letterSpacing: 1,
              }}
            >
              BACK
            </Text>
          </TouchableOpacity>

          {/* Header */}
          <View
            style={{
              width: 72,
              height: 72,
              backgroundColor: "rgba(0,255,156,0.08)",
              borderWidth: 2,
              borderColor: "rgba(0,255,156,0.3)",
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Trophy size={36} color={C} />
          </View>

          <Text
            style={{
              fontSize: 10,
              color: "rgba(0,255,156,0.5)",
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            // JOIN A LEAGUE
          </Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "700",
              color: "#F4F4F9",
              marginBottom: 8,
            }}
          >
            Enter League Code
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "rgba(180,200,220,0.5)",
              marginBottom: 40,
              lineHeight: 20,
            }}
          >
            Get your league code from your venue admin and enter it below to register your team.
          </Text>

          {/* League code input */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 10,
                color: "rgba(0,255,156,0.4)",
                letterSpacing: 2,
                marginBottom: 8,
              }}
            >
              LEAGUE CODE
            </Text>
            <TextInput
              value={joinCode}
              onChangeText={(t) => { setJoinCode(t.toUpperCase()); setError(null); }}
              placeholder="e.g. ABC123"
              placeholderTextColor="rgba(0,255,156,0.2)"
              autoCapitalize="characters"
              autoCorrect={false}
              style={{
                height: 56,
                backgroundColor: "rgba(0,255,156,0.05)",
                borderWidth: 1,
                borderColor: joinCode ? "rgba(0,255,156,0.4)" : "rgba(0,255,156,0.2)",
                borderRadius: 10,
                paddingHorizontal: 16,
                fontSize: 20,
                color: C,
                letterSpacing: 4,
                fontWeight: "700",
              }}
            />
          </View>

          {/* Team name input */}
          <View style={{ marginBottom: 28 }}>
            <Text
              style={{
                fontSize: 10,
                color: "rgba(0,255,156,0.4)",
                letterSpacing: 2,
                marginBottom: 8,
              }}
            >
              TEAM NAME
            </Text>
            <TextInput
              value={teamName}
              onChangeText={(t) => { setTeamName(t); setError(null); }}
              placeholder="Your team name"
              placeholderTextColor="rgba(180,200,220,0.2)"
              autoCorrect={false}
              style={{
                height: 56,
                backgroundColor: "rgba(0,255,156,0.05)",
                borderWidth: 1,
                borderColor: teamName ? "rgba(0,255,156,0.4)" : "rgba(0,255,156,0.2)",
                borderRadius: 10,
                paddingHorizontal: 16,
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
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: "rgba(255,100,100,0.9)",
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {/* Success */}
          {success && (
            <View
              style={{
                backgroundColor: "rgba(0,255,156,0.08)",
                borderWidth: 1,
                borderColor: "rgba(0,255,156,0.3)",
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: C,
                  textAlign: "center",
                  fontWeight: "600",
                }}
              >
                {success}
              </Text>
            </View>
          )}

          {/* Join button */}
          <TouchableOpacity
            onPress={handleJoin}
            disabled={loading || !!success}
            activeOpacity={0.8}
            style={{
              height: 60,
              backgroundColor:
                loading || success
                  ? "rgba(0,255,156,0.05)"
                  : "rgba(0,255,156,0.12)",
              borderWidth: 1,
              borderColor:
                loading || success ? "rgba(0,255,156,0.2)" : C,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator color={C} />
            ) : (
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C,
                  letterSpacing: 3,
                }}
              >
                JOIN LEAGUE →
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
