// Admin tabs layout
import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  Trophy,
  Shield,
  Bell,
  MoreHorizontal,
} from "lucide-react-native";

export default function AdminTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0A1220",
          borderTopWidth: 1,
          borderTopColor: "rgba(255,0,204,0.2)",
          paddingTop: 8,
          paddingBottom: 8,
          height: 64,
        },
        tabBarActiveTintColor: "#FF00CC",
        tabBarInactiveTintColor: "rgba(255,0,204,0.3)",
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
          title: "LEAGUES",
          tabBarIcon: ({ color }) => <Trophy color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="referees"
        options={{
          title: "REFEREES",
          tabBarIcon: ({ color }) => <Shield color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "ALERTS",
          tabBarIcon: ({ color }) => <Bell color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "MORE",
          tabBarIcon: ({ color }) => <MoreHorizontal color={color} size={20} />,
        }}
      />
    </Tabs>
  );
}
