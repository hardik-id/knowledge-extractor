import type { NextConfig } from "next";
import { STAGE_IDS } from "./src/types/pipeline";

const FIRST_STAGE_HREF = `/pipeline/${STAGE_IDS[0]}`;

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Development only: lets a Windows browser open the dev server by the WSL
  // address (172.16–31.x.x, which changes on every WSL start) when
  // http://localhost:3000 isn't forwarded.
  allowedDevOrigins: ["172.*.*.*"],
  // Redirect index routes here rather than with redirect() in a page:
  // a page that only redirects can't be prerendered for instant validation.
  async redirects() {
    return [
      { source: "/", destination: FIRST_STAGE_HREF, permanent: false },
      { source: "/pipeline", destination: FIRST_STAGE_HREF, permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
