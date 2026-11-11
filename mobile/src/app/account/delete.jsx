import { useState } from "react";
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { requestAccountDeletion } from "@/utils/api";
import { useAuth } from "@/utils/auth/useAuth";

const F = {
  orbitron: "Orbitron_900Black",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
};

export default function DeleteAccount() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (confirmation !== "DELETE") {
      Alert.alert("Confirmation required", "Type DELETE exactly to continue.");
      return;
    }
    setBusy(true);
    try {
      await requestAccountDeletion(password);
      await signOut();
      Alert.alert(
        "Request confirmed",
        "Access has been revoked while any remaining responsibilities are resolved.",
        [{ text: "OK", onPress: () => router.replace("/auth/login") }],
      );
    } catch (error) {
      Alert.alert("Request failed", error.message || "Please try again.");
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#091833", paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 28 }}>
          <Text style={{ fontFamily: F.mono, color: "rgba(0,245,212,.7)", letterSpacing: 2 }}>BACK</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,100,100,.7)", letterSpacing: 4 }}>ACCOUNT LIFECYCLE</Text>
        <Text style={{ fontFamily: F.orbitron, fontSize: 25, color: "#F4F4F9", marginTop: 10, marginBottom: 18 }}>DELETE ACCOUNT</Text>
        <Text style={{ fontFamily: F.rajdhani, fontSize: 16, lineHeight: 24, color: "rgba(200,215,230,.7)" }}>
          Confirmation immediately blocks web and mobile access. Historical matches, teams, results and referee attribution may remain under a generic label. Player records are handled separately.
        </Text>
        <View style={{ marginVertical: 22, padding: 16, borderWidth: 1, borderColor: "rgba(255,180,0,.28)", backgroundColor: "rgba(255,180,0,.06)", borderRadius: 8 }}>
          <Text style={{ fontFamily: F.rajdhani, fontSize: 15, lineHeight: 22, color: "rgba(255,220,160,.85)" }}>
            Team ownership, future fixtures or administrator responsibilities must be resolved before de-identification completes.
          </Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(220,230,240,.6)", letterSpacing: 2, marginBottom: 8 }}>CURRENT PASSWORD</Text>
        <TextInput
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          style={{ height: 50, borderWidth: 1, borderColor: "rgba(255,255,255,.15)", borderRadius: 7, paddingHorizontal: 14, color: "#fff", marginBottom: 20 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(220,230,240,.6)", letterSpacing: 2, marginBottom: 8 }}>TYPE DELETE TO CONFIRM</Text>
        <TextInput
          autoCapitalize="characters"
          value={confirmation}
          onChangeText={setConfirmation}
          style={{ height: 50, borderWidth: 1, borderColor: "rgba(255,255,255,.15)", borderRadius: 7, paddingHorizontal: 14, color: "#fff" }}
        />
        <TouchableOpacity
          disabled={busy || !password || confirmation !== "DELETE"}
          onPress={submit}
          style={{ marginTop: 24, padding: 17, borderWidth: 1, borderColor: "rgba(255,80,80,.55)", backgroundColor: "rgba(255,50,50,.1)", borderRadius: 8, opacity: busy || !password || confirmation !== "DELETE" ? .4 : 1 }}
        >
          <Text style={{ textAlign: "center", fontFamily: F.mono, color: "#ff7777", letterSpacing: 2 }}>
            {busy ? "SUBMITTING..." : "REQUEST ACCOUNT DELETION"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
