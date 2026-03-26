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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react-native";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#FF00CC";

function typeStyle(type) {
  switch (type) {
    case "availability_confirmed":
      return {
        dot: "#00FF9C",
        bg: "rgba(0,255,156,0.04)",
        border: "rgba(0,255,156,0.15)",
      };
    case "availability_declined":
      return {
        dot: "#FF00CC",
        bg: "rgba(255,0,204,0.04)",
        border: "rgba(255,0,204,0.15)",
      };
    case "unconfirmed_alert":
      return {
        dot: "#FFD700",
        bg: "rgba(255,215,0,0.04)",
        border: "rgba(255,215,0,0.2)",
      };
    default:
      return {
        dot: "#00F5D4",
        bg: "rgba(0,245,212,0.03)",
        border: "rgba(0,245,212,0.12)",
      };
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminNotifications() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(["notifications"]),
  });

  const markOneMutation = useMutation({
    mutationFn: async (notificationId) => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(["notifications"]),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["notifications"]);
    setRefreshing(false);
  };

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

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
          // NOTIFICATIONS
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text
              style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
            >
              ALERTS
            </Text>
            {unreadCount > 0 && (
              <View
                style={{
                  backgroundColor: C,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{ fontFamily: F.mono, fontSize: 10, color: "white" }}
                >
                  {unreadCount}
                </Text>
              </View>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={() => markAllMutation.mutate()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: "rgba(255,0,204,0.2)",
                borderRadius: 6,
              }}
            >
              <CheckCheck size={12} color="rgba(255,0,204,0.5)" />
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: "rgba(255,0,204,0.5)",
                  letterSpacing: 2,
                }}
              >
                MARK ALL READ
              </Text>
            </TouchableOpacity>
          )}
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
        ) : notifications.length === 0 ? (
          <View
            style={{
              backgroundColor: "rgba(11,20,40,0.6)",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(255,0,204,0.15)",
              borderRadius: 12,
              padding: 48,
              alignItems: "center",
            }}
          >
            <Bell
              size={48}
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
              ALL CLEAR
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 13,
                color: "rgba(180,200,220,0.4)",
                textAlign: "center",
              }}
            >
              No notifications yet. Availability responses and alerts will
              appear here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {notifications.map((notif) => {
              const ts = typeStyle(notif.type);
              return (
                <TouchableOpacity
                  key={notif.id}
                  onPress={() =>
                    !notif.read && markOneMutation.mutate(notif.id)
                  }
                  activeOpacity={notif.read ? 1 : 0.7}
                  style={{
                    backgroundColor: notif.read ? "rgba(11,20,40,0.6)" : ts.bg,
                    borderWidth: 1,
                    borderColor: notif.read
                      ? "rgba(180,200,220,0.06)"
                      : ts.border,
                    borderRadius: 12,
                    padding: 16,
                    flexDirection: "row",
                    gap: 14,
                    borderLeftWidth: 3,
                    borderLeftColor: notif.read
                      ? "rgba(180,200,220,0.1)"
                      : ts.dot,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: notif.read
                        ? "rgba(180,200,220,0.2)"
                        : ts.dot,
                      marginTop: 4,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: F.rajdhaniBold,
                        fontSize: 15,
                        color: notif.read ? "rgba(180,200,220,0.5)" : "#F4F4F9",
                        marginBottom: 4,
                      }}
                    >
                      {notif.title}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.rajdhani,
                        fontSize: 13,
                        color: "rgba(180,200,220,0.5)",
                        lineHeight: 18,
                        marginBottom: 6,
                      }}
                    >
                      {notif.message}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: "rgba(180,200,220,0.25)",
                        letterSpacing: 1,
                      }}
                    >
                      {timeAgo(notif.created_at)}
                    </Text>
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