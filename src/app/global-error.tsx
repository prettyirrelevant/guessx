"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#e8e8e8",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>
            guess<span style={{ color: "#c8f135" }}>X</span>
          </h1>
          <p style={{ color: "#666", marginBottom: 24 }}>something went seriously wrong</p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              background: "#c8f135",
              color: "#0a0a0a",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            try again
          </button>
        </div>
      </body>
    </html>
  );
}
