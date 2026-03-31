"use client";
import { useEffect, useState } from "react";
import useUser from "@/utils/useUser";
import { useAdminProfile } from "@/hooks/useAdminProfile";
import { useAdminLeagues } from "@/hooks/useAdminLeagues";
import { useAdminReferees } from "@/hooks/useAdminReferees";
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
  const { data: user, loading: userLoading } = useUser();
  const [showRefModal, setShowRefModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState(null);
  const [fieldInput, setFieldInput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userLoading && user) {
      if (user?.role !== "venue_admin" && user?.role !== "super_admin") {
        window.location.href = "/";
      }
    }
  }, [user, userLoading]);

  const { data: adminProfile } = useAdminProfile(user);
  const venueId = adminProfile?.user?.venue_id;

  const { data: leagues = [], isLoading: leaguesLoading } =
    useAdminLeagues(venueId);
  const { referees, refsLoading, createRefMutation, deleteRefMutation } =
    useAdminReferees(venueId);

  const handleCreateReferee = async () => {
    try {
      const result = await createRefMutation.mutateAsync({
        venueId,
        fieldNumber: fieldInput,
      });
      setShowRefModal(false);
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

  if (userLoading || !user) {
    return <LoadingState />;
  }

  const userRole = user?.role;

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
            userEmail={user.email}
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
          fieldInput={fieldInput}
          setFieldInput={setFieldInput}
          onClose={() => {
            setShowRefModal(false);
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
