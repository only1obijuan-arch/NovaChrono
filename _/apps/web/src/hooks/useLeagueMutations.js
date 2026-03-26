import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useLeagueMutations(id) {
  const queryClient = useQueryClient();

  const generateFixturesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "GENERATE_FIXTURES", leagueId: id }),
      });
      if (!res.ok) throw new Error("Failed to generate fixtures");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Fixtures generated!");
      queryClient.invalidateQueries(["league", id]);
      queryClient.invalidateQueries(["league-matches", id]);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelLeagueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "CANCEL_LEAGUE", leagueId: id }),
      });
      if (!res.ok) throw new Error("Failed to cancel league");
      return res.json();
    },
    onSuccess: () => {
      toast.success("League cancelled");
      queryClient.invalidateQueries(["league", id]);
    },
    onError: (err) => toast.error(err.message),
  });

  const completeSeasonMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "COMPLETE_SEASON", leagueId: id }),
      });
      if (!res.ok) throw new Error("Failed to complete season");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Season completed!");
      queryClient.invalidateQueries(["league", id]);
    },
    onError: (err) => toast.error(err.message),
  });

  const createNewSeasonMutation = useMutation({
    mutationFn: async (seasonName) => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_NEW_SEASON",
          parentLeagueId: id,
          seasonName,
        }),
      });
      if (!res.ok) throw new Error("Failed to create new season");
      return res.json();
    },
    onSuccess: (newLeague) => {
      toast.success("New season created!");
      window.location.href = `/admin/league/${newLeague.id}`;
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    generateFixturesMutation,
    cancelLeagueMutation,
    completeSeasonMutation,
    createNewSeasonMutation,
  };
}
