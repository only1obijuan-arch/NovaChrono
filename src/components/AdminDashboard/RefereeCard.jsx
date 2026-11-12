export function RefereeCard({ referee, index, onShowCredentials }) {
  return (
    <div className="ad-ref-card" style={{ animationDelay: `${index * 0.06}s` }}>
      <p className="ad-ref-field-label">FIELD</p>
      <p className="ad-ref-field">{referee.field_number}</p>
      <p className="ad-ref-email">{referee.email || referee.account_status?.replaceAll("_", " ")}</p>
      <button className="ad-ref-show-btn" disabled={referee.account_status !== "active"} onClick={() => onShowCredentials(referee.field_number)}>
        RESET & VIEW CREDENTIALS
      </button>
    </div>
  );
}
