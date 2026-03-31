import { useQuery } from "@tanstack/react-query";

export function useLeagueData(id) {
  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ["league", id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["league-teams", id],
    queryFn: async () => {
      const res = await fetch(`/api/teams?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["league-stats", id],
    queryFn: async () => {
      const res = await fetch(`/api/stats?leagueId=${id}`);
      return res.json();
    },
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["league-matches", id],
    queryFn: async () => {
      const res = await fetch(`/api/matches?leagueId=${id}`);
      return res.json();
    },
  });

  return {
    league,
    leagueLoading,
    teams,
    stats,
    matches,
  };
}
