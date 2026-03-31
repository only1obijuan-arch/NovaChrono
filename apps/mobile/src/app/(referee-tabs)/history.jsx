import { useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/utils/auth/useUser";
import { History } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#A42DB4";

export default function RefereeHistory() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useUser();

  const { data: recentMatches = [] } = useQuery({
    queryKey: ["referee-history", user?.venue_id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const params = new URLSearchParams({ date: today });
      if (user?.venue_id) params.append("venueId", user.venue_id);
      if (user?.field_number) params.append("fieldNumber", user.field_number);
      const res = await fetch(`/api/matches?${params}`);
      return res.json();
    },
    enabled: !!user,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["referee-history"]);
    setRefreshing(false);
  };

  const completedMatches = recentMatches.filter((m) => m.status === "final");

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
          // MATCH HISTORY
        </Text>
        <Text
          style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
        >
          PAST MATCHES
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C}
          />
        }
      >
        {completedMatches.length === 0 ? (
          <View
            style={{
              backgroundColor: "rgba(11,20,40,0.6)",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(164,45,180,0.2)",
              borderRadius: 12,
              padding: 48,
              alignItems: "center",
              marginTop: 40,
            }}
          >
            <History
              size={48}
              color="rgba(164,45,180,0.3)"
              style={{ marginBottom: 16 }}
            />
            <Text
              style={{
                fontFamily: F.orbitronBold,
                fontSize: 16,
                color: "#F4F4F9",
                marginBottom: 8,
                letterSpacing: 1,
              }}
            >
              NO MATCH HISTORY
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 14,
                color: "rgba(180,200,220,0.5)",
                textAlign: "center",
              }}
            >
              Completed matches will appear here
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {completedMatches.map((match) => {
              const homeWon = match.home_score > match.away_score;
              const drew = match.home_score === match.away_score;
              return (
                <View
                  key={match.id}
                  style={{
                    backgroundColor: "rgba(11,20,40,0.8)",
                    borderWidth: 1,
                    borderColor: "rgba(164,45,180,0.15)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {/* Top bar */}
                  <View
                    style={{
                      height: 2,
                      backgroundColor: "rgba(164,45,180,0.4)",
                    }}
                  />

                  <View style={{ padding: 16 }}>
                    {/* Header */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 14,
                      }}
                    >
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 10,
                            color: "rgba(180,200,220,0.4)",
                            letterSpacing: 1,
                          }}
                        >
                          {new Date(match.match_date).toLocaleDateString(
                            "en-GB",
                            { day: "numeric", month: "short" },
                          )}
                        </Text>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 10,
                            color: "rgba(164,45,180,0.4)",
                            letterSpacing: 1,
                          }}
                        >
                          FIELD {match.field_number}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor: "rgba(180,200,220,0.06)",
                          paddingHorizontal: 10,
                          paddingVertical: 3,
                          borderRadius: 2,
                          borderWidth: 1,
                          borderColor: "rgba(180,200,220,0.15)",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 9,
                            color: "rgba(180,200,220,0.4)",
                            letterSpacing: 2,
                          }}
                        >
                          FINAL
                        </Text>
                      </View>
                    </View>

                    {/* Score */}
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: F.rajdhaniBold,
                            fontSize: 15,
                            color: homeWon
                              ? "#F4F4F9"
                              : "rgba(180,200,220,0.5)",
                          }}
                        >
                          {match.home_team_name || "Home"}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 16,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: F.orbitron,
                            fontSize: 28,
                            color: homeWon
                              ? "#00FF9C"
                              : drew
                                ? "#FFD700"
                                : "rgba(180,200,220,0.5)",
                          }}
                        >
                          {match.home_score}
                        </Text>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 16,
                            color: "rgba(180,200,220,0.2)",
                          }}
                        >
                          —
                        </Text>
                        <Text
                          style={{
                            fontFamily: F.orbitron,
                            fontSize: 28,
                            color:
                              !homeWon && !drew
                                ? "#00FF9C"
                                : drew
                                  ? "#FFD700"
                                  : "rgba(180,200,220,0.5)",
                          }}
                        >
                          {match.away_score}
                        </Text>
                      </View>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Text
                          style={{
                            fontFamily: F.rajdhaniBold,
                            fontSize: 15,
                            color:
                              !homeWon && !drew
                                ? "#F4F4F9"
                                : "rgba(180,200,220,0.5)",
                            textAlign: "right",
                          }}
                        >
                          {match.away_team_name || "Away"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
