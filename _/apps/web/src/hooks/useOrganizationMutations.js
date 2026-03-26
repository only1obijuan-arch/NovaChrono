import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useOrganizationMutations(orgId, refetchUser) {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries(["super-admin-venues", orgId]);
      queryClient.invalidateQueries(["super-admin-organizations"]);
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
      queryClient.invalidateQueries(["super-admin-users", orgId]);
      queryClient.invalidateQueries(["super-admin-organizations"]);
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
      queryClient.invalidateQueries(["super-admin-venues", orgId]);
      queryClient.invalidateQueries(["super-admin-organizations"]);
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
      queryClient.invalidateQueries(["super-admin-users", orgId]);
      queryClient.invalidateQueries(["super-admin-organizations"]);
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
      refetchUser();
      alert("You are now assigned to this venue!");
    },
  });

  return {
    createVenueMutation,
    createAdminMutation,
    deleteVenueMutation,
    deleteUserMutation,
    assignVenueMutation,
  };
}
