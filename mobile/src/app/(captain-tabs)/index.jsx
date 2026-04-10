import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { apiFetch } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trophy, Calendar, Users } from "lucide-react-native";
import { useRouter } from "expo-router";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#00FF9C";

export default function TeamDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: team, isLoading } = useQuery({
    queryKey: ["captain-team"],
    queryFn: async () => {
      const res = await apiFetch("/api/captain/team");
      if (!res.ok) throw new Error("Failed to fetch team");
      const data = await res.json();
      return data.team;
    },
  });

  const { data: players = [] } = useQuery({
    queryKey: ["team-players", team?.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/players?teamId=${team.id}`);
      return res.json();
    },
    enabled: !!team?.id,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["team-matches", team?.league_id],
    queryFn: async () => {
      const res = await apiFetch(`/api/matches?leagueId=${team.league_id}`);
      return res.json();
    },
    enabled: !!team?.league_id,
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
    await queryClient.invalidateQueries(["captain-team"]);
    await queryClient.invalidateQueries(["team-players"]);
    await queryClient.invalidateQueries(["team-matches"]);
    await queryClient.invalidateQueries(["league-stats"]);
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#091833",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: insets.top,
        }}
      >
        <StatusBar style="light" />
        <View
          style={{
            width: 48,
            height: 48,
            borderWidth: 3,
            borderColor: C,
            borderTopColor: "transparent",
            borderRadius: 24,
            marginBottom: 16,
          }}
        />
        <Text
          style={{
            color: C,
            fontFamily: F.mono,
            letterSpacing: 4,
            fontSize: 12,
          }}
        >
          LOADING...
        </Text>
      </View>
    );
  }

  if (!team) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#091833",
          padding: 24,
          paddingTop: insets.top,
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" />
        <Text
          style={{
            fontFamily: F.orbitron,
            fontSize: 20,
            color: "#F4F4F9",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          NO TEAM FOUND
        </Text>
        <Text
          style={{
            fontFamily: F.rajdhani,
            fontSize: 16,
            color: "rgba(180,200,220,0.6)",
            textAlign: "center",
          }}
        >
          Please join a team using a valid join code
        </Text>
      </View>
    );
  }

  const teamMatches = matches.filter(
    (m) => m.home_slot_id === team.slot_id || m.away_slot_id === team.slot_id,
  );
  const upcomingMatches = teamMatches
    .filter((m) => m.status === "scheduled")
    .slice(0, 3);
  const standings = stats?.standings || [];
  const leaguePosition =
    standings.findIndex((s) => s.slot_id === team.slot_id) + 1;
  const teamStanding = standings.find((s) => s.slot_id === team.slot_id);

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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top,
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
        {/* Header */}
        <View style={{ padding: 24, paddingBottom: 20 }}>
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              color: "rgba(0,255,156,0.5)",
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            // CAPTAIN PORTAL
          </Text>
          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 26,
              color: "#F4F4F9",
              marginBottom: 4,
            }}
          >
            {team.name}
          </Text>
          <Text
            style={{
              fontFamily: F.rajdhani,
              fontSize: 14,
              color: "rgba(0,255,156,0.6)",
            }}
          >
            {team.league_name}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={{ paddingHorizontal: 24, marginBottom: 28 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              {
                icon: Trophy,
                value: leaguePosition > 0 ? leaguePosition : "--",
                label: "POSITION",
              },
              { icon: Users, value: players.length, label: "PLAYERS" },
              {
                icon: Calendar,
                value: teamStanding?.points || 0,
                label: "POINTS",
              },
            ].map(({ icon: Icon, value, label }) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(11,20,40,0.9)",
                  borderWidth: 1,
                  borderColor: "rgba(0,255,156,0.2)",
                  borderRadius: 10,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Icon size={20} color={C} style={{ marginBottom: 8 }} />
                <Text
                  style={{
                    fontFamily: F.orbitron,
                    fontSize: 24,
                    color: C,
                    marginBottom: 4,
                  }}
                >
                  {value}
                </Text>
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,255,156,0.4)",
                    letterSpacing: 2,
                  }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Upcoming Matches */}
        <View style={{ paddingHorizontal: 24, marginBottom: 28 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 11,
                color: "rgba(0,255,156,0.6)",
                letterSpacing: 3,
              }}
            >
              // UPCOMING MATCHES
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(captain-tabs)/schedule")}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: C,
                  letterSpacing: 1,
                }}
              >
                VIEW ALL →
              </Text>
            </TouchableOpacity>
          </View>

          {upcomingMatches.length === 0 ? (
            <View
              style={{
                backgroundColor: "rgba(255,200,0,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,200,0,0.2)",
                borderRadius: 10,
                padding: 20,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(255,200,0,0.6)",
                  letterSpacing: 2,
                }}
              >
                AWAITING FIXTURES
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {upcomingMatches.map((match) => {
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
                      borderColor: "rgba(0,255,156,0.12)",
                      borderRadius: 10,
                      padding: 16,
                      borderLeftWidth: 3,
                      borderLeftColor: isHome ? C : "#FF00CC",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 10,
                          color: "rgba(0,255,156,0.4)",
                          letterSpacing: 1,
                        }}
                      >
                        {new Date(match.match_date).toLocaleDateString(
                          "en-GB",
                          { weekday: "short", day: "numeric", month: "short" },
                        )}
                      </Text>
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 10,
                          color: C,
                          letterSpacing: 1,
                        }}
                      >
                        {match.time_slot}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: F.orbitronBold,
                        fontSize: 15,
                        color: "#F4F4F9",
                        marginBottom: 6,
                      }}
                    >
                      vs {opponent || "TBD"}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          letterSpacing: 2,
                          color: isHome ? C : "#FF00CC",
                          backgroundColor: isHome
                            ? "rgba(0,255,156,0.08)"
                            : "rgba(255,0,204,0.08)",
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        {isHome ? "HOME" : "AWAY"}
                      </Text>
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: "rgba(180,200,220,0.4)",
                          letterSpacing: 1,
                          paddingVertical: 3,
                        }}
                      >
                        FIELD {match.field_number}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Team Roster */}
        <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 11,
                color: "rgba(0,255,156,0.6)",
                letterSpacing: 3,
              }}
            >
              // TEAM ROSTER
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/players/add")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(0,255,156,0.08)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: "rgba(0,255,156,0.3)",
              }}
            >
              <Plus size={12} color={C} />
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: C,
                  letterSpacing: 2,
                }}
              >
                ADD
              </Text>
            </TouchableOpacity>
          </View>

          {players.length === 0 ? (
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
                NO PLAYERS REGISTERED
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {players.slice(0, 5).map((player) => (
                <View
                  key={player.id}
                  style={{
                    backgroundColor: "rgba(0,255,156,0.03)",
                    borderWidth: 1,
                    borderColor: "rgba(0,255,156,0.1)",
                    borderRadius: 8,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: "rgba(0,255,156,0.1)",
                      borderWidth: 1,
                      borderColor: "rgba(0,255,156,0.25)",
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ fontFamily: F.mono, fontSize: 11, color: C }}
                    >
                      #{player.player_number || "--"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: F.rajdhaniBold,
                      fontSize: 16,
                      color: "#F4F4F9",
                      flex: 1,
                    }}
                  >
                    {player.name}
                  </Text>
                </View>
              ))}
              {players.length > 5 && (
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 10,
                    color: "rgba(0,255,156,0.3)",
                    letterSpacing: 2,
                    textAlign: "center",
                    paddingTop: 8,
                  }}
                >
                  +{players.length - 5} MORE PLAYERS
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
