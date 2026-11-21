import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicPage } from "@/server/publish";

/**
 * A published page for anyone with its link. Called only while the public
 * route renders on the server: /_serverFn is not a public path.
 */
export const getPublished = createServerFn()
  .validator((data: unknown) =>
    z.object({ slug: z.string().min(1).max(64), p: z.string().uuid().optional() }).strict().parse(data),
  )
  .handler(({ data }) => getPublicPage(data.slug, data.p));
