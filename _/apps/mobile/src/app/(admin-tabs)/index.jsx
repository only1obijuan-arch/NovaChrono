// Admin home
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/utils/auth/useUser";
import { useRouter } from "expo-router";
import {
  Plus,
  Trophy,
  Calendar,
  Users,
  ChevronRight,
  MapPin,
} from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#FF00CC";

function statusColor(status) {
  switch (status) {
    case "registration":
      return "#FFD700";
    case "active":
      return "#00FF9C";
    case "completed":
      return "#00F5D4";
    case "cancelled":
      return "#FF00CC";
    default:
      return "rgba(180,200,220,0.4)";
  }
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useUser();

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!user,
  });

  const venueId = adminProfile?.user?.venue_id;

  const { data: leagues = [], isLoading } = useQuery({
    queryKey: ["leagues", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const res = await fetch(`/api/leagues?venueId=${venueId}`);
      if (!res.ok) throw new Error("Failed to fetch leagues");
      return res.json();
    },
    enabled: !!venueId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["leagues", venueId]);
    await queryClient.invalidateQueries(["admin-profile"]);
    setRefreshing(false);
  };

  const activeLeagues = leagues.filter((l) => l.status === "active");
  const registrationLeagues = leagues.filter(
    (l) => l.status === "registration"
  );
  const completedLeagues = leagues.filter((l) => l.status === "completed");

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
              backgroundColor: "rgba(255,0,204,0.04)",
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
            color: "rgba(255,0,204,0.5)",
            letterSpacing: 4,
            marginBottom: 8,
          }}
        >
          // VENUE ADMIN PORTAL
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: F.orbitron,
                fontSize: 22,
                color: "#F4F4F9",
                marginBottom: 4,
              }}
            >
              {adminProfile?.user?.venue_name || "LOADING..."}
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 14,
                color: "rgba(255,0,204,0.5)",
              }}
            >
              {adminProfile?.user?.name || user?.email}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/admin/create-league")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(255,0,204,0.1)",
              borderWidth: 1,
              borderColor: "rgba(255,0,204,0.4)",
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Plus size={14} color={C} />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: C,
                letterSpacing: 2,
              }}
            >
              CREATE
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick stats */}
      <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[
            { label: "ACTIVE", value: activeLeagues.length, color: "#00FF9C" },
            {
              label: "OPEN",
              value: registrationLeagues.length,
              color: "#FFD700",
            },
            { label: "DONE", value: completedLeagues.length, color: "#00F5D4" },
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
                  fontFamily: F.orbitron,
                  fontSize: 28,
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
                fontSize: 11,
                color: C,
                letterSpacing: 3,
              }}
            >
              LOADING...
            </Text>
          </View>
        ) : leagues.length === 0 ? (
          <View
            style={{
              backgroundColor: "rgba(11,20,40,0.6)",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(255,0,204,0.2)",
              borderRadius: 12,
              padding: 48,
              alignItems: "center",
            }}
          >
            <Trophy
              size={48}
              color="rgba(255,0,204,0.2)"
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
              NO LEAGUES YET
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 14,
                color: "rgba(180,200,220,0.5)",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              Create your first league to get started
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/admin/create-league")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(255,0,204,0.1)",
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.4)",
                borderRadius: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Plus size={14} color={C} />
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 11,
                  color: C,
                  letterSpacing: 2,
                }}
              >
                CREATE LEAGUE
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(255,0,204,0.5)",
                letterSpacing: 3,
                marginBottom: 4,
              }}
            >
              // ALL LEAGUES ({leagues.length})
            </Text>
            {leagues.map((league) => {
              const sc = statusColor(league.status);
              return (
                <TouchableOpacity
                  key={league.id}
                  onPress={() => router.push(`/admin/league/${league.id}`)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: "rgba(11,20,40,0.9)",
                    borderWidth: 1,
                    borderColor: "rgba(255,0,204,0.15)",
                    borderRadius: 12,
                    padding: 18,
                    borderLeftWidth: 3,
                    borderLeftColor: sc,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text
                        style={{
                          fontFamily: F.orbitronBold,
                          fontSize: 15,
                          color: "#F4F4F9",
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        {league.name}
                      </Text>
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
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 3,
                        borderWidth: 1,
                        borderColor: `${sc}40`,
                        backgroundColor: `${sc}12`,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: sc,
                          letterSpacing: 2,
                        }}
                      >
                        {league.status?.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Calendar size={11} color="rgba(255,0,204,0.4)" />
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: "rgba(180,200,220,0.4)",
                          letterSpacing: 1,
                        }}
                      >
                        {new Date(league.season_start_date).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" }
                        )}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <MapPin size={11} color="rgba(255,0,204,0.4)" />
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: "rgba(180,200,220,0.4)",
                          letterSpacing: 1,
                        }}
                      >
                        {league.fields_count} FIELDS
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Users size={11} color="rgba(255,0,204,0.4)" />
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: "rgba(180,200,220,0.4)",
                          letterSpacing: 1,
                        }}
                      >
                        MAX {league.max_teams}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "rgba(255,0,204,0.08)",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: "rgba(255,0,204,0.4)",
                          letterSpacing: 2,
                          marginBottom: 3,
                        }}
                      >
                        JOIN CODE
                      </Text>
                      <Text
                        style={{
                          fontFamily: F.orbitron,
                          fontSize: 16,
                          color: C,
                          letterSpacing: 3,
                        }}
                      >
                        {league.join_code}
                      </Text>
                    </View>
                    <ChevronRight size={18} color="rgba(255,0,204,0.4)" />
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