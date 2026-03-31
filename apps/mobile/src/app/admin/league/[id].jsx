import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Users,
  Calendar,
  Trophy,
  BarChart3,
  Play,
  CheckCircle,
  Copy,
  StopCircle,
  Plus,
  X,
  Crown,
  Send,
  ChevronRight,
} from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#FF00CC";

export default function AdminLeagueDetail() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [newSeasonName, setNewSeasonName] = useState("");

  const { data: league, isLoading } = useQuery({
    queryKey: ["league", id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["league-teams", id],
    queryFn: async () => {
      const res = await fetch(`/api/teams?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["league-stats", id],
    queryFn: async () => {
      const res = await fetch(`/api/stats?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["league-matches", id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?leagueId=${id}`);
      return res.json();
    },
  });

  const generateFixturesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "GENERATE_FIXTURES", leagueId: id }),
      });
      if (!res.ok) throw new Error("Failed to generate fixtures");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["league", id]);
      queryClient.invalidateQueries(["league-matches", id]);
      Alert.alert("✅ Done", "Fixtures generated successfully!");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const addTeamMutation = useMutation({
    mutationFn: async (name) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_TEAM",
          leagueId: id,
          teamName: name,
        }),
      });
      if (!res.ok) throw new Error("Failed to add team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["league-teams", id]);
      setShowAddTeam(false);
      setTeamName("");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, name }) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_TEAM", teamId, teamName: name }),
      });
      if (!res.ok) throw new Error("Failed to update team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["league-teams", id]);
      setShowManageTeam(false);
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_TEAM", teamId }),
      });
      if (!res.ok) throw new Error("Failed to delete team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["league-teams", id]);
      setShowManageTeam(false);
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const completeSeasonMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "COMPLETE_SEASON", leagueId: id }),
      });
      if (!res.ok) throw new Error("Failed to complete season");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["league", id]);
      Alert.alert(
        "✅ Season Complete",
        "The season has been marked as complete.",
      );
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const cancelLeagueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "CANCEL_LEAGUE", leagueId: id }),
      });
      if (!res.ok) throw new Error("Failed to cancel league");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["league", id]);
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (matchId) => {
      const res = await fetch("/api/send-match-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (!res.ok) throw new Error("Failed to send reminder");
      return res.json();
    },
    onSuccess: () => Alert.alert("✅ Sent", "Match reminder sent to captains."),
    onError: (err) => Alert.alert("Error", err.message),
  });

  if (isLoading || !league) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#091833",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" />
        <View
          style={{
            width: 40,
            height: 40,
            borderWidth: 3,
            borderColor: C,
            borderTopColor: "transparent",
            borderRadius: 20,
            marginBottom: 16,
          }}
        />
        <Text
          style={{
            fontFamily: F.mono,
            color: C,
            letterSpacing: 4,
            fontSize: 12,
          }}
        >
          LOADING...
        </Text>
      </View>
    );
  }

  const rounds = [...new Set(matches.map((m) => m.round_number))].sort(
    (a, b) => a - b,
  );
  const champion = stats?.standings?.[0];
  const statusColor =
    league.status === "active"
      ? "#00FF9C"
      : league.status === "registration"
        ? "#FFD700"
        : league.status === "completed"
          ? "#00F5D4"
          : "#FF00CC";

  const tabs = [
    {
      key: "overview",
      label: "OVERVIEW",
      icon: <BarChart3 size={13} color="currentColor" />,
    },
    {
      key: "teams",
      label: "TEAMS",
      icon: <Users size={13} color="currentColor" />,
    },
    {
      key: "fixtures",
      label: "FIXTURES",
      icon: <Calendar size={13} color="currentColor" />,
    },
    {
      key: "standings",
      label: "STANDINGS",
      icon: <Trophy size={13} color="currentColor" />,
    },
  ];

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
              backgroundColor: "rgba(255,0,204,0.04)",
            }}
          />
        ))}
      </View>

      {/* Champion banner */}
      {league.status === "completed" && champion && (
        <View
          style={{
            backgroundColor: "rgba(255,215,0,0.08)",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,215,0,0.3)",
            paddingTop: insets.top + 8,
            padding: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <Crown size={28} color="#FFD700" />
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(255,215,0,0.6)",
                letterSpacing: 3,
                marginBottom: 4,
              }}
            >
              🏆 SEASON CHAMPIONS 🏆
            </Text>
            <Text
              style={{ fontFamily: F.orbitron, fontSize: 20, color: "#FFD700" }}
            >
              {champion.team_name}
            </Text>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(255,215,0,0.5)",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              {champion.points} PTS • {champion.wins} WINS
            </Text>
          </View>
          <Crown size={28} color="#FFD700" />
        </View>
      )}

      {/* Sticky header */}
      <View
        style={{
          paddingTop:
            league.status === "completed" && champion ? 8 : insets.top + 8,
          backgroundColor: "rgba(9,24,51,0.97)",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,0,204,0.15)",
        }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 0 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 12,
            }}
          >
            <ChevronLeft size={16} color="rgba(255,0,204,0.5)" />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(255,0,204,0.5)",
                letterSpacing: 2,
              }}
            >
              LEAGUES
            </Text>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontFamily: F.orbitronBold,
                  fontSize: 18,
                  color: "#F4F4F9",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {league.name}
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(255,0,204,0.5)",
                    letterSpacing: 2,
                  }}
                >
                  {league.day_of_week?.toUpperCase()} LEAGUE
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 2,
                    backgroundColor: `${statusColor}12`,
                    borderWidth: 1,
                    borderColor: `${statusColor}40`,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 8,
                      color: statusColor,
                      letterSpacing: 2,
                    }}
                  >
                    {league.status?.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Action button */}
            {league.status === "registration" && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "Generate Fixtures",
                    `Close registration and generate fixtures for ${teams.length} teams?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Generate",
                        onPress: () => generateFixturesMutation.mutate(),
                      },
                    ],
                  )
                }
                disabled={
                  teams.length < 2 || generateFixturesMutation.isPending
                }
                style={{
                  backgroundColor: "rgba(255,0,204,0.15)",
                  borderWidth: 1,
                  borderColor: C,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  opacity: teams.length < 2 ? 0.4 : 1,
                }}
              >
                <Play size={12} color={C} />
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: C,
                    letterSpacing: 1,
                  }}
                >
                  GENERATE
                </Text>
              </TouchableOpacity>
            )}
            {league.status === "active" && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "Complete Season",
                    "Mark this season as complete?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Complete",
                        onPress: () => completeSeasonMutation.mutate(),
                      },
                    ],
                  )
                }
                style={{
                  backgroundColor: "rgba(0,255,156,0.1)",
                  borderWidth: 1,
                  borderColor: "#00FF9C",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <CheckCircle size={12} color="#00FF9C" />
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "#00FF9C",
                    letterSpacing: 1,
                  }}
                >
                  COMPLETE
                </Text>
              </TouchableOpacity>
            )}
            {league.status === "completed" && (
              <TouchableOpacity
                onPress={() => setShowNewSeason(true)}
                style={{
                  backgroundColor: "rgba(0,245,212,0.1)",
                  borderWidth: 1,
                  borderColor: "#00F5D4",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Copy size={12} color="#00F5D4" />
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "#00F5D4",
                    letterSpacing: 1,
                  }}
                >
                  NEW SEASON
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12 }}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab.key ? C : "transparent",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  letterSpacing: 2,
                  color: activeTab === tab.key ? C : "rgba(180,200,220,0.4)",
                }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <View style={{ gap: 16 }}>
            {/* Stats */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                {
                  label: "TEAMS",
                  value: `${teams.length}/${league.max_teams}`,
                  color: C,
                },
                { label: "ROUNDS", value: rounds.length, color: "#00F5D4" },
                {
                  label: "PLAYED",
                  value: matches.filter((m) => m.status === "final").length,
                  color: "#00FF9C",
                },
              ].map(({ label, value, color }) => (
                <View
                  key={label}
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(11,20,40,0.9)",
                    borderWidth: 1,
                    borderColor: "rgba(255,0,204,0.12)",
                    borderRadius: 10,
                    padding: 14,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.orbitronBold,
                      fontSize: 22,
                      color,
                      marginBottom: 4,
                    }}
                  >
                    {value}
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9,
                      color: "rgba(180,200,220,0.4)",
                      letterSpacing: 2,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Join code */}
            <View
              style={{
                backgroundColor: "rgba(11,20,40,0.9)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.2)",
                borderRadius: 12,
                padding: 20,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(255,0,204,0.5)",
                  letterSpacing: 4,
                  marginBottom: 12,
                }}
              >
                LEAGUE JOIN CODE
              </Text>
              <Text
                style={{
                  fontFamily: F.orbitron,
                  fontSize: 36,
                  color: C,
                  letterSpacing: 8,
                  marginBottom: 8,
                }}
              >
                {league.join_code}
              </Text>
              <Text
                style={{
                  fontFamily: F.rajdhani,
                  fontSize: 13,
                  color: "rgba(180,200,220,0.4)",
                  textAlign: "center",
                }}
              >
                Share with captains to register their teams
              </Text>
            </View>

            {/* Rules */}
            <View
              style={{
                backgroundColor: "rgba(11,20,40,0.9)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.12)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,0,204,0.08)",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 10,
                    color: "rgba(255,0,204,0.5)",
                    letterSpacing: 3,
                  }}
                >
                  // RULES & FORMAT
                </Text>
              </View>
              {[
                ["MATCH FORMAT", league.match_format],
                ["DURATION", `${league.match_duration_minutes} MINS`],
                ["FIELDS", league.fields_count],
                ["WIN POINTS", league.points_win],
                ["DRAW POINTS", league.points_draw],
              ].map(([label, value], i, arr) => (
                <View
                  key={label}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                    borderBottomColor: "rgba(255,0,204,0.06)",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 10,
                      color: "rgba(180,200,220,0.4)",
                      letterSpacing: 2,
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.orbitronBold,
                      fontSize: 13,
                      color: "#F4F4F9",
                    }}
                  >
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Cancel button */}
            {(league.status === "registration" ||
              league.status === "active") && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "Cancel League",
                    "Cancel this league? This cannot be undone.",
                    [
                      { text: "Keep League", style: "cancel" },
                      {
                        text: "Cancel League",
                        style: "destructive",
                        onPress: () => cancelLeagueMutation.mutate(),
                      },
                    ],
                  )
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: "rgba(255,0,0,0.05)",
                  borderWidth: 1,
                  borderColor: "rgba(255,0,0,0.2)",
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <StopCircle size={16} color="rgba(255,80,80,0.7)" />
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: "rgba(255,80,80,0.7)",
                    letterSpacing: 2,
                  }}
                >
                  CANCEL LEAGUE
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TEAMS */}
        {activeTab === "teams" && (
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(255,0,204,0.5)",
                  letterSpacing: 3,
                }}
              >
                // TEAM MANAGEMENT ({teams.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setTeamName("");
                  setShowAddTeam(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: "rgba(255,0,204,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,0,204,0.3)",
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
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

            {teams.length === 0 ? (
              <View
                style={{
                  backgroundColor: "rgba(11,20,40,0.6)",
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: "rgba(255,0,204,0.15)",
                  borderRadius: 10,
                  padding: 40,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 10,
                    color: "rgba(255,0,204,0.25)",
                    letterSpacing: 3,
                  }}
                >
                  NO TEAMS REGISTERED
                </Text>
              </View>
            ) : (
              teams.map((team, idx) => (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => {
                    setSelectedTeam(team);
                    setTeamName(team.name);
                    setShowManageTeam(true);
                  }}
                  style={{
                    backgroundColor: "rgba(11,20,40,0.9)",
                    borderWidth: 1,
                    borderColor: "rgba(255,0,204,0.12)",
                    borderRadius: 10,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor: "rgba(255,0,204,0.1)",
                      borderWidth: 1,
                      borderColor: "rgba(255,0,204,0.25)",
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ fontFamily: F.mono, fontSize: 11, color: C }}
                    >
                      #{idx + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: F.rajdhaniBold,
                        fontSize: 16,
                        color: "#F4F4F9",
                        marginBottom: 2,
                      }}
                    >
                      {team.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: "rgba(180,200,220,0.4)",
                        letterSpacing: 1,
                      }}
                    >
                      {team.captain_name
                        ? `CAPTAIN: ${team.captain_name.toUpperCase()}`
                        : "NO CAPTAIN"}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="rgba(255,0,204,0.3)" />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* FIXTURES */}
        {activeTab === "fixtures" && (
          <View style={{ gap: 16 }}>
            {matches.length === 0 ? (
              <View
                style={{
                  backgroundColor: "rgba(11,20,40,0.6)",
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: "rgba(255,0,204,0.15)",
                  borderRadius: 10,
                  padding: 48,
                  alignItems: "center",
                }}
              >
                <Calendar
                  size={40}
                  color="rgba(255,0,204,0.2)"
                  style={{ marginBottom: 16 }}
                />
                <Text
                  style={{
                    fontFamily: F.orbitronBold,
                    fontSize: 14,
                    color: "#F4F4F9",
                    marginBottom: 8,
                    letterSpacing: 1,
                  }}
                >
                  NO FIXTURES YET
                </Text>
                <Text
                  style={{
                    fontFamily: F.rajdhani,
                    fontSize: 13,
                    color: "rgba(180,200,220,0.4)",
                    textAlign: "center",
                  }}
                >
                  Close registration to generate the schedule
                </Text>
              </View>
            ) : (
              rounds.map((roundNum) => (
                <View key={roundNum} style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 10,
                        color: "rgba(255,0,204,0.5)",
                        letterSpacing: 3,
                      }}
                    >
                      ROUND {roundNum}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: "rgba(255,0,204,0.1)",
                      }}
                    />
                  </View>
                  {matches
                    .filter((m) => m.round_number === roundNum)
                    .map((match) => {
                      const isLive = match.status === "live";
                      const isFinal = match.status === "final";
                      const sc = isLive
                        ? "#FF00CC"
                        : isFinal
                          ? "rgba(180,200,220,0.4)"
                          : "#00F5D4";
                      return (
                        <View
                          key={match.id}
                          style={{
                            backgroundColor: "rgba(11,20,40,0.9)",
                            borderWidth: 1,
                            borderColor: isLive
                              ? "rgba(255,0,204,0.4)"
                              : "rgba(255,0,204,0.1)",
                            borderRadius: 10,
                            padding: 14,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              marginBottom: 10,
                            }}
                          >
                            <View style={{ flexDirection: "row", gap: 10 }}>
                              <Text
                                style={{
                                  fontFamily: F.mono,
                                  fontSize: 9,
                                  color: "rgba(255,0,204,0.5)",
                                  letterSpacing: 1,
                                }}
                              >
                                F{match.field_number}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: F.mono,
                                  fontSize: 9,
                                  color: "#F4F4F9",
                                  letterSpacing: 1,
                                }}
                              >
                                {match.time_slot}
                              </Text>
                            </View>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <View
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: sc,
                                }}
                              />
                              <Text
                                style={{
                                  fontFamily: F.mono,
                                  fontSize: 9,
                                  color: sc,
                                  letterSpacing: 1,
                                }}
                              >
                                {match.status?.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: F.rajdhaniBold,
                                fontSize: 14,
                                color: "#F4F4F9",
                                flex: 1,
                              }}
                              numberOfLines={1}
                            >
                              {match.home_team_name || "TBD"}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                paddingHorizontal: 12,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: F.orbitron,
                                  fontSize: 20,
                                  color: isLive ? "#FF00CC" : "#F4F4F9",
                                }}
                              >
                                {match.home_score}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: F.mono,
                                  fontSize: 14,
                                  color: "rgba(180,200,220,0.2)",
                                }}
                              >
                                —
                              </Text>
                              <Text
                                style={{
                                  fontFamily: F.orbitron,
                                  fontSize: 20,
                                  color: isLive ? "#FF00CC" : "#F4F4F9",
                                }}
                              >
                                {match.away_score}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontFamily: F.rajdhaniBold,
                                fontSize: 14,
                                color: "#F4F4F9",
                                flex: 1,
                                textAlign: "right",
                              }}
                              numberOfLines={1}
                            >
                              {match.away_team_name || "TBD"}
                            </Text>
                          </View>
                          {match.status === "scheduled" && (
                            <TouchableOpacity
                              onPress={() =>
                                Alert.alert(
                                  "Send Reminder",
                                  `Send match reminder to both captains for this match?`,
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                      text: "Send",
                                      onPress: () =>
                                        sendReminderMutation.mutate(match.id),
                                    },
                                  ],
                                )
                              }
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTopWidth: 1,
                                borderTopColor: "rgba(255,0,204,0.08)",
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              <Send size={11} color="rgba(255,0,204,0.5)" />
                              <Text
                                style={{
                                  fontFamily: F.mono,
                                  fontSize: 9,
                                  color: "rgba(255,0,204,0.5)",
                                  letterSpacing: 2,
                                }}
                              >
                                SEND REMINDER
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                </View>
              ))
            )}
          </View>
        )}

        {/* STANDINGS */}
        {activeTab === "standings" && stats && (
          <View
            style={{
              backgroundColor: "rgba(11,20,40,0.9)",
              borderWidth: 1,
              borderColor: "rgba(255,0,204,0.12)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                padding: 14,
                backgroundColor: "rgba(255,0,204,0.06)",
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,0,204,0.1)",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(255,0,204,0.5)",
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
                  color: "rgba(255,0,204,0.5)",
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
                  color: "rgba(255,0,204,0.5)",
                  letterSpacing: 2,
                  width: 28,
                  textAlign: "center",
                }}
              >
                P
              </Text>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(255,0,204,0.5)",
                  letterSpacing: 2,
                  width: 28,
                  textAlign: "center",
                }}
              >
                W
              </Text>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(255,0,204,0.5)",
                  letterSpacing: 2,
                  width: 40,
                  textAlign: "right",
                }}
              >
                PTS
              </Text>
            </View>
            {stats.standings.map((team, idx) => {
              const posColor =
                idx === 0
                  ? "#FFD700"
                  : idx === 1
                    ? "#C0C0C0"
                    : idx === 2
                      ? "#CD7F32"
                      : null;
              return (
                <View
                  key={team.slot_id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: idx < stats.standings.length - 1 ? 1 : 0,
                    borderBottomColor: "rgba(255,0,204,0.06)",
                  }}
                >
                  <View style={{ width: 28 }}>
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
                            fontSize: 10,
                            color: posColor,
                          }}
                        >
                          {idx + 1}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 11,
                          color: "rgba(180,200,220,0.4)",
                        }}
                      >
                        {idx + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontFamily: F.rajdhaniBold,
                      fontSize: 14,
                      color: "#F4F4F9",
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {team.team_name || `Slot ${idx + 1}`}
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 12,
                      color: "rgba(180,200,220,0.5)",
                      width: 28,
                      textAlign: "center",
                    }}
                  >
                    {team.played}
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 12,
                      color: "#00FF9C",
                      width: 28,
                      textAlign: "center",
                    }}
                  >
                    {team.wins}
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.orbitron,
                      fontSize: 15,
                      color: C,
                      width: 40,
                      textAlign: "right",
                    }}
                  >
                    {team.points}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Team Modal */}
      <Modal
        visible={showAddTeam}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTeam(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#0D1B2E",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,0,204,0.3)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitronBold,
                  fontSize: 16,
                  color: "#F4F4F9",
                  letterSpacing: 2,
                }}
              >
                // ADD TEAM
              </Text>
              <TouchableOpacity onPress={() => setShowAddTeam(false)}>
                <X size={20} color="rgba(255,0,204,0.4)" />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(255,0,204,0.5)",
                letterSpacing: 3,
                marginBottom: 8,
              }}
            >
              TEAM NAME
            </Text>
            <TextInput
              value={teamName}
              onChangeText={setTeamName}
              placeholder="e.g. Phoenix FC"
              placeholderTextColor="rgba(180,200,220,0.3)"
              style={{
                height: 48,
                backgroundColor: "rgba(255,0,204,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.3)",
                borderRadius: 8,
                paddingHorizontal: 16,
                color: "#F4F4F9",
                fontFamily: F.rajdhaniBold,
                fontSize: 16,
                marginBottom: 20,
              }}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowAddTeam(false)}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: "rgba(180,200,220,0.5)",
                    letterSpacing: 2,
                  }}
                >
                  CANCEL
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => addTeamMutation.mutate(teamName)}
                disabled={!teamName.trim() || addTeamMutation.isPending}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: "rgba(255,0,204,0.15)",
                  borderWidth: 1,
                  borderColor: C,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: !teamName.trim() ? 0.4 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: C,
                    letterSpacing: 2,
                  }}
                >
                  {addTeamMutation.isPending ? "ADDING..." : "ADD TEAM →"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage Team Modal */}
      <Modal
        visible={showManageTeam}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageTeam(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#0D1B2E",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,0,204,0.3)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitronBold,
                  fontSize: 16,
                  color: "#F4F4F9",
                  letterSpacing: 2,
                }}
              >
                // MANAGE TEAM
              </Text>
              <TouchableOpacity onPress={() => setShowManageTeam(false)}>
                <X size={20} color="rgba(255,0,204,0.4)" />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(255,0,204,0.5)",
                letterSpacing: 3,
                marginBottom: 8,
              }}
            >
              TEAM NAME
            </Text>
            <TextInput
              value={teamName}
              onChangeText={setTeamName}
              style={{
                height: 48,
                backgroundColor: "rgba(255,0,204,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.3)",
                borderRadius: 8,
                paddingHorizontal: 16,
                color: "#F4F4F9",
                fontFamily: F.rajdhaniBold,
                fontSize: 16,
                marginBottom: 20,
              }}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Delete Team", `Delete ${selectedTeam?.name}?`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => deleteTeamMutation.mutate(selectedTeam.id),
                    },
                  ])
                }
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: "rgba(255,0,0,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,0,0,0.2)",
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 10,
                    color: "rgba(255,80,80,0.7)",
                    letterSpacing: 2,
                  }}
                >
                  DELETE
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  updateTeamMutation.mutate({
                    teamId: selectedTeam.id,
                    name: teamName,
                  })
                }
                disabled={updateTeamMutation.isPending}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: "rgba(255,0,204,0.15)",
                  borderWidth: 1,
                  borderColor: C,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: C,
                    letterSpacing: 2,
                  }}
                >
                  {updateTeamMutation.isPending ? "SAVING..." : "UPDATE →"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Season Modal */}
      <Modal
        visible={showNewSeason}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewSeason(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#0D1B2E",
              borderTopWidth: 1,
              borderTopColor: "rgba(0,245,212,0.3)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitronBold,
                  fontSize: 16,
                  color: "#F4F4F9",
                  letterSpacing: 2,
                }}
              >
                // NEW SEASON
              </Text>
              <TouchableOpacity onPress={() => setShowNewSeason(false)}>
                <X size={20} color="rgba(0,245,212,0.4)" />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(0,245,212,0.5)",
                letterSpacing: 3,
                marginBottom: 8,
              }}
            >
              SEASON NAME
            </Text>
            <TextInput
              value={newSeasonName}
              onChangeText={setNewSeasonName}
              placeholder="e.g. Season 2"
              placeholderTextColor="rgba(180,200,220,0.3)"
              style={{
                height: 48,
                backgroundColor: "rgba(0,245,212,0.05)",
                borderWidth: 1,
                borderColor: "rgba(0,245,212,0.3)",
                borderRadius: 8,
                paddingHorizontal: 16,
                color: "#F4F4F9",
                fontFamily: F.rajdhaniBold,
                fontSize: 16,
                marginBottom: 20,
              }}
              autoFocus
            />
            <TouchableOpacity
              onPress={() => {
                /* createNewSeasonMutation.mutate(newSeasonName) */
              }}
              style={{
                height: 48,
                backgroundColor: "rgba(0,245,212,0.1)",
                borderWidth: 1,
                borderColor: "#00F5D4",
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 11,
                  color: "#00F5D4",
                  letterSpacing: 2,
                }}
              >
                CREATE SEASON →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
