import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";

const CaptainTeamContext = createContext(null);

export function CaptainTeamProvider({ children }) {
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["captain-teams"],
    queryFn: async () => {
      const res = await apiFetch("/api/captain/team");
      if (!res.ok) throw new Error("Failed to fetch teams");
      const data = await res.json();
      return data.teams ?? [];
    },
  });

  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const selectedTeam =
    teams.find((t) => t.id === selectedTeamId) ?? teams[0] ?? null;

  return (
    <CaptainTeamContext.Provider
      value={{ teams, selectedTeam, setSelectedTeamId, isLoading }}
    >
      {children}
    </CaptainTeamContext.Provider>
  );
}

export function useCaptainTeam() {
  return useContext(CaptainTeamContext);
}
