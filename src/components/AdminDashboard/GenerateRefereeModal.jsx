import { X } from "lucide-react";

export function GenerateRefereeModal({ fieldInput, setFieldInput, onClose, onSubmit, isSubmitting }) {
  return (
    <div className="ad-modal-overlay">
      <div className="ad-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h3 className="ad-modal-title">// GENERATE REF LOGIN</h3>
            <p className="ad-modal-sub">CREATE CREDENTIALS FOR A FIELD REFEREE</p>
          </div>
          <button style={{ background: "none", border: "none", color: "rgba(0,245,212,0.4)", cursor: "pointer" }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="ad-modal-label">FIELD NUMBER</label>
        <input
          type="number"
          min="1"
          className="ad-modal-input"
          placeholder="1"
          value={fieldInput}
          onChange={(e) => setFieldInput(e.target.value)}
          autoFocus
        />
        <div className="ad-modal-btns">
          <button className="ad-modal-cancel" onClick={onClose}>CANCEL</button>
          <button className="ad-modal-submit" onClick={onSubmit} disabled={!fieldInput || isSubmitting}>
            {isSubmitting ? "GENERATING..." : "GENERATE →"}
          </button>
        </div>
      </div>
    </div>
  );
}
