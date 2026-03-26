import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useTeamMutations(leagueId) {
  const queryClient = useQueryClient();

  const addTeamMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADD_TEAM", leagueId, ...data }),
      });
      if (!res.ok) throw new Error("Failed to add team");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Team added!");
      queryClient.invalidateQueries(["league-teams", leagueId]);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_TEAM", ...data }),
      });
      if (!res.ok) throw new Error("Failed to update team");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Team updated!");
      queryClient.invalidateQueries(["league-teams", leagueId]);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_TEAM", teamId }),
      });
      if (!res.ok) throw new Error("Failed to delete team");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Team removed!");
      queryClient.invalidateQueries(["league-teams", leagueId]);
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    addTeamMutation,
    updateTeamMutation,
    deleteTeamMutation,
  };
}
