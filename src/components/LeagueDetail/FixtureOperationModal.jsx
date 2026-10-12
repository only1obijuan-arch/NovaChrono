import { useState } from "react";
import { localDateString } from "@/utils/scheduling";

const TITLES = {
  edit: "EDIT FIXTURE",
  postpone: "POSTPONE FIXTURE",
  cancel: "CANCEL FIXTURE",
  correction: "CORRECT RESULT",
  forfeit: "RECORD FORFEIT / WALKOVER",
};

export function FixtureOperationModal({ mode, match, league, referees, pending, onClose, onSubmit }) {
  const [matchDate, setMatchDate] = useState(localDateString(match.match_date));
  const [timeSlot, setTimeSlot] = useState(match.time_slot ?? "");
  const [fieldNumber, setFieldNumber] = useState(match.field_number ?? 1);
  const [refereeId, setRefereeId] = useState(match.referee_id ?? "");
  const [homeScore, setHomeScore] = useState(match.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(match.away_score ?? 0);
  const [status, setStatus] = useState(match.status === "final" ? "final" : "scheduled");
  const [reason, setReason] = useState("");
  const [winnerSide, setWinnerSide] = useState("");

  function submit(event) {
    event.preventDefault();
    if (mode === "edit") {
      onSubmit({
        action: "EDIT_FIXTURE",
        matchId: match.id,
        matchDate,
        timeSlot,
        fieldNumber: Number(fieldNumber),
        refereeId: refereeId || null,
      });
    } else if (mode === "postpone") {
      onSubmit({ action: "POSTPONE_FIXTURE", matchId: match.id });
    } else if (mode === "cancel") {
      onSubmit({ action: "CANCEL_FIXTURE", matchId: match.id });
    } else if (mode === "correction") {
      onSubmit({
        action: "ADMIN_OVERRIDE",
        matchId: match.id,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
        status,
        reason,
      });
    } else if (mode === "forfeit") {
      onSubmit({ action: "FORFEIT_MATCH", matchId: match.id, winnerSide, ...(reason.trim() ? { reason } : {}) });
    }
  }

  const destructive = mode === "postpone" || mode === "cancel";
  return (
    <div className="fx-modal-overlay" onClick={pending ? undefined : onClose}>
      <form className="fx-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <p className="fx-modal-title">{TITLES[mode]}</p>
        <p className="fx-modal-sub">
          {match.home_team_name || "TBD"} vs {match.away_team_name || "TBD"}
        </p>

        {mode === "edit" && (
          <div className="fx-form-grid">
            <label>LOCAL DATE<input type="date" value={matchDate} onChange={(event) => setMatchDate(event.target.value)} required /></label>
            <label>KICKOFF<input type="time" value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} required /></label>
            <label>FIELD<input type="number" min="1" max={league.fields_count} value={fieldNumber} onChange={(event) => setFieldNumber(event.target.value)} required /></label>
            <label>REFEREE<select value={refereeId} onChange={(event) => setRefereeId(event.target.value)}>
              <option value="">Unassigned</option>
              {referees.map((referee) => <option key={referee.id} value={referee.id}>{referee.name}</option>)}
            </select></label>
          </div>
        )}

        {mode === "correction" && (
          <div className="fx-form-grid">
            <label>HOME SCORE<input type="number" min="0" max="99" value={homeScore} onChange={(event) => setHomeScore(event.target.value)} required /></label>
            <label>AWAY SCORE<input type="number" min="0" max="99" value={awayScore} onChange={(event) => setAwayScore(event.target.value)} required /></label>
            <label>RESULT STATE<select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="final">Final</option>
              <option value="scheduled">Scheduled / non-final</option>
            </select></label>
            <label className="fx-full">CORRECTION REASON<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength="1" maxLength="500" required /></label>
          </div>
        )}

        {mode === "forfeit" && (
          <div className="fx-form-grid">
            <label className="fx-full">WINNING TEAM<select value={winnerSide} onChange={(event) => setWinnerSide(event.target.value)} required>
              <option value="">Select the winning team...</option>
              <option value="home">{match.home_team_name || "Home team"}</option>
              <option value="away">{match.away_team_name || "Away team"}</option>
            </select></label>
            <label className="fx-full">NOTE (OPTIONAL)<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength="500" /></label>
            <p className="fx-warning fx-full">The configured league forfeit score will be used and the result will become final.</p>
          </div>
        )}

        {destructive && (
          <p className="fx-warning">
            {mode === "postpone"
              ? "This keeps the fixture and history, releases its current slot, and allows later rescheduling."
              : "This keeps the fixture and history, releases its slot, and does not award a result."}
          </p>
        )}

        <div className="fx-modal-actions">
          <button type="button" className="fx-secondary" onClick={onClose} disabled={pending}>BACK</button>
          <button type="submit" className="fx-primary" disabled={pending || (mode === "correction" && !reason.trim()) || (mode === "forfeit" && !winnerSide)}>
            {pending ? "SAVING..." : `CONFIRM ${TITLES[mode]}`}
          </button>
        </div>
      </form>
    </div>
  );
}
