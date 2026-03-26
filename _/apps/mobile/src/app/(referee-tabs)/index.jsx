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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/utils/auth/useUser";
import { useRouter } from "expo-router";
import { Timer } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#A42DB4";
const CYAN = "#00F5D4";

export default function RefereeMatches() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate] = useState(new Date().toISOString().split("T")[0]);
  const { user } = useUser();

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["referee-matches", selectedDate, user?.venue_id],
    queryFn: async () => {
      const params = new URLSearchParams({ date: selectedDate });
      if (user?.venue_id) params.append("venueId", user.venue_id);
      if (user?.field_number) params.append("fieldNumber", user.field_number);
      const res = await fetch(`/api/matches?${params}`);
      return res.json();
    },
    enabled: !!user,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["referee-matches"]);
    setRefreshing(false);
  };

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
          // REFEREE PORTAL
        </Text>
        <Text
          style={{
            fontFamily: F.orbitron,
            fontSize: 26,
            color: "#F4F4F9",
            marginBottom: 16,
          }}
        >
          TODAY'S MATCHES
        </Text>
        <View
          style={{
            backgroundColor: "rgba(164,45,180,0.06)",
            borderWidth: 1,
            borderColor: "rgba(164,45,180,0.25)",
            borderRadius: 8,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
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
            {new Date(selectedDate)
              .toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })
              .toUpperCase()}
          </Text>
          <View
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C }}
          />
        </View>
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
        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
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
        ) : matches.length === 0 ? (
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
            <Timer
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
              NO MATCHES TODAY
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 14,
                color: "rgba(180,200,220,0.5)",
                textAlign: "center",
              }}
            >
              Pull to refresh or check another date
            </Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {matches.map((match) => {
              const isLive = match.status === "live";
              const isFinal = match.status === "final";
              const statusColor = isLive
                ? "#FF00CC"
                : isFinal
                ? "rgba(180,200,220,0.4)"
                : CYAN;
              return (
                <TouchableOpacity
                  key={match.id}
                  onPress={() => router.push(`/referee/match/${match.id}`)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: "rgba(11,20,40,0.9)",
                    borderWidth: 1,
                    borderColor: isLive
                      ? "rgba(255,0,204,0.4)"
                      : "rgba(164,45,180,0.2)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {isLive && (
                    <View style={{ height: 3, backgroundColor: "#FF00CC" }} />
                  )}
                  <View style={{ padding: 18 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 18,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: "rgba(164,45,180,0.1)",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: "rgba(164,45,180,0.3)",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: F.mono,
                              fontSize: 10,
                              color: C,
                              letterSpacing: 1,
                            }}
                          >
                            FIELD {match.field_number}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: F.orbitronBold,
                            fontSize: 16,
                            color: "#F4F4F9",
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
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: statusColor,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 10,
                            color: statusColor,
                            letterSpacing: 1,
                          }}
                        >
                          {match.status?.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: F.rajdhaniBold,
                            fontSize: 15,
                            color: "#F4F4F9",
                            marginBottom: 4,
                          }}
                        >
                          {match.home_team_name || "TBD"}
                        </Text>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 9,
                            color: `${CYAN}80`,
                            letterSpacing: 2,
                          }}
                        >
                          HOME
                        </Text>
                      </View>
                      <View
                        style={{ alignItems: "center", paddingHorizontal: 16 }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: F.orbitron,
                              fontSize: 36,
                              color: isLive ? "#FF00CC" : "#F4F4F9",
                            }}
                          >
                            {match.home_score}
                          </Text>
                          <Text
                            style={{
                              fontFamily: F.mono,
                              fontSize: 18,
                              color: "rgba(180,200,220,0.2)",
                            }}
                          >
                            —
                          </Text>
                          <Text
                            style={{
                              fontFamily: F.orbitron,
                              fontSize: 36,
                              color: isLive ? "#FF00CC" : "#F4F4F9",
                            }}
                          >
                            {match.away_score}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Text
                          style={{
                            fontFamily: F.rajdhaniBold,
                            fontSize: 15,
                            color: "#F4F4F9",
                            marginBottom: 4,
                            textAlign: "right",
                          }}
                        >
                          {match.away_team_name || "TBD"}
                        </Text>
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 9,
                            color: "rgba(255,0,204,0.6)",
                            letterSpacing: 2,
                          }}
                        >
                          AWAY
                        </Text>
                      </View>
                    </View>
                    {!isFinal && (
                      <View
                        style={{
                          marginTop: 14,
                          paddingTop: 14,
                          borderTopWidth: 1,
                          borderTopColor: "rgba(164,45,180,0.1)",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: F.mono,
                            fontSize: 10,
                            color: "rgba(164,45,180,0.5)",
                            letterSpacing: 2,
                          }}
                        >
                          TAP TO MANAGE MATCH →
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}