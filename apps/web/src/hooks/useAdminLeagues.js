import { useQuery } from "@tanstack/react-query";

export function useAdminLeagues(venueId) {
  return useQuery({
    queryKey: ["leagues", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const res = await fetch(`/api/leagues?venueId=${venueId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!venueId,
  });
}
