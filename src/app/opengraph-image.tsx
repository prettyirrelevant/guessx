import { join } from "path";
import { readFile } from "fs/promises";

import { ImageResponse } from "next/og";

export const alt = "guessX — the multiplayer guessing game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [syne, dmMono] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Syne-ExtraBold.ttf")),
    readFile(join(process.cwd(), "public/fonts/DMMono-Medium.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        padding: 80,
      }}
    >
      <div
        style={{
          fontFamily: "Syne",
          fontSize: 160,
          color: "#e8e8e8",
          letterSpacing: -4,
          lineHeight: 1,
          display: "flex",
        }}
      >
        guess<span style={{ color: "#c8f135" }}>X</span>
      </div>

      <div
        style={{
          fontFamily: "DM Mono",
          fontSize: 30,
          color: "#666666",
          lineHeight: 1.6,
          marginTop: 36,
          display: "flex",
        }}
      >
        challenge your friends in real-time.
      </div>

      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 64,
          fontFamily: "DM Mono",
          fontSize: 22,
          color: "#888888",
        }}
      >
        {[
          ["🎧", "music"],
          ["🌍", "places"],
          ["🎬", "actors"],
          ["🚩", "flags"],
        ].map(([icon, label]) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 24px",
              borderRadius: 999,
              background: "#111111",
              border: "1px solid #222222",
            }}
          >
            <span style={{ fontSize: 24 }}>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Syne", data: syne, style: "normal", weight: 800 },
        { name: "DM Mono", data: dmMono, style: "normal", weight: 500 },
      ],
    },
  );
}
