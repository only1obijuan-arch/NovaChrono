import { Tabs } from "expo-router";
import { Home, Calendar, Trophy, User } from "lucide-react-native";

export default function CaptainTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0A1220",
          borderTopWidth: 1,
          borderTopColor: "rgba(0,255,156,0.15)",
          paddingTop: 8,
          paddingBottom: 8,
          height: 64,
        },
        tabBarActiveTintColor: "#00FF9C",
        tabBarInactiveTintColor: "rgba(0,255,156,0.3)",
        tabBarLabelStyle: {
          fontFamily: "ShareTechMono_400Regular",
          fontSize: 9,
          letterSpacing: 1.5,
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
  );
}
