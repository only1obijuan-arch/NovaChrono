import { useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { apiFetch } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Target } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#00FF9C";

export default function Standings() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: team } = useQuery({
    queryKey: ["captain-team"],
    queryFn: async () => {
      const res = await apiFetch("/api/captain/team");
      const data = await res.json();
      return data.team;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["league-stats", team?.league_id],
    queryFn: async () => {
      const res = await apiFetch(`/api/stats?leagueId=${team.league_id}`);
      return res.json();
    },
    enabled: !!team?.league_id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["league-stats"]);
    setRefreshing(false);
  };

  const standings = stats?.standings || [];
  const topScorers = stats?.topScorers || [];

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
          // LEAGUE STANDINGS
        </Text>
        <Text
          style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
        >
          TABLE
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
        {/* Standings table */}
        <View style={{ marginBottom: 32 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Trophy size={14} color={C} />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 11,
                color: C,
                letterSpacing: 2,
              }}
            >
              STANDINGS
            </Text>
          </View>

          {standings.length === 0 ? (
            <View
              style={{
                backgroundColor: "rgba(11,20,40,0.6)",
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: "rgba(0,255,156,0.15)",
                borderRadius: 10,
                padding: 32,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(0,255,156,0.25)",
                  letterSpacing: 3,
                }}
              >
                NO STANDINGS YET
              </Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: "rgba(11,20,40,0.9)",
                borderWidth: 1,
                borderColor: "rgba(0,255,156,0.12)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {/* Table header */}
              <View
                style={{
                  flexDirection: "row",
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(0,255,156,0.1)",
                  backgroundColor: "rgba(0,255,156,0.04)",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 2,
                    width: 28,
                  }}
                >
                  #
                </Text>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 2,
                    flex: 1,
                  }}
                >
                  TEAM
                </Text>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 2,
                    width: 32,
                    textAlign: "center",
                  }}
                >
                  P
                </Text>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 2,
                    width: 32,
                    textAlign: "center",
                  }}
                >
                  W
                </Text>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 2,
                    width: 40,
                    textAlign: "right",
                  }}
                >
                  PTS
                </Text>
              </View>

              {standings.map((standing, index) => {
                const isMyTeam = standing.slot_id === team?.slot_id;
                const posColor =
                  index === 0
                    ? "#FFD700"
                    : index === 1
                      ? "#C0C0C0"
                      : index === 2
                        ? "#CD7F32"
                        : null;

                return (
                  <View
                    key={standing.slot_id}
                    style={{
                      flexDirection: "row",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: isMyTeam
                        ? "rgba(0,255,156,0.06)"
                        : "transparent",
                      borderBottomWidth: index < standings.length - 1 ? 1 : 0,
                      borderBottomColor: "rgba(0,255,156,0.06)",
                    }}
                  >
                    <View style={{ width: 28, alignItems: "center" }}>
                      {posColor ? (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: `${posColor}20`,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: F.mono,
                              fontSize: 11,
                              color: posColor,
                            }}
                          >
                            {index + 1}
                          </Text>
                        </View>
                      ) : (
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 12,
                            color: isMyTeam ? C : "rgba(180,200,220,0.4)",
                          }}
                        >
                          {index + 1}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={{
                        fontFamily: isMyTeam ? F.rajdhaniBold : F.rajdhani,
                        fontSize: 15,
                        color: isMyTeam ? C : "#F4F4F9",
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {standing.team_name || `Team ${index + 1}`}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 13,
                        color: isMyTeam ? C : "rgba(180,200,220,0.5)",
                        width: 32,
                        textAlign: "center",
                      }}
                    >
                      {standing.played}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 13,
                        color: isMyTeam ? C : "rgba(180,200,220,0.5)",
                        width: 32,
                        textAlign: "center",
                      }}
                    >
                      {standing.wins}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.orbitron,
                        fontSize: 16,
                        color: isMyTeam ? C : "#F4F4F9",
                        width: 40,
                        textAlign: "right",
                      }}
                    >
                      {standing.points}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Top Scorers */}
        {topScorers.length > 0 && (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Target size={14} color="#FF00CC" />
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 11,
                  color: "#FF00CC",
                  letterSpacing: 2,
                }}
              >
                TOP SCORERS
              </Text>
            </View>
            <View
              style={{
                backgroundColor: "rgba(11,20,40,0.9)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.12)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {topScorers.slice(0, 10).map((scorer, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    borderBottomWidth:
                      index < topScorers.slice(0, 10).length - 1 ? 1 : 0,
                    borderBottomColor: "rgba(255,0,204,0.06)",
                    backgroundColor:
                      index < 3 ? "rgba(255,0,204,0.03)" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor:
                        index < 3
                          ? "rgba(255,0,204,0.15)"
                          : "rgba(255,0,204,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 11,
                        color: index < 3 ? "#FF00CC" : "rgba(255,0,204,0.5)",
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: F.rajdhaniBold,
                        fontSize: 15,
                        color: "#F4F4F9",
                        marginBottom: 2,
                      }}
                    >
                      {scorer.player_name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: "rgba(255,0,204,0.4)",
                        letterSpacing: 1,
                      }}
                    >
                      {scorer.team_name}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontFamily: F.orbitron,
                        fontSize: 22,
                        color: "#FF00CC",
                      }}
                    >
                      {scorer.goals}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 8,
                        color: "rgba(255,0,204,0.4)",
                        letterSpacing: 1,
                      }}
                    >
                      GOALS
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
