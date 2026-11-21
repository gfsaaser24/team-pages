// The app's tools for AI clients, served by the Gateway at /mcp with the
// signed-in user. They read through the same access checks as the pages.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { AppError, actorFor } from "@/server/access";
import * as pages from "@/server/pages";

export const tools = defineTools(
  {
    search_pages: {
      description:
        "Search the titles and text of pages the user can open. Returns ids, titles, where each page sits and when it was last edited.",
      risk: "read",
      input: pages.searchInput,
      handler: async (input, { user }) => pages.search(await actorFor(user), input.q),
    },
    read_page: {
      description: "Read one page's title and blocks by id.",
      risk: "read",
      input: pages.pageIdInput,
      handler: async (input, { user }) => {
        try {
          const { page, breadcrumb } = await pages.getPage(await actorFor(user), input.id);
          return { title: page.title, path: breadcrumb.map((b) => b.title), blocks: page.blocks };
        } catch (error) {
          if (error instanceof AppError) throw new ToolError(error.message);
          throw error;
        }
      },
    },
  },
  { instructions: "Call search_pages to find a page id before read_page." },
);
