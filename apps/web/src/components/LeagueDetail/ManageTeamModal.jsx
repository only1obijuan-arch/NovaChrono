import { X } from "lucide-react";

export function ManageTeamModal({
  show,
  onClose,
  onUpdate,
  onDelete,
  selectedTeam,
  teamForm,
  setTeamForm,
  updatePending,
  deletePending,
}) {
  if (!show || !selectedTeam) return null;

  return (
    <div className="ld-modal-overlay">
      <div className="ld-modal">
        <div className="ld-modal-header">
          <h3 className="ld-modal-title">// MANAGE TEAM</h3>
          <button className="ld-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUpdate();
          }}
        >
          <label className="ld-modal-label">TEAM NAME</label>
          <input
            required
            type="text"
            className="ld-modal-input"
            value={teamForm.name}
            onChange={(e) => setTeamForm({ name: e.target.value })}
          />
          <div className="ld-modal-btns">
            <button
              type="button"
              className="ld-modal-delete"
              onClick={() => {
                if (confirm(`Delete ${selectedTeam.name}?`)) onDelete();
              }}
              disabled={deletePending}
            >
              DELETE
            </button>
            <button
              type="submit"
              className="ld-modal-submit"
              disabled={updatePending}
            >
              {updatePending ? "UPDATING..." : "UPDATE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
