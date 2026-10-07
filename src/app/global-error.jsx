"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#091833",
          color: "#f4f4f9",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, sans-serif",
          gap: 16,
          justifyContent: "center",
          minHeight: "100vh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1>NovaChrono encountered an unexpected error</h1>
        <p>Please retry. If the problem continues, contact your venue administrator.</p>
        <button onClick={() => reset()} type="button">
          Try again
        </button>
      </body>
    </html>
  );
}
