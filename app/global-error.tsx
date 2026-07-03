"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Global error boundary:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          background: "#f4f4f5",
          color: "#18181b",
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "360px", color: "#52525b", margin: 0 }}>
          We hit an unexpected error. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#4f46e5",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            padding: "12px 22px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
