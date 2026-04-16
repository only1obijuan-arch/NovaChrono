import { Tabs } from "expo-router";
import { Calendar, History, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function RefereeTabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0A1220",
          borderTopWidth: 1,
          borderTopColor: "rgba(164,45,180,0.2)",
          paddingTop: 8,
          paddingBottom: insets.bottom + 12,
          height: 70 + insets.bottom,
        },
        tabBarActiveTintColor: "#A42DB4",
        tabBarInactiveTintColor: "rgba(164,45,180,0.3)",
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
          title: "TODAY",
          tabBarIcon: ({ color }) => <Calendar color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "HISTORY",
          tabBarIcon: ({ color }) => <History color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color }) => <User color={color} size={20} />,
        }}
      />
    </Tabs>
  );
}
