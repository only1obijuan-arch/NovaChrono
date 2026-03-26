export function LoadingState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#091833",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            border: "3px solid #00F5D4",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <p
          style={{
            color: "#00F5D4",
            fontFamily: "monospace",
            letterSpacing: 4,
            fontSize: 12,
          }}
        >
          LOADING...
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
