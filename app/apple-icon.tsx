import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#161616" }}>
        <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", border: "7px solid #f4f3ef" }}>
          <div style={{ position: "absolute", width: 7, height: 132, background: "#f4f3ef" }} />
          <div style={{ position: "absolute", width: 132, height: 7, background: "#f4f3ef" }} />
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#161616", border: "6px solid #f4f3ef" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
