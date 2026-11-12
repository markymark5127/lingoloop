import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth-gated, per-user app: every page reads the session at request time, so we use the
  // classic dynamic rendering model rather than Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // The service worker must always be revalidated so updates roll out promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  images: { remotePatterns: [{ protocol: "http", hostname: "127.0.0.1" }, { protocol: "https", hostname: "*.supabase.co" }] },
};

export default nextConfig;
