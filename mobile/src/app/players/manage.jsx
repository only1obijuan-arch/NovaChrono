import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, Plus, Users, X, Hash, Trash2 } from "lucide-react-native";
import { apiFetch } from "@/utils/api";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#00FF9C";

export default function ManagePlayers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("");
  const [error, setError] = useState("");

  const { data: team } = useQuery({
    queryKey: ["captain-team"],
    queryFn: async () => {
      const res = await apiFetch("/api/captain/team");
      const data = await res.json();
      return data.team ?? null;
    },
  });

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ["team-players", team?.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/players?teamId=${team.id}`);
      return res.json();
    },
    enabled: !!team?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (playerId) => {
      const res = await apiFetch(`/api/players?playerId=${playerId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to remove player");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["team-players", team?.id]);
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/players", {
        method: "POST",
        body: JSON.stringify({
          teamId: team.id,
          name: name.trim(),
          playerNumber: playerNumber.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to add player");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["team-players", team?.id]);
      setName("");
      setPlayerNumber("");
      setError("");
      setShowForm(false);
    },
    onError: (err) => setError(err.message),
  });

  const handleAdd = () => {
    if (!name.trim()) {
      setError("Player name is required");
      return;
    }
    setError("");
    addMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#091833" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 16 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}
        >
          <ChevronLeft size={16} color="rgba(0,255,156,0.5)" />
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(0,255,156,0.5)", letterSpacing: 2 }}>
            BACK
          </Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(0,255,156,0.5)", letterSpacing: 4, marginBottom: 8 }}>
          // SQUAD
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}>
            MANAGE PLAYERS
          </Text>
          <TouchableOpacity
            onPress={() => { setShowForm(!showForm); setError(""); }}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: showForm ? "rgba(0,255,156,0.15)" : "rgba(0,255,156,0.08)",
              borderWidth: 1,
              borderColor: "rgba(0,255,156,0.3)",
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            {showForm ? <X size={14} color={C} /> : <Plus size={14} color={C} />}
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C, letterSpacing: 2 }}>
              {showForm ? "CANCEL" : "ADD"}
            </Text>
          </TouchableOpacity>
        </View>
        {team && (
          <Text style={{ fontFamily: F.rajdhani, fontSize: 14, color: "rgba(0,255,156,0.5)", marginTop: 4 }}>
            {team.name}
          </Text>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Add Player Form */}
        {showForm && (
          <View
            style={{
              marginBottom: 24,
              backgroundColor: "rgba(11,20,40,0.95)",
              borderWidth: 1,
              borderColor: "rgba(0,255,156,0.25)",
              borderRadius: 12,
              padding: 20,
              borderLeftWidth: 3,
              borderLeftColor: C,
            }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(0,255,156,0.5)", letterSpacing: 3, marginBottom: 16 }}>
              // NEW PLAYER
            </Text>

            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.4)", letterSpacing: 2, marginBottom: 6 }}>
                PLAYER NAME *
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(0,255,156,0.04)",
                  borderWidth: 1,
                  borderColor: name ? "rgba(0,255,156,0.3)" : "rgba(0,255,156,0.1)",
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  height: 46,
                  gap: 10,
                }}
              >
                <Users size={14} color="rgba(0,255,156,0.4)" />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  placeholderTextColor="rgba(180,200,220,0.25)"
                  style={{ flex: 1, fontFamily: F.rajdhani, fontSize: 16, color: "#F4F4F9" }}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.4)", letterSpacing: 2, marginBottom: 6 }}>
                JERSEY NUMBER (OPTIONAL)
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(0,255,156,0.04)",
                  borderWidth: 1,
                  borderColor: playerNumber ? "rgba(0,255,156,0.3)" : "rgba(0,255,156,0.1)",
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  height: 46,
                  gap: 10,
                }}
              >
                <Hash size={14} color="rgba(0,255,156,0.4)" />
                <TextInput
                  value={playerNumber}
                  onChangeText={setPlayerNumber}
                  placeholder="e.g. 10"
                  placeholderTextColor="rgba(180,200,220,0.25)"
                  style={{ flex: 1, fontFamily: F.rajdhani, fontSize: 16, color: "#F4F4F9" }}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {error ? (
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: "#FF4466", letterSpacing: 1, marginBottom: 12 }}>
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleAdd}
              disabled={addMutation.isPending}
              activeOpacity={0.8}
              style={{
                backgroundColor: addMutation.isPending ? "rgba(0,255,156,0.1)" : C,
                borderRadius: 8,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {addMutation.isPending ? (
                <ActivityIndicator size="small" color={C} />
              ) : (
                <>
                  <Plus size={14} color="#091833" />
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#091833", letterSpacing: 2 }}>
                    ADD PLAYER
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Player count */}
        {!playersLoading && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Users size={14} color="rgba(0,255,156,0.4)" />
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(0,255,156,0.4)", letterSpacing: 2 }}>
              {players.length} PLAYER{players.length !== 1 ? "S" : ""} REGISTERED
            </Text>
          </View>
        )}

        {/* Player list */}
        {playersLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={C} />
          </View>
        ) : players.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 48,
              backgroundColor: "rgba(11,20,40,0.6)",
              borderWidth: 1,
              borderColor: "rgba(0,255,156,0.08)",
              borderRadius: 12,
            }}
          >
            <Users size={32} color="rgba(0,255,156,0.2)" />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(0,255,156,0.3)", letterSpacing: 3, marginTop: 16 }}>
              NO PLAYERS YET
            </Text>
            <Text style={{ fontFamily: F.rajdhani, fontSize: 14, color: "rgba(180,200,220,0.3)", marginTop: 6 }}>
              Tap ADD to register your first player
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {players.map((player, index) => (
              <View
                key={player.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(11,20,40,0.9)",
                  borderWidth: 1,
                  borderColor: "rgba(0,255,156,0.1)",
                  borderRadius: 10,
                  padding: 16,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: "rgba(0,255,156,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(0,255,156,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {player.player_number ? (
                    <Text style={{ fontFamily: F.orbitron, fontSize: 14, color: C }}>
                      {player.player_number}
                    </Text>
                  ) : (
                    <Text style={{ fontFamily: F.mono, fontSize: 14, color: "rgba(0,255,156,0.3)" }}>
                      —
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.rajdhaniBold, fontSize: 16, color: "#F4F4F9" }}>
                    {player.name}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.3)", letterSpacing: 2, marginTop: 2 }}>
                    #{String(index + 1).padStart(2, "0")}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteMutation.mutate(player.id)}
                  disabled={deleteMutation.isPending}
                  activeOpacity={0.7}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    backgroundColor: "rgba(255,50,50,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,50,50,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Trash2 size={14} color="rgba(255,80,80,0.7)" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
