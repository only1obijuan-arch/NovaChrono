import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Shield,
  AlertTriangle,
  Trophy,
  Clock,
  Users,
} from "lucide-react-native";
import { apiFetch } from "@/utils/api";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#00FF9C";

export default function LeagueRules() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { leagueId } = useLocalSearchParams();

  const { data: league, isLoading } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const res = await apiFetch(`/api/leagues?leagueId=${leagueId}`);
      return res.json();
    },
    enabled: !!leagueId,
  });

  const rules = [
    {
      Icon: Clock,
      category: "MATCH FORMAT",
      color: C,
      items: [
        `Matches consist of two ${league?.match_duration_minutes ? league.match_duration_minutes / 2 : 20}-minute halves with a short half-time break.`,
        "The referee's clock is the official match time.",
        "Teams must be ready to play within 5 minutes of their scheduled kick-off time.",
        "A forfeit will be awarded if a team cannot field enough players after 10 minutes.",
        "The referee has full authority to pause, extend, or abandon a match.",
      ],
    },
    {
      Icon: Users,
      category: "TEAM & PLAYERS",
      color: C,
      items: [
        "Each team must have a minimum of 5 players to start a match.",
        "A team may play with a minimum of 4 players if a player is injured or sent off.",
        "All players must be registered on the team roster before the match starts.",
        "Substitutions are unlimited and can be made at any stoppage in play.",
        "Team captains are responsible for their team's conduct on and off the field.",
      ],
    },
    {
      Icon: Shield,
      category: "PERMISSION TO PLAY",
      color: "#00F5D4",
      items: [
        "If a team is short of players and wants to use members from another registered team, the referee is instructed to alert the opposition team, who will decide whether to allow participation of that player.",
        "This law applies to all players, including goalkeepers.",
      ],
    },
    {
      Icon: Shield,
      category: "TRAVELLING",
      color: "#00F5D4",
      items: [
        "Players are not permitted to dribble the ball against the wall whilst using their body to shield a defender.",
        "The referee is instructed to initiate a 3-second countdown during which the ball must be used or played. If the player has not made any usage of the ball within this period, a foul will be awarded to the opposing team.",
      ],
    },
    {
      Icon: Shield,
      category: "BACKING",
      color: "#00F5D4",
      items: [
        "No player is permitted to reverse into a defender while in control of the ball.",
        "No player is permitted to intentionally hold the ball for longer than 3 seconds with their back towards a defender.",
        "The referee is instructed to award the opposing team a foul for any violation of this rule.",
      ],
    },
    {
      Icon: Shield,
      category: "2 ON 1",
      color: "#00F5D4",
      items: [
        "Only one player is permitted to tackle an attacking player at any given time.",
        "Any other defending player who intentionally or unintentionally obstructs or impedes the attacking player's use of the ball will be considered a foul.",
      ],
    },
    {
      Icon: AlertTriangle,
      category: "TACKLING FROM BEHIND",
      color: "#FFB800",
      items: [
        "Tackling from behind is not permitted under any circumstance.",
        "This includes lunging or swinging a leg around the ball carrier.",
        "The defending player's shoulder must be in front of the attacking player's shoulder for a clean tackle to be made.",
        "Goalkeepers are permitted to use their hands to retrieve the ball from behind an attacking player, but only within their own defensive box.",
      ],
    },
    {
      Icon: AlertTriangle,
      category: "UPSTANDING",
      color: "#FFB800",
      items: [
        "No player is permitted to leave their feet, intentionally or unintentionally, to play the ball. This includes any part of their body or hands touching the ground.",
        "If a player in possession of the ball unintentionally leaves their feet during the speed of play, the opposing team will be awarded a foul.",
        "The goalkeeper is exempt from this law only if the challenge is clean and occurs within their own defensive box.",
      ],
    },
    {
      Icon: AlertTriangle,
      category: "CHIPPING & BACK PASS",
      color: "#FFB800",
      items: [
        "Goalkeepers are not permitted to pick up a back pass from their own teammate, including wall passes.",
        "Goalkeepers are not permitted to score directly from a throw.",
      ],
    },
    {
      Icon: AlertTriangle,
      category: "HANDBALL",
      color: "#FFB800",
      items: [
        "Any contact with the hand is considered handball.",
        "This includes intentional and unintentional contact from below the sleeve of a t-shirt.",
      ],
    },
    {
      Icon: Clock,
      category: "5 SECONDS — CORNER RULE",
      color: C,
      items: [
        "A player is only permitted 5 seconds to remain in the corner with the ball.",
        "If a player has not made any usage of the ball within those 5 seconds, this will result in a turnover of possession to the opposing team.",
      ],
    },
    {
      Icon: Clock,
      category: "KICK OFF",
      color: C,
      items: [
        "Players are allowed to take shots directly from kick-off.",
        "Players must wait for the referee's whistle before play can resume.",
        "The referee will initiate a 5-second countdown after blowing the whistle for play to resume.",
      ],
    },
    {
      Icon: Shield,
      category: "PENALTIES",
      color: "#00F5D4",
      items: [
        "One foot must always remain grounded and stationary next to the ball during a penalty kick.",
        "The goalkeeper must be on the goal line before the penalty is taken.",
      ],
    },
    {
      Icon: Shield,
      category: "THE WALL",
      color: "#00F5D4",
      items: [
        "Only a one-man wall is permitted.",
        "The wall must be positioned at least 2 metres away from the free kick spot.",
      ],
    },
    {
      Icon: Trophy,
      category: "THE CARDS",
      color: "#FF00CC",
      items: [
        "🔵 BLUE CARD — Direct substitution for the offending player with a 2-minute cooling-off period.",
        "🟡 YELLOW CARD — The offending player is sent off for a 2-minute period. The team plays with one player down before the same or a different player may re-enter the pitch.",
        "🔴 RED CARD — The offending player is dismissed for the remainder of the match. The team plays with one player down for a 5-minute period before being permitted to introduce another player.",
      ],
    },
    {
      Icon: Trophy,
      category: "CARD COUNTING",
      color: "#FF00CC",
      items: [
        "3 warnings for intentional fouls results in a Blue Card.",
        "1 further warning for intentional fouls after a Blue Card results in a Yellow or Red Card, dependent on the nature of the foul or the level of disrespect shown towards players and match officials.",
      ],
    },
    {
      Icon: Trophy,
      category: "POINTS & STANDINGS",
      color: "#FF00CC",
      items: [
        `A win is worth ${league?.win_points ?? 3} points.`,
        `A draw is worth ${league?.draw_points ?? 1} point per team.`,
        "A loss earns 0 points.",
        `A forfeit results in a ${league?.forfeit_score_home ?? 3}-${league?.forfeit_score_away ?? 0} score against the forfeiting team.`,
        "In the case of a tie on points, goal difference, then goals scored, then head-to-head result is used to determine the final standing.",
      ],
    },
  ];

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
          CAPTAIN PORTAL
        </Text>
        <Text style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}>
          LEAGUE RULES
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(0,255,156,0.3)", letterSpacing: 2, marginTop: 4 }}>
          16 LAWS OF THE GAME
        </Text>
        {league?.name && (
          <Text style={{ fontFamily: F.rajdhani, fontSize: 14, color: "rgba(0,255,156,0.6)", marginTop: 4 }}>
            {league.name.toUpperCase()}
          </Text>
        )}

        {/* Format badges */}
        {league && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {league.match_format && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,255,156,0.06)", borderWidth: 1, borderColor: "rgba(0,255,156,0.2)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Clock size={9} color="rgba(0,255,156,0.7)" />
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.7)", letterSpacing: 1 }}>
                  {league.match_format} FORMAT
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,255,156,0.06)", borderWidth: 1, borderColor: "rgba(0,255,156,0.2)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Trophy size={9} color="rgba(0,255,156,0.7)" />
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.7)", letterSpacing: 1 }}>
                {league.win_points ?? 3} PTS WIN
              </Text>
            </View>
            {league.fields_count != null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,255,156,0.06)", borderWidth: 1, borderColor: "rgba(0,255,156,0.2)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Shield size={9} color="rgba(0,255,156,0.7)" />
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.7)", letterSpacing: 1 }}>
                  {league.fields_count} FIELD{league.fields_count > 1 ? "S" : ""}
                </Text>
              </View>
            )}
            {league.max_teams != null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,255,156,0.06)", borderWidth: 1, borderColor: "rgba(0,255,156,0.2)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Users size={9} color="rgba(0,255,156,0.7)" />
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: "rgba(0,255,156,0.7)", letterSpacing: 1 }}>
                  {league.max_teams} TEAMS MAX
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C} />
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(0,255,156,0.5)", letterSpacing: 3, marginTop: 16 }}>
            LOADING...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 10 }}>
            {rules.map((section) => (
              <View
                key={section.category}
                style={{
                  backgroundColor: "rgba(11,20,40,0.9)",
                  borderWidth: 1,
                  borderColor: "rgba(0,255,156,0.15)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    backgroundColor: "rgba(0,255,156,0.04)",
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(0,255,156,0.1)",
                  }}
                >
                  <section.Icon size={14} color={section.color} />
                  <Text style={{ fontFamily: F.orbitron, fontSize: 11, color: "#F4F4F9", letterSpacing: 2 }}>
                    {section.category}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 18, paddingVertical: 8 }}>
                  {section.items.map((rule, j) => (
                    <View
                      key={j}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 12,
                        paddingVertical: 10,
                        borderBottomWidth: j < section.items.length - 1 ? 1 : 0,
                        borderBottomColor: "rgba(0,255,156,0.05)",
                      }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: C,
                          marginTop: 7,
                          flexShrink: 0,
                        }}
                      />
                      <Text style={{ flex: 1, fontFamily: F.rajdhani, fontSize: 14, color: "rgba(180,200,220,0.8)", lineHeight: 20 }}>
                        {rule}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* Footer note */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 12,
                backgroundColor: "rgba(255,184,0,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,184,0,0.15)",
                borderRadius: 10,
                padding: 18,
              }}
            >
              <AlertTriangle size={14} color="rgba(255,184,0,0.6)" style={{ marginTop: 2, flexShrink: 0 }} />
              <Text style={{ flex: 1, fontFamily: F.rajdhani, fontSize: 14, color: "rgba(255,184,0,0.6)", lineHeight: 20 }}>
                Rules are subject to change at the discretion of the league administrator. Any amendments will be communicated to team captains before they take effect. If you have any questions, contact your venue admin directly.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
