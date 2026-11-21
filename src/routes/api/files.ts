import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import { startUpload, uploadFile } from "@/server/files";

// Uploads an attachment to a page the caller can edit. A file of up to one part
// comes as multipart form data (pageId, file) in this one request. A larger one
// starts here as JSON ({ pageId, name, contentType, size }); its parts then go
// to /api/files/$fileId.
export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) =>
        asMember(request, async (actor) => {
          if (request.headers.get("content-type")?.startsWith("application/json")) {
            const start = (await request.json().catch(() => null)) as Record<string, unknown> | null;
            const { pageId, name, contentType, size } = start ?? {};
            if (typeof pageId !== "string" || typeof name !== "string" || typeof size !== "number")
              return Response.json({ error: "Send a pageId, a name and a size" }, { status: 400 });
            const type = typeof contentType === "string" ? contentType : "";
            return Response.json(await startUpload(actor, { pageId, name, contentType: type, size }), { status: 201 });
          }
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
