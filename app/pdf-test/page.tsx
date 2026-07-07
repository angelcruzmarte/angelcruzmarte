"use client"

import { useState } from "react"
import { PdfFollowAlong } from "@/components/pdf-follow-along"

const SRC =
  "https://m8ncvtul4cbioyzt.public.blob.vercel-storage.com/documents/gxgP287E5Crp6YfubUUwf3IDZH1GUaLO/1783436499279-di8zDWTTyNyKwa7tjBnhs9GQfsZMaU.pdf"

export default function PdfTest() {
  const [status, setStatus] = useState("mounting")
  const [page, setPage] = useState({ current: 0, total: 0 })

  return (
    <div>
      <div
        data-testid="status"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9999,
          background: "black",
          color: "lime",
          font: "12px monospace",
          padding: 4,
        }}
      >
        {status} | page {page.current}/{page.total}
      </div>
      <PdfFollowAlong
        src={SRC}
        activeWord={-1}
        onWords={(_t, c) => setStatus(`ready words=${c}`)}
        onPageChange={(cur, total) => setPage({ current: cur, total })}
        onError={() => setStatus("ERROR: onError fired")}
      />
    </div>
  )
}
