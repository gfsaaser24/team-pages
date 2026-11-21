import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "team-pages",
  name: "Team Pages",
  description:
    "A shared workspace of nested pages, block documents and databases with table, board, calendar and list views.",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
  public: [
    { path: "/s/:slug", methods: ["GET"] },
    { path: "/s/:slug/files/:fileId", methods: ["GET"] },
  ],
  publicAssets: ["/assets/**", "/icon.svg"],
});
