import type { NextConfig } from "next";
import { FIRST_APP, APPS } from "./src/apps/registry";

const offersPipeline = APPS.some((app) => app.id === "pipeline");

const nextConfig: NextConfig = {
  // The end-to-end runner sets this to build apart from a developer's own `.next` (see playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A self-contained server in `.next/standalone`, for the container image (see docs/docker.md).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Development only: lets a Windows browser open the dev server by the WSL
  // address (172.16–31.x.x, which changes on every WSL start) when
  // http://localhost:3000 isn't forwarded.
  allowedDevOrigins: ["172.*.*.*"],
  // Redirect index routes here rather than with redirect() in a page:
  // a page that only redirects can't be prerendered for instant validation.
  async redirects() {
    const redirects = [
      { source: "/", destination: FIRST_APP.href, permanent: false },
      // The extraction page used to have its own address.
      {
        source: "/studio/workspaces/:id/extract",
        destination: "/studio/workspaces/:id",
        permanent: false,
      },
      // Workspaces were called projects: the old addresses open the same workspace.
      {
        source: "/studio/projects/:id/extract",
        destination: "/studio/workspaces/:id",
        permanent: false,
      },
      { source: "/access", destination: "/access/members", permanent: false },
      { source: "/studio/projects", destination: "/studio", permanent: false },
      {
        source: "/studio/projects/:path*",
        destination: "/studio/workspaces/:path*",
        permanent: false,
      },
    ];
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
