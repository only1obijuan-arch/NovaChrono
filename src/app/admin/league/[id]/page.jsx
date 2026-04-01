"use client";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LeagueDetailStyles } from "@/components/LeagueDetail/LeagueDetailStyles";
import { LoadingState } from "@/components/LeagueDetail/LoadingState";
import { ChampionBanner } from "@/components/LeagueDetail/ChampionBanner";
import { LeagueHeader } from "@/components/LeagueDetail/LeagueHeader";
import { OverviewTab } from "@/components/LeagueDetail/OverviewTab";
import { TeamsTab } from "@/components/LeagueDetail/TeamsTab";
import { FixturesTab } from "@/components/LeagueDetail/FixturesTab";
import { StandingsTab } from "@/components/LeagueDetail/StandingsTab";
import { AddTeamModal } from "@/components/LeagueDetail/AddTeamModal";
import { ManageTeamModal } from "@/components/LeagueDetail/ManageTeamModal";
import { NewSeasonModal } from "@/components/LeagueDetail/NewSeasonModal";

export default function LeagueDetail({ params }) {
  const { id } = React.use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: "" });
  const [newSeasonName, setNewSeasonName] = useState("");

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

  // League mutations
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
      queryClient.invalidateQueries({ queryKey: ["league", id] });
      queryClient.invalidateQueries({ queryKey: ["league-matches", id] });
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
      queryClient.invalidateQueries({ queryKey: ["league", id] });
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
      queryClient.invalidateQueries({ queryKey: ["league", id] });
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
      router.push(`/admin/league/${newLeague.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // Team mutations
  const addTeamMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADD_TEAM", leagueId: id, ...data }),
      });
      if (!res.ok) throw new Error("Failed to add team");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Team added!");
      queryClient.invalidateQueries({ queryKey: ["league-teams", id] });
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
      queryClient.invalidateQueries({ queryKey: ["league-teams", id] });
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
      queryClient.invalidateQueries({ queryKey: ["league-teams", id] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAddTeam = () => {
    addTeamMutation.mutate(
      { teamName: teamForm.name },
      {
        onSuccess: () => {
          setShowAddTeam(false);
          setTeamForm({ name: "" });
        },
      },
    );
  };

  const handleUpdateTeam = () => {
    updateTeamMutation.mutate(
      { teamId: selectedTeam.id, teamName: teamForm.name },
      { onSuccess: () => setShowManageTeam(false) },
    );
  };

  const handleDeleteTeam = () => {
    deleteTeamMutation.mutate(selectedTeam.id, {
      onSuccess: () => setShowManageTeam(false),
    });
  };

  const handleManageTeam = (team) => {
    setSelectedTeam(team);
    setTeamForm({ name: team.name });
    setShowManageTeam(true);
  };

  const handleCreateNewSeason = () => {
    createNewSeasonMutation.mutate(newSeasonName, {
      onSuccess: () => setShowNewSeasonModal(false),
    });
  };

  if (leagueLoading || !league) return <LoadingState />;

  const champion = stats?.standings?.[0];

  return (
    <>
      <LeagueDetailStyles />

      <div className="ld-page">
        <div className="ld-grid" />
        <div className="ld-scanline" />

        {league?.status === "completed" && champion && (
          <ChampionBanner champion={champion} />
        )}

        <LeagueHeader
          league={league}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onGenerateFixtures={() => generateFixturesMutation.mutate()}
          onCompleteSeason={() => completeSeasonMutation.mutate()}
          onNewSeason={() => setShowNewSeasonModal(true)}
          onCancelLeague={() => cancelLeagueMutation.mutate()}
          generateFixturesPending={generateFixturesMutation.isPending}
          teamsCount={teams.length}
        />

        <div className="ld-inner">
          {activeTab === "overview" && (
            <OverviewTab league={league} teams={teams} matches={matches} />
          )}

          {activeTab === "teams" && (
            <TeamsTab
              teams={teams}
              onManageTeam={handleManageTeam}
              onAddTeam={() => setShowAddTeam(true)}
            />
          )}

          {activeTab === "fixtures" && <FixturesTab matches={matches} />}

          {activeTab === "standings" && <StandingsTab stats={stats} />}
        </div>
      </div>

      <AddTeamModal
        show={showAddTeam}
        onClose={() => setShowAddTeam(false)}
        onSubmit={handleAddTeam}
        teamForm={teamForm}
        setTeamForm={setTeamForm}
        isPending={addTeamMutation.isPending}
      />

      <ManageTeamModal
        show={showManageTeam}
        onClose={() => setShowManageTeam(false)}
        onUpdate={handleUpdateTeam}
        onDelete={handleDeleteTeam}
        selectedTeam={selectedTeam}
        teamForm={teamForm}
        setTeamForm={setTeamForm}
        updatePending={updateTeamMutation.isPending}
        deletePending={deleteTeamMutation.isPending}
      />

      <NewSeasonModal
        show={showNewSeasonModal}
        onClose={() => setShowNewSeasonModal(false)}
        onCreate={handleCreateNewSeason}
        seasonName={newSeasonName}
        setSeasonName={setNewSeasonName}
        isPending={createNewSeasonMutation.isPending}
      />
    </>
  );
}
