import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "@/utils/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(userId) {
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    if (!userId) return;

    registerForPushNotifications();

    notificationListener.current =
      Notifications.addNotificationReceivedListener((_notification) => {
        // Foreground display is handled by setNotificationHandler above.
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((_response) => {
        // Future: navigate to the relevant screen based on response.notification.request.content.data
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [userId]);
}

async function registerForPushNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "NovaChrono",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4FC3F7",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;

    await apiFetch("/api/push-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.warn("Push token registration failed:", err);
  }
}
