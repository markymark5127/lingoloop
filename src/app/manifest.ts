import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LingoLoop — language immersion",
    short_name: "LingoLoop",
    description: "Learn Spanish or Japanese through short videos, stories, games and AI conversations. スペイン語を動画・物語・ゲーム・AI会話で。",
    start_url: "/home?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "portrait",
    background_color: "#eef0fb",
    theme_color: "#5b3df5",
    lang: "en",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Watch", short_name: "Watch", url: "/videos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Play", short_name: "Play", url: "/games", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Speak", short_name: "Speak", url: "/talk", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
