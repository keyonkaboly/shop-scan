import { ImageResponse } from "next/og";

export const alt = "Gat Scan — Maison Margiela Replica GAT price finder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#252622", padding: 72, color: "#f4f3ef", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
          <div style={{ position: "relative", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #f4f3ef" }}>
            <div style={{ position: "absolute", width: 1.5, height: 38, background: "#f4f3ef" }} />
            <div style={{ position: "absolute", width: 38, height: 1.5, background: "#f4f3ef" }} />
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#252622", border: "1.5px solid #f4f3ef" }} />
          </div>
          GAT SCAN
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <img src="https://i.imgur.com/ng3HoH8.jpg" alt="Brown Maison Margiela Replica GAT sneaker" style={{ width: 640, height: 264, objectFit: "contain" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -2 }}>Find the pair. Keep the change.</div>
          <div style={{ fontSize: 22, color: "#b9b8b0" }}>Live market scan for the Maison Margiela Replica GAT.</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
