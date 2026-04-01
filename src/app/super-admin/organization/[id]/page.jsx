"use client";
import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { OrganizationStyles } from "@/components/OrganizationManagement/OrganizationStyles";
import { OrganizationHeader } from "@/components/OrganizationManagement/OrganizationHeader";
import { OrganizationStats } from "@/components/OrganizationManagement/OrganizationStats";
import { VenuesSection } from "@/components/OrganizationManagement/VenuesSection";
import { AdminsSection } from "@/components/OrganizationManagement/AdminsSection";
import { AddVenueModal } from "@/components/OrganizationManagement/AddVenueModal";
import { AddAdminModal } from "@/components/OrganizationManagement/AddAdminModal";
import { AdminCredentialsModal } from "@/components/OrganizationManagement/AdminCredentialsModal";

export default function OrganizationManagementPage({ params }) {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id: orgId } = React.use(params);

  const [showAddVenue, setShowAddVenue] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showAdminCredentials, setShowAdminCredentials] = useState(null);

  const { data: orgsData } = useQuery({
    queryKey: ["super-admin-organizations"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/organizations");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const organization = orgsData?.organizations?.find((org) => org.id === orgId);

  const { data: venuesData, isLoading: venuesLoading } = useQuery({
    queryKey: ["super-admin-venues", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/venues?organizationId=${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch venues");
      return res.json();
    },
    enabled: !!orgId,
  });

  const { data: usersData } = useQuery({
    queryKey: ["super-admin-users", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/users?organizationId=${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!orgId,
  });

  const createVenueMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/super-admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create venue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-venues", orgId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-organizations"] });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/super-admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create admin");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users", orgId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-organizations"] });
    },
  });

  const deleteVenueMutation = useMutation({
    mutationFn: async (venueId) => {
      const res = await fetch(`/api/super-admin/venues?id=${venueId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete venue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-venues", orgId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-organizations"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      const res = await fetch(`/api/super-admin/users?id=${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users", orgId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-organizations"] });
    },
  });

  const assignVenueMutation = useMutation({
    mutationFn: async (venueId) => {
      const res = await fetch("/api/super-admin/assign-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error("Failed to assign venue");
      return res.json();
    },
    onSuccess: () => {
      router.refresh();
      alert("You are now assigned to this venue!");
    },
  });

  const handleCreateVenue = (data) => {
    createVenueMutation.mutate(
      { organizationId: orgId, ...data },
      { onSuccess: () => setShowAddVenue(false) },
    );
  };

  const handleCreateAdmin = (data) => {
    const password = data.password;
    createAdminMutation.mutate(
      { ...data, organizationId: orgId, role: "venue_admin" },
      {
        onSuccess: (responseData) => {
          setShowAddAdmin(false);
          setShowAdminCredentials({
            name: responseData.user.name,
            email: responseData.user.email,
            password: password,
            venueName:
              venuesData?.venues?.find((v) => v.id === data.venueId)?.name || "—",
          });
        },
        onError: (error) => alert(error.message),
      },
    );
  };

  const handleDeleteVenue = (venueId, venueName) => {
    if (confirm(`Delete "${venueName}"? This will remove all leagues and data.`)) {
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
            currentUserVenueId={session?.user?.venue_id}
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
