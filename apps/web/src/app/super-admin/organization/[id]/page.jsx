"use client";
import { useState } from "react";
import useUser from "@/utils/useUser";
import { ChevronLeft } from "lucide-react";
import { useOrganizationData } from "@/hooks/useOrganizationData";
import { useVenuesData } from "@/hooks/useVenuesData";
import { useUsersData } from "@/hooks/useUsersData";
import { useOrganizationMutations } from "@/hooks/useOrganizationMutations";
import { OrganizationStyles } from "@/components/OrganizationManagement/OrganizationStyles";
import { OrganizationHeader } from "@/components/OrganizationManagement/OrganizationHeader";
import { OrganizationStats } from "@/components/OrganizationManagement/OrganizationStats";
import { VenuesSection } from "@/components/OrganizationManagement/VenuesSection";
import { AdminsSection } from "@/components/OrganizationManagement/AdminsSection";
import { AddVenueModal } from "@/components/OrganizationManagement/AddVenueModal";
import { AddAdminModal } from "@/components/OrganizationManagement/AddAdminModal";
import { AdminCredentialsModal } from "@/components/OrganizationManagement/AdminCredentialsModal";

export default function OrganizationManagementPage({ params }) {
  const { data: user, refetch: refetchUser } = useUser();
  const orgId = params.id;

  const [showAddVenue, setShowAddVenue] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showAdminCredentials, setShowAdminCredentials] = useState(null);

  const { organization } = useOrganizationData(orgId);
  const { venuesData, venuesLoading } = useVenuesData(orgId);
  const { usersData } = useUsersData(orgId);

  const {
    createVenueMutation,
    createAdminMutation,
    deleteVenueMutation,
    deleteUserMutation,
    assignVenueMutation,
  } = useOrganizationMutations(orgId, refetchUser);

  const handleCreateVenue = (data) => {
    createVenueMutation.mutate(
      {
        organizationId: orgId,
        ...data,
      },
      {
        onSuccess: () => {
          setShowAddVenue(false);
        },
      },
    );
  };

  const handleCreateAdmin = (data) => {
    const password = data.password;
    createAdminMutation.mutate(
      {
        ...data,
        organizationId: orgId,
        role: "venue_admin",
      },
      {
        onSuccess: (responseData) => {
          setShowAddAdmin(false);
          setShowAdminCredentials({
            name: responseData.user.name,
            email: responseData.user.email,
            password: password,
            venueName:
              venuesData?.venues?.find((v) => v.id === data.venueId)?.name ||
              "—",
          });
        },
        onError: (error) => alert(error.message),
      },
    );
  };

  const handleDeleteVenue = (venueId, venueName) => {
    if (
      confirm(`Delete "${venueName}"? This will remove all leagues and data.`)
    ) {
      deleteVenueMutation.mutate(venueId);
    }
  };

  const handleDeleteUser = (userId, userName) => {
    if (confirm(`Delete admin "${userName}"?`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  return (
    <>
      <OrganizationStyles />

      <div className="om-page">
        <div className="om-grid" />
        <div className="om-scanline" />
        <div className="om-glow" />

        <div className="om-inner">
          <a href="/super-admin" className="om-back">
            <ChevronLeft size={14} /> SUPER ADMIN
          </a>

          <OrganizationHeader organizationName={organization?.name} />

          <OrganizationStats
            venuesCount={venuesData?.venues?.length}
            adminsCount={usersData?.users?.length}
          />

          <VenuesSection
            venuesData={venuesData}
            venuesLoading={venuesLoading}
            onAddVenue={() => setShowAddVenue(true)}
            onAssignVenue={(venueId) => assignVenueMutation.mutate(venueId)}
            onDeleteVenue={handleDeleteVenue}
            currentUserVenueId={user?.venue_id}
            assignVenuePending={assignVenueMutation.isPending}
          />

          <AdminsSection
            usersData={usersData}
            hasVenues={venuesData?.venues?.length > 0}
            onAddAdmin={() => setShowAddAdmin(true)}
            onDeleteUser={handleDeleteUser}
          />
        </div>
      </div>

      {showAddVenue && (
        <AddVenueModal
          onClose={() => setShowAddVenue(false)}
          onSubmit={handleCreateVenue}
          isPending={createVenueMutation.isPending}
        />
      )}

      {showAddAdmin && (
        <AddAdminModal
          onClose={() => setShowAddAdmin(false)}
          onSubmit={handleCreateAdmin}
          isPending={createAdminMutation.isPending}
          venues={venuesData?.venues}
        />
      )}

      {showAdminCredentials && (
        <AdminCredentialsModal
          credentials={showAdminCredentials}
          onClose={() => setShowAdminCredentials(null)}
        />
      )}
    </>
  );
}
