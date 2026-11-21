import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import { abortUpload, completeUpload, fileFor, serveFile, uploadPart } from "@/server/files";

type Args = { request: Request; params: { fileId: string } };

// GET serves a stored file. While a large upload is in progress, the same id
// takes its parts (PUT ?part=N, the part's bytes as the body), then completes
// (POST { parts: [{ partNumber, etag }] }) or cancels (DELETE).
export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: ({ request, params }: Args) =>
        asMember(request, async (actor) => serveFile(await fileFor(actor, params.fileId))),
      PUT: ({ request, params }: Args) =>
        asMember(request, async (actor) => {
          const partNumber = Number(new URL(request.url).searchParams.get("part"));
          const bytes = await request.arrayBuffer();
          return Response.json(await uploadPart(actor, params.fileId, partNumber, bytes));
        }),
      POST: ({ request, params }: Args) =>
        asMember(request, async (actor) => {
          const body = (await request.json().catch(() => null)) as { parts?: unknown } | null;
          const parts = Array.isArray(body?.parts) ? body.parts : null;
          const valid = parts?.every(
            (p) => typeof p?.partNumber === "number" && typeof p?.etag === "string",
          );
          if (!parts || !valid)
            return Response.json({ error: "Send the parts: [{ partNumber, etag }]" }, { status: 400 });
          return Response.json(
            await completeUpload(actor, params.fileId, parts as { partNumber: number; etag: string }[]),
            { status: 201 },
          );
        }),
      DELETE: ({ request, params }: Args) =>
        asMember(request, async (actor) => {
          await abortUpload(actor, params.fileId);
          return new Response(null, { status: 204 });
        }),
    },
  },
});
