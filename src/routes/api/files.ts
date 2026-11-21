import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import { uploadFile } from "@/server/files";

// Uploads one attachment (multipart: pageId, file) to a page the caller can edit.
export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) =>
        asMember(request, async (actor) => {
          const form = await request.formData().catch(() => null);
          const pageId = form?.get("pageId");
          const file = form?.get("file");
          if (typeof pageId !== "string" || !(file instanceof File))
            return Response.json({ error: "Send a pageId and a file" }, { status: 400 });
          return Response.json(await uploadFile(actor, pageId, file), { status: 201 });
        }),
    },
  },
});
