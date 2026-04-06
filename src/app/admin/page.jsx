"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { printCredentials } from "@/utils/printCredentials";
import { AdminDashboardStyles } from "@/components/AdminDashboard/AdminDashboardStyles";
import { LoadingState } from "@/components/AdminDashboard/LoadingState";
import { Navigation } from "@/components/AdminDashboard/Navigation";
import { DashboardHeader } from "@/components/AdminDashboard/DashboardHeader";
import { LeaguesSection } from "@/components/AdminDashboard/LeaguesSection";
import { RefereesSection } from "@/components/AdminDashboard/RefereesSection";
import { GenerateRefereeModal } from "@/components/AdminDashboard/GenerateRefereeModal";
import { CredentialsModal } from "@/components/AdminDashboard/CredentialsModal";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showRefModal, setShowRefModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [fieldInput, setFieldInput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== "loading" && session) {
      if (
        session.user?.role !== "venue_admin" &&
        session.user?.role !== "super_admin"
      ) {
        router.replace("/");
      }
    }
  }, [session, status, router]);

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!session,
  });

  const venueId = adminProfile?.user?.venue_id;

  const { data: leagues = [], isLoading: leaguesLoading } = useQuery({
    queryKey: ["leagues", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const res = await fetch(`/api/leagues?venueId=${venueId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!venueId,
  });

  const { data: refsData, isLoading: refsLoading } = useQuery({
    queryKey: ["referees", venueId],
    queryFn: async () => {
      if (!venueId) return { referees: [] };
      const res = await fetch(`/api/admin/referees?venueId=${venueId}`);
      return res.json();
    },
    enabled: !!venueId,
  });

  const referees = refsData?.referees || [];

  const createRefMutation = useMutation({
    mutationFn: async ({ venueId: vId, fieldNumber, name }) => {
      const res = await fetch("/api/admin/referees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: vId, fieldNumber: parseInt(fieldNumber), name }),
      });
      if (!res.ok) throw new Error("Failed to create referee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referees", venueId] });
    },
  });

  const deleteRefMutation = useMutation({
    mutationFn: async (refId) => {
      const res = await fetch(`/api/admin/referees?id=${refId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referees", venueId] });
    },
  });

  const handleCreateReferee = async () => {
    try {
      const result = await createRefMutation.mutateAsync({
        venueId,
        fieldNumber: fieldInput,
        name: nameInput.trim(),
      });
      setShowRefModal(false);
      setNameInput("");
      setFieldInput("");
      setShowCredentials(result.referee);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCopyCredentials = () => {
    if (!showCredentials) return;
    const text = `NovaChrono Referee Login\nVenue: ${showCredentials.venueName}\nField: ${showCredentials.fieldNumber}\nEmail: ${showCredentials.email}\nPassword: ${showCredentials.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    printCredentials(showCredentials);
  };

  if (status === "loading" || !session) {
    return <LoadingState />;
  }

  const userRole = session.user?.role;

  return (
    <>
      <AdminDashboardStyles />

      <div className="ad-page">
        <div className="ad-grid" />
        <div className="ad-scanline" />
        <div className="ad-glow-tl" />
        <div className="ad-glow-br" />

        <div className="ad-inner">
          <Navigation userRole={userRole} />

          <DashboardHeader
            venueName={adminProfile?.user?.venue_name}
            userName={adminProfile?.user?.name}
            userEmail={session.user?.email}
          />

          <LeaguesSection leagues={leagues} isLoading={leaguesLoading} />

          <RefereesSection
            referees={referees}
            isLoading={refsLoading}
            onAddReferee={() => setShowRefModal(true)}
            onDeleteReferee={(refId) => deleteRefMutation.mutate(refId)}
            onShowCredentials={async (fieldNumber) => {
              try {
                const result = await createRefMutation.mutateAsync({
                  venueId,
                  fieldNumber,
                });
                setShowCredentials(result.referee);
              } catch (err) {
                alert(err.message);
              }
            }}
          />
        </div>
      </div>

      {showRefModal && (
        <GenerateRefereeModal
          nameInput={nameInput}
          setNameInput={setNameInput}
          fieldInput={fieldInput}
          setFieldInput={setFieldInput}
          onClose={() => {
            setShowRefModal(false);
            setNameInput("");
            setFieldInput("");
          }}
          onSubmit={handleCreateReferee}
          isSubmitting={createRefMutation.isPending}
        />
      )}

      {showCredentials && (
        <CredentialsModal
          credentials={showCredentials}
          onClose={() => setShowCredentials(null)}
          onCopy={handleCopyCredentials}
          onPrint={handlePrint}
          copied={copied}
        />
      )}
    </>
  );
}
