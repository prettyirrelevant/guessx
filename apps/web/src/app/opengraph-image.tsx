import { join } from "path";
import { readFile } from "fs/promises";

import { ImageResponse } from "next/og";

export const alt = "guessX — the multiplayer guessing game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MODES = [
  {
    label: "music",
    paths: ["M4 14a8 8 0 0 1 16 0", "M4 14v5", "M20 14v5", "M4 19h3v-5H4", "M17 19h3v-5h-3"],
  },
  {
    label: "logos",
    paths: ["M12 3a9 9 0 1 0 9 9", "M12 7v10", "M8 12h8"],
  },
  {
    label: "actors",
    paths: ["M3 5h18v14H3z", "M7 5v14", "M17 5v14", "M3 9h4", "M17 9h4", "M3 15h4", "M17 15h4"],
  },
  {
    label: "flags",
    paths: ["M5 21V4", "M5 5h12l-2 4 2 4H5"],
  },
] as const;

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
        {MODES.map(({ label, paths }) => (
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
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {paths.map((path) => (
                <path key={path} d={path} />
              ))}
            </svg>
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
