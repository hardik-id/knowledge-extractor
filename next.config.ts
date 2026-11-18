import type { NextConfig } from "next";
import { FIRST_APP, APPS } from "./src/apps/registry";

const offersPipeline = APPS.some((app) => app.id === "pipeline");

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
    const redirects = [{ source: "/", destination: FIRST_APP.href, permanent: false }];
    if (offersPipeline) {
      redirects.push({ source: "/pipeline", destination: "/pipeline/select", permanent: false });
    }
    return redirects;
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
