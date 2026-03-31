import { X, Copy, Printer, CheckCircle } from "lucide-react";

export function CredentialsModal({
  credentials,
  onClose,
  onCopy,
  onPrint,
  copied,
}) {
  return (
    <div className="ad-modal-overlay">
      <div className="ad-modal">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h3 className="ad-modal-title">
            {credentials.isExisting
              ? "// EXISTING CREDENTIALS"
              : "// CREDENTIALS GENERATED"}
          </h3>
          <button
            style={{
              background: "none",
              border: "none",
              color: "rgba(0,245,212,0.4)",
              cursor: "pointer",
            }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="ad-creds-warning">
          ⚠ SAVE THESE CREDENTIALS — THEY CANNOT BE RECOVERED LATER
        </p>
        <div className="ad-creds-card">
          <div className="ad-creds-row">
            <span className="ad-creds-label">VENUE</span>
            <span className="ad-creds-value">{credentials.venueName}</span>
          </div>
          <div className="ad-creds-row">
            <span className="ad-creds-label">FIELD</span>
            <span className="ad-creds-value">{credentials.fieldNumber}</span>
          </div>
          <div className="ad-creds-row">
            <span className="ad-creds-label">EMAIL</span>
            <span className="ad-creds-value" style={{ fontSize: 11 }}>
              {credentials.email}
            </span>
          </div>
          <div className="ad-creds-row">
            <span className="ad-creds-label">PASSWORD</span>
            <span className="ad-creds-password">{credentials.password}</span>
          </div>
        </div>
        <div className="ad-creds-btns">
          <button className="ad-creds-copy" onClick={onCopy}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? "COPIED!" : "COPY"}
          </button>
          <button className="ad-creds-print" onClick={onPrint}>
            <Printer size={14} /> PRINT
          </button>
        </div>
        <button className="ad-creds-done" onClick={onClose}>
          DONE
        </button>
      </div>
    </div>
  );
}
