"use client";
import { useState } from "react";
import { useLeagueData } from "@/hooks/useLeagueData";
import { useLeagueMutations } from "@/hooks/useLeagueMutations";
import { useTeamMutations } from "@/hooks/useTeamMutations";
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
  const { id } = params;
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: "" });
  const [newSeasonName, setNewSeasonName] = useState("");

  const { league, leagueLoading, teams, stats, matches } = useLeagueData(id);

  const {
    generateFixturesMutation,
    cancelLeagueMutation,
    completeSeasonMutation,
    createNewSeasonMutation,
  } = useLeagueMutations(id);

  const { addTeamMutation, updateTeamMutation, deleteTeamMutation } =
    useTeamMutations(id);

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
      {
        teamId: selectedTeam.id,
        teamName: teamForm.name,
      },
      {
        onSuccess: () => {
          setShowManageTeam(false);
        },
      },
    );
  };

  const handleDeleteTeam = () => {
    deleteTeamMutation.mutate(selectedTeam.id, {
      onSuccess: () => {
        setShowManageTeam(false);
      },
    });
  };

  const handleManageTeam = (team) => {
    setSelectedTeam(team);
    setTeamForm({ name: team.name });
    setShowManageTeam(true);
  };

  const handleCreateNewSeason = () => {
    createNewSeasonMutation.mutate(newSeasonName, {
      onSuccess: () => {
        setShowNewSeasonModal(false);
      },
    });
  };

  if (leagueLoading) return <LoadingState />;

  const champion = stats?.standings?.[0];

  return (
    <>
      <LeagueDetailStyles />

      <div className="ld-page">
        <div className="ld-grid" />
        <div className="ld-scanline" />

        {league.status === "completed" && champion && (
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
