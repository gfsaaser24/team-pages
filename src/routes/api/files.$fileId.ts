import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import { fileFor, serveFile } from "@/server/files";

export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { fileId: string } }) =>
        asMember(request, async (actor) => serveFile(await fileFor(actor, params.fileId))),
    },
  },
});
