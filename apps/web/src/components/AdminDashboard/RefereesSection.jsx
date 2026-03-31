import { Shield } from "lucide-react";
import { RefereeCard } from "./RefereeCard";

export function RefereesSection({
  referees,
  isLoading,
  onAddReferee,
  onDeleteReferee,
  onShowCredentials,
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div className="ad-section-title" style={{ margin: 0, flex: 1 }}>
          // REFEREE ACCOUNTS <div className="ad-section-line" />
        </div>
        <button
          className="ad-add-ref-btn"
          onClick={onAddReferee}
          style={{ marginLeft: 16, flexShrink: 0 }}
        >
          <Shield size={12} /> GENERATE REF LOGIN
        </button>
      </div>

      {isLoading ? (
        <div className="ad-refs-grid">
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 100,
                background: "rgba(11,20,40,0.8)",
                borderRadius: 8,
                border: "1px solid rgba(0,245,212,0.08)",
              }}
            />
          ))}
        </div>
      ) : referees.length === 0 ? (
        <div
          style={{
            background: "rgba(11,20,40,0.6)",
            border: "2px dashed rgba(0,245,212,0.1)",
            borderRadius: 8,
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <Shield
            size={32}
            color="rgba(0,245,212,0.2)"
            style={{ margin: "0 auto 12px" }}
          />
          <p
            style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 10,
              color: "rgba(0,245,212,0.3)",
              letterSpacing: 3,
            }}
          >
            NO REFEREE ACCOUNTS GENERATED
          </p>
        </div>
      ) : (
        <div className="ad-refs-grid">
          {referees.map((ref, i) => (
            <RefereeCard
              key={ref.id}
              referee={ref}
              index={i}
              onDelete={onDeleteReferee}
              onShowCredentials={onShowCredentials}
            />
          ))}
        </div>
      )}
    </div>
  );
}
