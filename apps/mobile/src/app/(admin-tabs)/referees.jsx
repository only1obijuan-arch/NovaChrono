import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/utils/auth/useUser";
import {
  Shield,
  Plus,
  X,
  Copy,
  Printer,
  Trash2,
  RefreshCw,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";

const F = {
  orbitron: "Orbitron_900Black",
  orbitronBold: "Orbitron_700Bold",
  mono: "ShareTechMono_400Regular",
  rajdhani: "Rajdhani_400Regular",
  rajdhaniBold: "Rajdhani_700Bold",
};
const C = "#FF00CC";
const CYAN = "#00F5D4";

export default function AdminReferees() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState(null);
  const [fieldInput, setFieldInput] = useState("");
  const [copied, setCopied] = useState(false);
  const { user } = useUser();

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile");
      return res.json();
    },
    enabled: !!user,
  });

  const venueId = adminProfile?.user?.venue_id;

  const { data: refsData, isLoading } = useQuery({
    queryKey: ["referees", venueId],
    queryFn: async () => {
      if (!venueId) return { referees: [] };
      const res = await fetch(`/api/admin/referees?venueId=${venueId}`);
      return res.json();
    },
    enabled: !!venueId,
  });

  const createRefMutation = useMutation({
    mutationFn: async ({ venueId, fieldNumber }) => {
      const res = await fetch("/api/admin/referees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, fieldNumber: parseInt(fieldNumber) }),
      });
      if (!res.ok) throw new Error("Failed to create referee");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["referees", venueId]);
      setShowGenModal(false);
      setFieldInput("");
      setShowCredentials(data.referee);
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const deleteRefMutation = useMutation({
    mutationFn: async (refId) => {
      const res = await fetch(`/api/admin/referees?id=${refId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["referees", venueId]),
    onError: (err) => Alert.alert("Error", err.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(["referees", venueId]);
    setRefreshing(false);
  };

  const handleCopy = async () => {
    if (!showCredentials) return;
    const text = `NovaChrono Referee Login\nVenue: ${showCredentials.venueName}\nField: ${showCredentials.fieldNumber}\nEmail: ${showCredentials.email}\nPassword: ${showCredentials.password}`;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const referees = refsData?.referees || [];

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
          // REFEREE ACCOUNTS
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontFamily: F.orbitron, fontSize: 26, color: "#F4F4F9" }}
          >
            REFEREES
          </Text>
          <TouchableOpacity
            onPress={() => {
              setFieldInput("");
              setShowGenModal(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(0,245,212,0.08)",
              borderWidth: 1,
              borderColor: "rgba(0,245,212,0.3)",
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Shield size={12} color={CYAN} />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: CYAN,
                letterSpacing: 2,
              }}
            >
              GENERATE
            </Text>
          </TouchableOpacity>
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
            tintColor={CYAN}
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
                borderColor: CYAN,
                borderTopColor: "transparent",
                borderRadius: 20,
                marginBottom: 16,
              }}
            />
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 11,
                color: CYAN,
                letterSpacing: 3,
              }}
            >
              LOADING...
            </Text>
          </View>
        ) : referees.length === 0 ? (
          <View
            style={{
              backgroundColor: "rgba(11,20,40,0.6)",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(0,245,212,0.15)",
              borderRadius: 12,
              padding: 48,
              alignItems: "center",
            }}
          >
            <Shield
              size={48}
              color="rgba(0,245,212,0.2)"
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
              NO REFEREE ACCOUNTS
            </Text>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 13,
                color: "rgba(180,200,220,0.4)",
                textAlign: "center",
              }}
            >
              Generate referee credentials for each field
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(0,245,212,0.4)",
                letterSpacing: 3,
                marginBottom: 4,
              }}
            >
              // {referees.length} REF{referees.length !== 1 ? "S" : ""}{" "}
              REGISTERED
            </Text>
            {referees.map((ref, i) => (
              <View
                key={ref.id}
                style={{
                  backgroundColor: "rgba(11,20,40,0.9)",
                  borderWidth: 1,
                  borderColor: "rgba(0,245,212,0.15)",
                  borderRadius: 12,
                  padding: 18,
                  borderLeftWidth: 3,
                  borderLeftColor: CYAN,
                }}
              >
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
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: "rgba(0,245,212,0.4)",
                        letterSpacing: 3,
                        marginBottom: 6,
                      }}
                    >
                      FIELD
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.orbitron,
                        fontSize: 28,
                        color: CYAN,
                        marginBottom: 8,
                      }}
                    >
                      {ref.field_number}
                    </Text>
                    <Text
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: "rgba(180,200,220,0.3)",
                        letterSpacing: 1,
                      }}
                      numberOfLines={1}
                    >
                      {ref.email}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        "Remove Referee",
                        `Remove referee for Field ${ref.field_number}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => deleteRefMutation.mutate(ref.id),
                          },
                        ],
                      )
                    }
                    style={{
                      padding: 8,
                      borderWidth: 1,
                      borderColor: "rgba(255,80,80,0.2)",
                      borderRadius: 6,
                    }}
                  >
                    <Trash2 size={14} color="rgba(255,80,80,0.5)" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    createRefMutation.mutate({
                      venueId,
                      fieldNumber: ref.field_number,
                    })
                  }
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: "rgba(0,245,212,0.08)",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <RefreshCw size={11} color="rgba(0,245,212,0.5)" />
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9,
                      color: "rgba(0,245,212,0.5)",
                      letterSpacing: 2,
                    }}
                  >
                    RESET & VIEW CREDENTIALS
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Generate Modal */}
      <Modal
        visible={showGenModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGenModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#0D1B2E",
              borderTopWidth: 1,
              borderTopColor: "rgba(0,245,212,0.3)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitronBold,
                  fontSize: 16,
                  color: "#F4F4F9",
                  letterSpacing: 2,
                }}
              >
                // GENERATE REF LOGIN
              </Text>
              <TouchableOpacity onPress={() => setShowGenModal(false)}>
                <X size={20} color="rgba(0,245,212,0.4)" />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontFamily: F.rajdhani,
                fontSize: 14,
                color: "rgba(180,200,220,0.4)",
                marginBottom: 20,
              }}
            >
              Create credentials for a field referee
            </Text>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: "rgba(0,245,212,0.5)",
                letterSpacing: 3,
                marginBottom: 8,
              }}
            >
              FIELD NUMBER
            </Text>
            <TextInput
              value={fieldInput}
              onChangeText={setFieldInput}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor="rgba(180,200,220,0.3)"
              style={{
                height: 56,
                backgroundColor: "rgba(0,245,212,0.05)",
                borderWidth: 1,
                borderColor: "rgba(0,245,212,0.3)",
                borderRadius: 8,
                paddingHorizontal: 16,
                color: "#F4F4F9",
                fontFamily: F.orbitron,
                fontSize: 24,
                letterSpacing: 4,
                marginBottom: 20,
                textAlign: "center",
              }}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowGenModal(false)}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: "rgba(180,200,220,0.5)",
                    letterSpacing: 2,
                  }}
                >
                  CANCEL
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  createRefMutation.mutate({ venueId, fieldNumber: fieldInput })
                }
                disabled={!fieldInput || createRefMutation.isPending}
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: "rgba(0,245,212,0.1)",
                  borderWidth: 1,
                  borderColor: CYAN,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: !fieldInput ? 0.4 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: CYAN,
                    letterSpacing: 2,
                  }}
                >
                  {createRefMutation.isPending ? "GENERATING..." : "GENERATE →"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Credentials Modal */}
      <Modal
        visible={!!showCredentials}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCredentials(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#0D1B2E",
              borderTopWidth: 1,
              borderTopColor: "rgba(0,245,212,0.4)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: F.orbitronBold,
                  fontSize: 16,
                  color: "#F4F4F9",
                  letterSpacing: 2,
                }}
              >
                // CREDENTIALS
              </Text>
              <TouchableOpacity onPress={() => setShowCredentials(null)}>
                <X size={20} color="rgba(0,245,212,0.4)" />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: "rgba(255,200,0,0.6)",
                letterSpacing: 2,
                marginBottom: 20,
              }}
            >
              ⚠ SAVE THESE — THEY CANNOT BE RECOVERED LATER
            </Text>

            <View
              style={{
                backgroundColor: "rgba(0,245,212,0.04)",
                borderWidth: 1,
                borderColor: "rgba(0,245,212,0.2)",
                borderRadius: 10,
                padding: 20,
                marginBottom: 20,
                gap: 14,
              }}
            >
              {[
                ["VENUE", showCredentials?.venueName],
                ["FIELD", showCredentials?.fieldNumber],
                ["EMAIL", showCredentials?.email],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9,
                      color: "rgba(0,245,212,0.5)",
                      letterSpacing: 3,
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: F.rajdhaniBold,
                      fontSize: 14,
                      color: "#F4F4F9",
                    }}
                  >
                    {value}
                  </Text>
                </View>
              ))}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: "rgba(0,245,212,0.1)",
                  paddingTop: 14,
                }}
              >
                <Text
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: "rgba(0,245,212,0.5)",
                    letterSpacing: 3,
                    marginBottom: 8,
                  }}
                >
                  ACCESS CODE
                </Text>
                <Text
                  style={{
                    fontFamily: F.orbitron,
                    fontSize: 22,
                    color: CYAN,
                    letterSpacing: 3,
                  }}
                >
                  {showCredentials?.password}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleCopy}
              style={{
                height: 48,
                backgroundColor: copied
                  ? "rgba(0,255,156,0.1)"
                  : "rgba(0,245,212,0.08)",
                borderWidth: 1,
                borderColor: copied ? "#00FF9C" : "rgba(0,245,212,0.3)",
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Copy size={16} color={copied ? "#00FF9C" : CYAN} />
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 11,
                  color: copied ? "#00FF9C" : CYAN,
                  letterSpacing: 2,
                }}
              >
                {copied ? "COPIED!" : "COPY CREDENTIALS"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCredentials(null)}
              style={{
                height: 48,
                backgroundColor: "rgba(0,255,156,0.15)",
                borderWidth: 1,
                borderColor: "#00FF9C",
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: F.mono,
                  fontSize: 11,
                  color: "#00FF9C",
                  letterSpacing: 2,
                }}
              >
                DONE ✓
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
