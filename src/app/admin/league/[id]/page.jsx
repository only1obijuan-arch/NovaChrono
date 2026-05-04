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
  const [newSeasonStartDate, setNewSeasonStartDate] = useState("");

  // Postpone round state
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeRound, setPostponeRound] = useState("");
  const [postponeConfirm, setPostponeConfirm] = useState(false);
  const [postponeResult, setPostponeResult] = useState(null);

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

  const { data: refereesData } = useQuery({
    queryKey: ["referees", league?.venue_id],
    queryFn: async () => {
      if (!league?.venue_id) return { referees: [] };
      const res = await fetch(`/api/admin/referees?venueId=${league.venue_id}`);
      return res.json();
    },
    enabled: !!league?.venue_id,
  });

  const referees = refereesData?.referees || [];
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
    mutationFn: async ({ seasonName, seasonStartDate }) => {
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_NEW_SEASON",
          parentLeagueId: id,
          seasonName,
          seasonStartDate,
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

  const assignRefereeMutation = useMutation({
    mutationFn: async ({ matchId, refereeId }) => {
      const res = await fetch('/api/matches', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'ASSIGN_REFEREE', matchId, refereeId }) });
      if (!res.ok) throw new Error('Failed to assign referee');
      return res.json();
    },
    onSuccess: () => { toast.success('Referee updated'); queryClient.invalidateQueries({ queryKey:["league-matches", id] }); },
    onError: (err) => toast.error(err.message),
  });

  const postponeRoundMutation = useMutation({
    mutationFn: async ({ league_id, round_number }) => {
      const res = await fetch("/api/leagues/postpone-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id, round_number }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to postpone round");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPostponeResult(data);
      setPostponeConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["league-matches", id] });
    },
    onError: (err) => {
      toast.error(err.message);
      setPostponeConfirm(false);
    },
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
    createNewSeasonMutation.mutate({ seasonName: newSeasonName, seasonStartDate: newSeasonStartDate }, {
      onSuccess: () => {
        setShowNewSeasonModal(false);
        setNewSeasonStartDate("");
      },
    });
  };

  const handlePostponeRound = () => {
    postponeRoundMutation.mutate({
      league_id: id,
      round_number: parseInt(postponeRound),
    });
  };

  const closePostponeModal = () => {
    setShowPostponeModal(false);
    setPostponeRound("");
    setPostponeConfirm(false);
    setPostponeResult(null);
  };

  if (leagueLoading || !league) return <LoadingState />;

  const champion = stats?.standings?.[0];
  const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round_number)) : 0;

  return (
    <>
      <LeagueDetailStyles />
      <style>{`
        .pr-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
        .pr-modal { background:#0D1B2E; border:1px solid rgba(255,0,204,0.3); border-radius:8px; padding:32px; max-width:440px; width:100%; box-shadow:0 0 60px rgba(255,0,204,0.08); }
        .pr-modal-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; margin-bottom:8px; }
        .pr-modal-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:3px; margin-bottom:24px; }
        .pr-modal-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .pr-modal-select { width:100%; height:48px; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.2); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Orbitron',monospace; font-size:16px; outline:none; margin-bottom:24px; }
        .pr-modal-select option { background:#0D1B2E; }
        .pr-confirm { background:rgba(255,0,204,0.06); border:1px solid rgba(255,0,204,0.25); border-radius:6px; padding:16px; margin-bottom:20px; }
        .pr-confirm-text { font-family:'Share Tech Mono',monospace; font-size:12px; color:rgba(180,200,220,0.7); line-height:1.6; }
        .pr-confirm-text strong { color:#FF00CC; }
        .pr-modal-btns { display:flex; gap:12px; }
        .pr-modal-cancel { flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.5); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .pr-modal-cancel:hover { color:#F4F4F9; }
        .pr-modal-submit { flex:1; background:rgba(255,0,204,0.1); border:1px solid rgba(255,0,204,0.4); color:#FF00CC; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .pr-modal-submit:hover { box-shadow:0 0 20px rgba(255,0,204,0.2); }
        .pr-modal-submit:disabled { opacity:0.3; cursor:not-allowed; }
        .pr-success { background:rgba(0,245,212,0.06); border:1px solid rgba(0,245,212,0.3); border-radius:6px; padding:16px; margin-bottom:20px; font-family:'Share Tech Mono',monospace; font-size:11px; color:#00F5D4; letter-spacing:1px; line-height:1.7; }
        .pr-postpone-btn { display:inline-flex; align-items:center; gap:8px; background:rgba(255,0,204,0.08); border:1px solid rgba(255,0,204,0.3); color:rgba(255,0,204,0.8); font-family:'Orbitron',monospace; font-size:10px; font-weight:700; letter-spacing:2px; padding:10px 16px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .pr-postpone-btn:hover { background:rgba(255,0,204,0.14); color:#FF00CC; border-color:#FF00CC; box-shadow:0 0 15px rgba(255,0,204,0.2); }
      `}</style>

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

          {activeTab === "fixtures" && (
            <>
              {maxRound > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
                  <button
                    className="pr-postpone-btn"
                    onClick={() => {
                      setPostponeRound("1");
                      setPostponeConfirm(false);
                      setPostponeResult(null);
                      setShowPostponeModal(true);
                    }}
                  >
                    📅 POSTPONE ROUND
                  </button>
                </div>
              )}
              <FixturesTab matches={matches} referees={referees} onAssignReferee={(matchId, refereeId) => assignRefereeMutation.mutate({ matchId, refereeId })} />
            </>
          )}

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
        seasonStartDate={newSeasonStartDate}
        setSeasonStartDate={setNewSeasonStartDate}
        isPending={createNewSeasonMutation.isPending}
      />

      {/* Postpone Round Modal */}
      {showPostponeModal && (
        <div className="pr-modal-overlay" onClick={closePostponeModal}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <p className="pr-modal-title">📅 POSTPONE ROUND</p>
            <p className="pr-modal-sub">// PUSH ROUND FORWARD BY 7 DAYS</p>

            {postponeResult ? (
              <>
                <div className="pr-success">
                  ✓ ROUND {postponeRound} POSTPONED<br />
                  {postponeResult.matchesUpdated} match{postponeResult.matchesUpdated !== 1 ? "es" : ""} rescheduled to {postponeResult.newDate}<br />
                  {postponeResult.sent} of {postponeResult.total} captains notified
                </div>
                <button className="pr-modal-submit" style={{ width: "100%" }} onClick={closePostponeModal}>
                  DONE
                </button>
              </>
            ) : postponeConfirm ? (
              <>
                <div className="pr-confirm">
                  <p className="pr-confirm-text">
                    Are you sure you want to postpone <strong>Round {postponeRound}</strong>?<br /><br />
                    All {matches.filter((m) => m.round_number === parseInt(postponeRound)).length} match
                    {matches.filter((m) => m.round_number === parseInt(postponeRound)).length !== 1 ? "es" : ""} will
                    be pushed forward by <strong>7 days</strong>. All captains will be notified by in-app notification and email.
                  </p>
                </div>
                <div className="pr-modal-btns">
                  <button className="pr-modal-cancel" onClick={() => setPostponeConfirm(false)}>
                    BACK
                  </button>
                  <button
                    className="pr-modal-submit"
                    onClick={handlePostponeRound}
                    disabled={postponeRoundMutation.isPending}
                  >
                    {postponeRoundMutation.isPending ? "POSTPONING..." : "CONFIRM POSTPONE"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="pr-modal-label">SELECT ROUND</label>
                <select
                  className="pr-modal-select"
                  value={postponeRound}
                  onChange={(e) => setPostponeRound(e.target.value)}
                >
                  {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => (
                    <option key={r} value={r}>Round {r}</option>
                  ))}
                </select>
                <div className="pr-modal-btns">
                  <button className="pr-modal-cancel" onClick={closePostponeModal}>
                    CANCEL
                  </button>
                  <button
                    className="pr-modal-submit"
                    onClick={() => setPostponeConfirm(true)}
                    disabled={!postponeRound}
                  >
                    NEXT →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
