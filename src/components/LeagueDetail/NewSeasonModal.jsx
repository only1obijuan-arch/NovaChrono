import { X } from "lucide-react";

export function NewSeasonModal({ show, onClose, onCreate, seasonName, setSeasonName, isPending }) {
  if (!show) return null;

  return (
    <div className="ld-modal-overlay">
      <div className="ld-modal">
        <div className="ld-modal-header">
          <h3 className="ld-modal-title">// NEW SEASON</h3>
          <button className="ld-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="ld-modal-label">SEASON NAME</label>
        <input
          type="text"
          className="ld-modal-input"
          placeholder="e.g. Season 2"
          value={seasonName}
          onChange={(e) => setSeasonName(e.target.value)}
          autoFocus
        />
        <div className="ld-modal-btns">
          <button type="button" className="ld-modal-cancel" onClick={onClose}>CANCEL</button>
          <button className="ld-modal-submit" onClick={onCreate} disabled={isPending}>
            {isPending ? "CREATING..." : "CREATE"}
          </button>
        </div>
      </div>
    </div>
  );
}
