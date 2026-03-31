import { useQuery } from "@tanstack/react-query";

export function useVenuesData(orgId) {
  const { data: venuesData, isLoading: venuesLoading } = useQuery({
    queryKey: ["super-admin-venues", orgId],
    queryFn: async () => {
      const res = await fetch(
        `/api/super-admin/venues?organizationId=${orgId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch venues");
      return res.json();
    },
    enabled: !!orgId,
  });

  return { venuesData, venuesLoading };
}
