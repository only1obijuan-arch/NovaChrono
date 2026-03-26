import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useAdminReferees(venueId) {
  const queryClient = useQueryClient();

  const { data: refsData, isLoading: refsLoading } = useQuery({
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
        body: JSON.stringify({
          venueId,
          fieldNumber: parseInt(fieldNumber),
        }),
      });
      if (!res.ok) throw new Error("Failed to create referee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["referees", venueId]);
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
      queryClient.invalidateQueries(["referees", venueId]);
    },
  });

  return {
    referees: refsData?.referees || [],
    refsLoading,
    createRefMutation,
    deleteRefMutation,
  };
}
