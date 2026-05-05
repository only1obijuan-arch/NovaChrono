import { Tabs } from "expo-router";
import { Home, Calendar, Trophy, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaptainTeamProvider } from "@/utils/CaptainTeamContext";

export default function CaptainTabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <CaptainTeamProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
  backgroundColor: "#0A1220",
  borderTopWidth: 1,
  borderTopColor: "rgba(0,255,156,0.15)",
  paddingTop: 8,
  paddingBottom: insets.bottom + 12,
  height: 70 + insets.bottom,
},
        tabBarActiveTintColor: "#00FF9C",
        tabBarInactiveTintColor: "rgba(0,255,156,0.3)",
        tabBarLabelStyle: {
          fontSize: 10,
          letterSpacing: 1,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "TEAM",
          tabBarIcon: ({ color }) => <Home color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "FIXTURES",
          tabBarIcon: ({ color }) => <Calendar color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="standings"
        options={{
          title: "TABLE",
          tabBarIcon: ({ color }) => <Trophy color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "MORE",
          tabBarIcon: ({ color }) => <User color={color} size={20} />,
        }}
      />
    </Tabs>
    </CaptainTeamProvider>
  );
}