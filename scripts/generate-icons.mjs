// Renders the PWA icons into public/icons using next/og (bundled with Next).
// Usage: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const INK = "#0a0a0b";
const VOLT = "#d7ff3a";

/** A volt "drop" chevron over a bar, on ink. Full-bleed so it also works as maskable. */
function icon(size) {
  const s = size / 512;
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        background: INK,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 34 * s,
      },
    },
    h(
      "svg",
      { width: 230 * s, height: 165 * s, viewBox: "0 0 230 165" },
      h("path", {
        d: "M30 30 L115 132 L200 30",
        fill: "none",
        stroke: VOLT,
        strokeWidth: 44,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    ),
    h("div", { style: { width: 250 * s, height: 36 * s, borderRadius: 18 * s, background: VOLT } }),
  );
}

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

await mkdir("public/icons", { recursive: true });
for (const [name, size] of targets) {
  const png = await new ImageResponse(icon(size), { width: size, height: size }).arrayBuffer();
  await writeFile(`public/icons/${name}`, Buffer.from(png));
  console.log(`wrote public/icons/${name}`);
}
