import { ImageResponse } from "next/og";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

export const alt = "Gat Scan — Maison Margiela Replica GAT price finder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same photo as the hero, read from the project instead of hotlinked from
// imgur — a failed remote fetch made the whole image route return a 500.
const gatData = await readFile(join(process.cwd(), "public/images/gat-reference.png"), "base64");
const gatSrc = `data:image/png;base64,${gatData}`;

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "48px 64px", color: "#000", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 500, letterSpacing: 4 }}>GAT SCAN</div>
        <img src={gatSrc} alt="Brown Maison Margiela Replica GAT sneaker" width={760} height={313} />
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 44, letterSpacing: -1 }}>Find the pair for you.</div>
          <div style={{ display: "flex", fontSize: 18, color: "#767676", textTransform: "uppercase" }}>Maison Margiela — Replica GAT</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
