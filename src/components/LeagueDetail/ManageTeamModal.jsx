import { X } from "lucide-react";

export function ManageTeamModal({ show, onClose, onUpdate, onWithdraw, onReplace, selectedTeam, futureFixtureImpact, teamForm, setTeamForm, updatePending, withdrawPending, replacePending }) {
  if (!show || !selectedTeam) return null;

  return (
    <div className="ld-modal-overlay">
      <div className="ld-modal">
        <div className="ld-modal-header">
          <h3 className="ld-modal-title">MANAGE TEAM</h3>
          <button className="ld-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); selectedTeam.status === "active" ? onUpdate() : onReplace(); }}>
          <label className="ld-modal-label">{selectedTeam.status === "active" ? "TEAM NAME" : "REPLACEMENT TEAM NAME"}</label>
          <input
            required
            type="text"
            className="ld-modal-input"
            value={teamForm.name}
            onChange={(e) => setTeamForm((current) => ({ ...current, name: e.target.value }))}
          />
          <label className="ld-modal-label">REASON</label>
          <textarea
            required={selectedTeam.status === "inactive"}
            className="ld-modal-input"
            value={teamForm.reason}
            onChange={(e) => setTeamForm((current) => ({ ...current, reason: e.target.value }))}
            placeholder={selectedTeam.status === "active" ? "Required to withdraw this team" : "Required for the replacement audit"}
          />
          {selectedTeam.status === "inactive" && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#D7E3F1", margin: "12px 0" }}>
              <input
                type="checkbox"
                checked={teamForm.transferFutureFixtures}
                onChange={(e) => setTeamForm((current) => ({ ...current, transferFutureFixtures: e.target.checked }))}
              />
              Transfer scheduled and postponed fixtures to the replacement. Final, live, and cancelled history stays with the withdrawn team.
            </label>
          )}
          <p style={{ color: "rgba(215,227,241,0.7)", fontSize: 12, lineHeight: 1.5 }}>
            A league slot is a schedule position. Withdrawing a team preserves its identity and all historical results.
          </p>
          <p style={{ color: "rgba(215,227,241,0.7)", fontSize: 12, lineHeight: 1.5 }}>
            {selectedTeam.status === "active"
              ? `${futureFixtureImpact} scheduled or postponed fixture${futureFixtureImpact === 1 ? "" : "s"} will remain assigned pending an explicit replacement.`
              : teamForm.transferFutureFixtures
                ? `${futureFixtureImpact} scheduled or postponed fixture${futureFixtureImpact === 1 ? "" : "s"} will be reassigned to the new team.`
                : `${futureFixtureImpact} scheduled or postponed fixture${futureFixtureImpact === 1 ? "" : "s"} will remain assigned to the withdrawn team.`}
          </p>
          <div className="ld-modal-btns">
            {selectedTeam.status === "active" && (
              <button type="button" className="ld-modal-delete" onClick={() => { if (confirm(`Withdraw ${selectedTeam.name}? Historical results will be preserved.`)) onWithdraw(); }} disabled={withdrawPending || !teamForm.reason.trim()}>
                {withdrawPending ? "WITHDRAWING..." : "WITHDRAW TEAM"}
              </button>
            )}
            <button type="submit" className="ld-modal-submit" disabled={updatePending || replacePending || (selectedTeam.status === "inactive" && !teamForm.reason.trim())}>
              {selectedTeam.status === "active" ? (updatePending ? "UPDATING..." : "UPDATE") : (replacePending ? "REPLACING..." : "REPLACE TEAM")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
