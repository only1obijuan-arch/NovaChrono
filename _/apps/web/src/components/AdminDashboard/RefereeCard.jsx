import { Trash2 } from "lucide-react";

export function RefereeCard({ referee, index, onDelete, onShowCredentials }) {
  return (
    <div className="ad-ref-card" style={{ animationDelay: `${index * 0.06}s` }}>
      <button
        className="ad-ref-delete"
        onClick={() => {
          if (confirm(`Remove referee for Field ${referee.field_number}?`)) {
            onDelete(referee.id);
          }
        }}
      >
        <Trash2 size={12} />
      </button>
      <p className="ad-ref-field-label">FIELD</p>
      <p className="ad-ref-field">{referee.field_number}</p>
      <p className="ad-ref-email">{referee.email}</p>
      <button
        className="ad-ref-show-btn"
        onClick={() => onShowCredentials(referee.field_number)}
      >
        RESET & VIEW CREDENTIALS
      </button>
    </div>
  );
}
