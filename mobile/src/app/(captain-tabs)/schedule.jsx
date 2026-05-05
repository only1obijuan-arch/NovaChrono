import { useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { apiFetch } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCaptainTeam } from "@/utils/CaptainTeamContext";
import { Calendar, MapPin } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#00FF9C";

export default function Schedule() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { selectedTeam: team } = useCaptainTeam();

  const { data: matches = [] } = useQuery({
    queryKey: ["team-matches", team?.league_id],
    queryFn: async () => {
      const res = await apiFetch(`/api/matches?leagueId=${team.league_id}`);
      return res.json();
    },
    enabled: !!team?.league_id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["team-matches"]);
    setRefreshing(false);
  };

  const teamMatches = matches.filter(
    (m) => m.home_slot_id === team?.slot_id || m.away_slot_id === team?.slot_id,
  );
  const upcoming = teamMatches.filter((m) => m.status === "scheduled");
  const completed = teamMatches.filter((m) => m.status === "final");

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
          // MATCH SCHEDULE
        </Text>
        <Text
          style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
        >
          FIXTURES
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
        {/* Upcoming */}
        <View style={{ marginBottom: 32 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Calendar size={14} color={C} />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 11,
                color: C,
                letterSpacing: 2,
              }}
            >
              UPCOMING ({upcoming.length})
            </Text>
          </View>

          {upcoming.length === 0 ? (
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
                NO UPCOMING MATCHES
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {upcoming.map((match) => {
                const isHome = match.home_slot_id === team.slot_id;
                const opponent = isHome
                  ? match.away_team_name
                  : match.home_team_name;
                return (
                  <View
                    key={match.id}
                    style={{
                      backgroundColor: "rgba(11,20,40,0.9)",
                      borderWidth: 1,
                      borderColor: "rgba(0,255,156,0.15)",
                      borderRadius: 10,
                      padding: 18,
                      borderLeftWidth: 3,
                      borderLeftColor: isHome ? C : "#FF00CC",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 10,
                            color: "rgba(0,255,156,0.4)",
                            letterSpacing: 1,
                            marginBottom: 4,
                          }}
                        >
                          {new Date(match.match_date).toLocaleDateString(
                            "en-GB",
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </Text>
                        <Text
                          style={{
                            fontFamily: F.orbitron,
                            fontSize: 20,
                            color: C,
                          }}
                        >
                          {match.time_slot}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 9,
                            letterSpacing: 2,
                            color: isHome ? C : "#FF00CC",
                            backgroundColor: isHome
                              ? "rgba(0,255,156,0.08)"
                              : "rgba(255,0,204,0.08)",
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          {isHome ? "HOME" : "AWAY"}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <MapPin size={11} color="rgba(180,200,220,0.4)" />
                          <Text
                            style={{
                              fontFamily: F.mono,
                              fontSize: 9,
                              color: "rgba(180,200,220,0.4)",
                              letterSpacing: 1,
                            }}
                          >
                            FIELD {match.field_number}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text
                      style={{
                        fontFamily: F.orbitronBold,
                        fontSize: 16,
                        color: "#F4F4F9",
                      }}
                    >
                      vs {opponent || "TBD"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Completed */}
        {completed.length > 0 && (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 11,
                  color: "rgba(180,200,220,0.4)",
                  letterSpacing: 2,
                }}
              >
                COMPLETED ({completed.length})
              </Text>
            </View>
            <View style={{ gap: 10 }}>
              {completed.map((match) => {
                const isHome = match.home_slot_id === team.slot_id;
                const opponent = isHome
                  ? match.away_team_name
                  : match.home_team_name;
                const ourScore = isHome ? match.home_score : match.away_score;
                const theirScore = isHome ? match.away_score : match.home_score;
                const won = ourScore > theirScore;
                const drew = ourScore === theirScore;
                const resultColor = won
                  ? C
                  : drew
                    ? "#FFD700"
                    : "rgba(255,80,80,0.8)";

                return (
                  <View
                    key={match.id}
                    style={{
                      backgroundColor: "rgba(11,20,40,0.6)",
                      borderWidth: 1,
                      borderColor: "rgba(180,200,220,0.08)",
                      borderRadius: 10,
                      padding: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        backgroundColor: `${resultColor}15`,
                        borderWidth: 1,
                        borderColor: `${resultColor}30`,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: F.orbitron,
                          fontSize: 18,
                          color: resultColor,
                        }}
                      >
                        {ourScore}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: F.rajdhaniBold,
                          fontSize: 15,
                          color: "rgba(180,200,220,0.6)",
                          marginBottom: 4,
                        }}
                      >
                        vs {opponent || "TBD"}
                      </Text>
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: "rgba(180,200,220,0.3)",
                          letterSpacing: 1,
                        }}
                      >
                        {new Date(match.match_date).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" },
                        )}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: resultColor,
                        letterSpacing: 2,
                      }}
                    >
                      {won ? "WIN" : drew ? "DRAW" : "LOSS"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
