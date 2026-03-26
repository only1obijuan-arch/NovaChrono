import { X } from "lucide-react";

export function AddTeamModal({
  show,
  onClose,
  onSubmit,
  teamForm,
  setTeamForm,
  isPending,
}) {
  if (!show) return null;

  return (
    <div className="ld-modal-overlay">
      <div className="ld-modal">
        <div className="ld-modal-header">
          <h3 className="ld-modal-title">// ADD TEAM</h3>
          <button className="ld-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label className="ld-modal-label">TEAM NAME</label>
          <input
            required
            type="text"
            className="ld-modal-input"
            placeholder="e.g. Phoenix Suns"
            value={teamForm.name}
            onChange={(e) => setTeamForm({ name: e.target.value })}
            autoFocus
          />
          <div className="ld-modal-btns">
            <button type="button" className="ld-modal-cancel" onClick={onClose}>
              CANCEL
            </button>
            <button
              type="submit"
              className="ld-modal-submit"
              disabled={isPending}
            >
              {isPending ? "ADDING..." : "ADD TEAM"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
