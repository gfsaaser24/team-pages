import { createFileRoute } from "@tanstack/react-router";
import { publicFile } from "@/server/publish";
import { serveFile } from "@/server/files";

// Public: an attachment on a page inside a live publish link's subtree.
export const Route = createFileRoute("/s/$slug/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { slug: string; fileId: string } }) => {
        const file = await publicFile(params.slug, params.fileId).catch(() => null);
        if (!file) return new Response("Not found", { status: 404 });
        return serveFile(file);
      },
    },
  },
});
