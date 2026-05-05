// Match detail screen
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Vibration,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { apiFetch } from "@/utils/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Trash2,
  X,
} from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};

const HALF_DURATION = 20 * 60; // 20 minutes in seconds
const C = "#A42DB4";
const CYAN = "#00F5D4";

export default function MatchControl() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [half, setHalf] = useState(1);
  const [halfStatus, setHalfStatus] = useState("pre"); // pre | running | halftime | second | finished_halves | finished
  const [showPlayerSelect, setShowPlayerSelect] = useState(null); // 'home' | 'away' | null
  const timerRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ["match-detail", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/matches?matchId=${id}`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: homePlayers = [] } = useQuery({
    queryKey: ["home-players", data?.match?.home_team_id],
    queryFn: async () => {
      const res = await apiFetch(`/api/players?teamId=${data.match.home_team_id}`);
      return res.json();
    },
    enabled: !!data?.match?.home_team_id,
  });

  const { data: awayPlayers = [] } = useQuery({
    queryKey: ["away-players", data?.match?.away_team_id],
    queryFn: async () => {
      const res = await apiFetch(`/api/players?teamId=${data.match.away_team_id}`);
      return res.json();
    },
    enabled: !!data?.match?.away_team_id,
  });

  const startMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ action: "START_MATCH", matchId: id }),
      });
      return res.json();
    },
    onSuccess: () => {
      setIsActive(true);
      setHalfStatus("running");
      setHalf(1);
      setSeconds(0);
      queryClient.invalidateQueries(["match-detail", id]);
    },
  });

  const recordGoalMutation = useMutation({
    mutationFn: async ({ type, playerId }) => {
      const res = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({
          action: "RECORD_GOAL",
          matchId: id,
          type,
          playerId,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["match-detail", id]);
      setShowPlayerSelect(null);
      Vibration.vibrate(100);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId) => {
      const res = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ action: "DELETE_EVENT", matchId: id, eventId }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["match-detail", id]),
  });

  const endMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ action: "END_MATCH", matchId: id }),
      });
      return res.json();
    },
    onSuccess: () => {
      setIsActive(false);
      setHalfStatus("finished");
      router.replace("/(referee-tabs)");
    },
  });

  // Timer
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev + 1 >= HALF_DURATION) {
            clearInterval(timerRef.current);
            setIsActive(false);
            if (halfStatus === "running") {
              setHalfStatus("halftime");
              Vibration.vibrate([0, 200, 100, 200]);
            } else if (halfStatus === "second") {
              setHalfStatus("finished_halves");
              Vibration.vibrate([0, 200, 100, 200, 100, 200]);
            }
            return HALF_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, halfStatus]);

  const startSecondHalfMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ action: "START_SECOND_HALF", matchId: id }),
      });
      return res.json();
    },
    onSuccess: () => {
      setSeconds(0);
      setHalf(2);
      setHalfStatus("second");
      setIsActive(true);
      queryClient.invalidateQueries(["match-detail", id]);
    },
  });

  const startSecondHalf = () => startSecondHalfMutation.mutate();

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleGoalClick = (side) => {
    const players = side === "home" ? homePlayers : awayPlayers;
    if (players.length === 0) {
      recordGoalMutation.mutate({
        type: side === "home" ? "goal_home" : "goal_away",
        playerId: null,
      });
    } else {
      setShowPlayerSelect(side);
    }
  };

  const progressPct = Math.min((seconds / HALF_DURATION) * 100, 100);

  if (isLoading) {
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
            fontFamily: F.mono,
            color: C,
            letterSpacing: 4,
            fontSize: 12,
          }}
        >
          LOADING MATCH...
        </Text>
      </View>
    );
  }

  const { match, events = [] } = data || {};
  if (!match) return null;

  const isLive = match.status === "live";
  const isFinished = match.status === "final";
  const canScore =
    isLive && (halfStatus === "running" || halfStatus === "second");
  const isHalftime = halfStatus === "halftime";
  const isFulltime = halfStatus === "finished_halves";

  const timerColor = isHalftime
    ? "#FFD700"
    : isFulltime
      ? "#00FF9C"
      : isActive
        ? CYAN
        : "#F4F4F9";
  const halfLabel = half === 1 ? "1ST HALF" : "2ND HALF";

  return (
    <View style={{ flex: 1, backgroundColor: "#091833" }}>
      <StatusBar style="light" />

      {/* Grid */}
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

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(164,45,180,0.15)",
          backgroundColor: "rgba(9,24,51,0.97)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft size={16} color="rgba(164,45,180,0.6)" />
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              color: "rgba(164,45,180,0.6)",
              letterSpacing: 2,
            }}
          >
            EXIT
          </Text>
        </TouchableOpacity>

        {/* Timer */}
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 9,
              color: "rgba(0,245,212,0.4)",
              letterSpacing: 3,
              marginBottom: 2,
            }}
          >
            MATCH TIME
          </Text>
          <Text
            style={{
              fontFamily: F.orbitron,
              fontSize: 32,
              color: timerColor,
              lineHeight: 36,
            }}
          >
            {formatTime(seconds)}
          </Text>
          {halfStatus !== "pre" && (
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: isHalftime
                  ? "#FFD700"
                  : isFulltime
                    ? "#00FF9C"
                    : "rgba(0,245,212,0.5)",
                letterSpacing: 2,
                marginTop: 2,
              }}
            >
              {isHalftime ? "HALF TIME" : isFulltime ? "FULL TIME" : halfLabel}
            </Text>
          )}
        </View>

        <View
          style={{
            backgroundColor: "rgba(164,45,180,0.1)",
            borderWidth: 1,
            borderColor: "rgba(164,45,180,0.3)",
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: 11,
              color: C,
              letterSpacing: 1,
            }}
          >
            F{match.field_number}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      {halfStatus !== "pre" && halfStatus !== "finished" && (
        <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.05)" }}>
          <View
            style={{
              height: 3,
              width: `${progressPct}%`,
              backgroundColor: isHalftime
                ? "#FFD700"
                : isFulltime
                  ? "#00FF9C"
                  : CYAN,
            }}
          />
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* Score section */}
        <View style={{ flexDirection: "row", padding: 16, gap: 12 }}>
          {/* Home team */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(11,20,40,0.9)",
              borderWidth: 1,
              borderColor: `${CYAN}40`,
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              borderTopWidth: 3,
              borderTopColor: CYAN,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: `${CYAN}80`,
                letterSpacing: 2,
                marginBottom: 6,
              }}
              numberOfLines={1}
            >
              HOME
            </Text>
            <Text
              style={{
                fontFamily: F.orbitronBold,
                fontSize: 13,
                color: "#F4F4F9",
                letterSpacing: 1,
                marginBottom: 12,
                textAlign: "center",
              }}
              numberOfLines={2}
            >
              {match.home_team_name || "HOME"}
            </Text>
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 72,
                color: "#F4F4F9",
                lineHeight: 76,
              }}
            >
              {match.home_score}
            </Text>
            <TouchableOpacity
              onPress={() => handleGoalClick("home")}
              disabled={!canScore}
              activeOpacity={0.7}
              style={{
                width: "100%",
                height: 48,
                marginTop: 16,
                backgroundColor: canScore ? CYAN : "rgba(0,245,212,0.05)",
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                opacity: canScore ? 1 : 0.3,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitron,
                  fontSize: 14,
                  color: canScore ? "#091833" : CYAN,
                  letterSpacing: 2,
                }}
              >
                + GOAL
              </Text>
            </TouchableOpacity>
          </View>

          {/* Center VS */}
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: 32,
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 14,
                color: "rgba(180,200,220,0.2)",
              }}
            >
              VS
            </Text>
          </View>

          {/* Away team */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(11,20,40,0.9)",
              borderWidth: 1,
              borderColor: "rgba(255,0,204,0.4)",
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              borderTopWidth: 3,
              borderTopColor: "#FF00CC",
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(255,0,204,0.6)",
                letterSpacing: 2,
                marginBottom: 6,
              }}
            >
              AWAY
            </Text>
            <Text
              style={{
                fontFamily: F.orbitronBold,
                fontSize: 13,
                color: "#F4F4F9",
                letterSpacing: 1,
                marginBottom: 12,
                textAlign: "center",
              }}
              numberOfLines={2}
            >
              {match.away_team_name || "AWAY"}
            </Text>
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 72,
                color: "#F4F4F9",
                lineHeight: 76,
              }}
            >
              {match.away_score}
            </Text>
            <TouchableOpacity
              onPress={() => handleGoalClick("away")}
              disabled={!canScore}
              activeOpacity={0.7}
              style={{
                width: "100%",
                height: 48,
                marginTop: 16,
                backgroundColor: canScore ? "#FF00CC" : "rgba(255,0,204,0.05)",
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                opacity: canScore ? 1 : 0.3,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitron,
                  fontSize: 14,
                  color: canScore ? "#091833" : "#FF00CC",
                  letterSpacing: 2,
                }}
              >
                + GOAL
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Halftime banner */}
        {isHalftime && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16,
              backgroundColor: "rgba(255,215,0,0.08)",
              borderWidth: 2,
              borderColor: "rgba(255,215,0,0.4)",
              borderRadius: 12,
              padding: 24,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 20,
                color: "#FFD700",
                letterSpacing: 4,
                marginBottom: 6,
              }}
            >
              ⏸ HALF TIME
            </Text>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(255,215,0,0.5)",
                letterSpacing: 3,
                marginBottom: 20,
              }}
            >
              1ST HALF COMPLETE
            </Text>
            <TouchableOpacity
              onPress={startSecondHalf}
              activeOpacity={0.8}
              style={{
                backgroundColor: "#FFD700",
                borderRadius: 8,
                paddingVertical: 16,
                paddingHorizontal: 32,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitron,
                  fontSize: 16,
                  color: "#091833",
                  letterSpacing: 2,
                }}
              >
                ▶ START 2ND HALF
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fulltime banner */}
        {isFulltime && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16,
              backgroundColor: "rgba(0,255,156,0.06)",
              borderWidth: 1,
              borderColor: "rgba(0,255,156,0.3)",
              borderRadius: 12,
              padding: 20,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 18,
                color: "#00FF9C",
                letterSpacing: 3,
                marginBottom: 4,
              }}
            >
              ⏱ FULL TIME
            </Text>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(0,255,156,0.5)",
                letterSpacing: 2,
              }}
            >
              END THE MATCH BELOW
            </Text>
          </View>
        )}

        {/* Controls */}
        <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 16 }}>
          {/* Start match */}
          {match.status === "scheduled" && (
            <TouchableOpacity
              onPress={() => startMatchMutation.mutate()}
              disabled={startMatchMutation.isPending}
              activeOpacity={0.8}
              style={{
                height: 64,
                backgroundColor: "rgba(0,255,156,0.15)",
                borderWidth: 1,
                borderColor: "#00FF9C",
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <Play size={24} color="#00FF9C" fill="#00FF9C" />
              <Text
                style={{
                  fontFamily: F.orbitron,
                  fontSize: 18,
                  color: "#00FF9C",
                  letterSpacing: 3,
                }}
              >
                START MATCH
              </Text>
            </TouchableOpacity>
          )}

          {/* Live controls */}
          {isLive && !isHalftime && (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setIsActive(!isActive)}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: "rgba(255,200,0,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,200,0,0.3)",
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isActive ? (
                  <Pause size={18} color="#FFD700" />
                ) : (
                  <Play size={18} color="#FFD700" />
                )}
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: "#FFD700",
                    letterSpacing: 2,
                  }}
                >
                  {isActive ? "PAUSE" : "RESUME"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "End Match",
                    "Are you sure you want to end this match?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "End Match",
                        style: "destructive",
                        onPress: () => endMatchMutation.mutate(),
                      },
                    ],
                  )
                }
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: "rgba(255,0,204,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,0,204,0.3)",
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <CheckCircle size={18} color="#FF00CC" />
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: "#FF00CC",
                    letterSpacing: 2,
                  }}
                >
                  END
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "Abandon Match",
                    "Are you sure you want to abandon this match?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Abandon",
                        style: "destructive",
                        onPress: () => {},
                      },
                    ],
                  )
                }
                activeOpacity={0.8}
                style={{
                  width: 52,
                  height: 52,
                  backgroundColor: "rgba(255,80,80,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,80,80,0.2)",
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AlertTriangle size={18} color="rgba(255,80,80,0.6)" />
              </TouchableOpacity>
            </View>
          )}

          {/* Finished */}
          {isFinished && (
            <View
              style={{
                backgroundColor: "rgba(180,200,220,0.04)",
                borderWidth: 1,
                borderColor: "rgba(180,200,220,0.1)",
                borderRadius: 8,
                padding: 20,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 12,
                  color: "rgba(180,200,220,0.4)",
                  letterSpacing: 4,
                }}
              >
                // MATCH FINISHED
              </Text>
            </View>
          )}
        </View>

        {/* Event feed */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: "rgba(11,20,40,0.9)",
            borderWidth: 1,
            borderColor: "rgba(164,45,180,0.15)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              padding: 14,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(164,45,180,0.1)",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(164,45,180,0.5)",
                letterSpacing: 3,
              }}
            >
              // LIVE EVENT FEED
            </Text>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: C,
                letterSpacing: 1,
                backgroundColor: "rgba(164,45,180,0.1)",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              {events.length} EVENTS
            </Text>
          </View>

          {events.length === 0 ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  color: "rgba(180,200,220,0.2)",
                  letterSpacing: 3,
                }}
              >
                NO EVENTS RECORDED
              </Text>
            </View>
          ) : (
            <View>
              {events.map((event, i) => {
                const isHomeGoal = event.type === "goal_home";
                const isAwayGoal = event.type === "goal_away";
                const eventColor = isHomeGoal
                  ? CYAN
                  : isAwayGoal
                    ? "#FF00CC"
                    : "rgba(180,200,220,0.3)";
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      gap: 12,
                      borderLeftWidth: 3,
                      borderLeftColor: eventColor,
                      borderBottomWidth: i < events.length - 1 ? 1 : 0,
                      borderBottomColor: "rgba(164,45,180,0.06)",
                      backgroundColor:
                        i % 2 === 0 ? "rgba(0,0,0,0.1)" : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 10,
                        color: "rgba(180,200,220,0.3)",
                        letterSpacing: 1,
                        width: 40,
                      }}
                    >
                      {new Date(event.event_timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.rajdhaniBold,
                        fontSize: 14,
                        color: "#F4F4F9",
                        flex: 1,
                      }}
                    >
                      {isHomeGoal
                        ? `⚽ GOAL — ${match.home_team_name}${
                            event.player_name ? ` (${event.player_name})` : ""
                          }`
                        : isAwayGoal
                          ? `⚽ GOAL — ${match.away_team_name}${
                              event.player_name ? ` (${event.player_name})` : ""
                            }`
                          : event.type.replace(/_/g, " ").toUpperCase()}
                    </Text>
                    {(isHomeGoal || isAwayGoal) && isLive && (
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert(
                            "Delete Goal",
                            "Remove this goal from the match?",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () =>
                                  deleteEventMutation.mutate(event.id),
                              },
                            ],
                          )
                        }
                        style={{
                          padding: 6,
                          borderWidth: 1,
                          borderColor: "rgba(255,80,80,0.2)",
                          borderRadius: 4,
                        }}
                      >
                        <Trash2 size={14} color="rgba(255,80,80,0.5)" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Player select modal */}
      <Modal
        visible={!!showPlayerSelect}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlayerSelect(null)}
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
              paddingBottom: insets.bottom + 16,
              maxHeight: "70%",
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(0,245,212,0.1)",
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
                // WHO SCORED?
              </Text>
              <TouchableOpacity onPress={() => setShowPlayerSelect(null)}>
                <X size={20} color="rgba(0,245,212,0.4)" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
              {/* Unknown player option */}
              <TouchableOpacity
                onPress={() =>
                  recordGoalMutation.mutate({
                    type:
                      showPlayerSelect === "home" ? "goal_home" : "goal_away",
                    playerId: null,
                  })
                }
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  backgroundColor: "rgba(0,245,212,0.04)",
                  borderWidth: 1,
                  borderColor: "rgba(0,245,212,0.15)",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    backgroundColor: "rgba(0,245,212,0.1)",
                    borderWidth: 1,
                    borderColor: "rgba(0,245,212,0.3)",
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ fontFamily: F.mono, fontSize: 14, color: CYAN }}
                  >
                    ?
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: F.rajdhaniBold,
                    fontSize: 16,
                    color: "#F4F4F9",
                  }}
                >
                  Unknown Player
                </Text>
              </TouchableOpacity>

              {/* Player list */}
              {(showPlayerSelect === "home" ? homePlayers : awayPlayers).map(
                (player) => (
                  <TouchableOpacity
                    key={player.id}
                    onPress={() =>
                      recordGoalMutation.mutate({
                        type:
                          showPlayerSelect === "home"
                            ? "goal_home"
                            : "goal_away",
                        playerId: player.id,
                      })
                    }
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      backgroundColor: "rgba(0,245,212,0.04)",
                      borderWidth: 1,
                      borderColor: "rgba(0,245,212,0.1)",
                      borderRadius: 10,
                      padding: 14,
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        backgroundColor: "rgba(0,245,212,0.1)",
                        borderWidth: 1,
                        borderColor: "rgba(0,245,212,0.25)",
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 12,
                          color: CYAN,
                        }}
                      >
                        #{player.player_number || "--"}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: F.rajdhaniBold,
                        fontSize: 16,
                        color: "#F4F4F9",
                      }}
                    >
                      {player.name}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
