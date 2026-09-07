import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#161616" }}>
        <div style={{ position: "relative", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "1.4px solid #f4f3ef" }}>
          <div style={{ position: "absolute", width: 1.4, height: 26, background: "#f4f3ef" }} />
          <div style={{ position: "absolute", width: 26, height: 1.4, background: "#f4f3ef" }} />
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#161616", border: "1.2px solid #f4f3ef" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
