import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { AppError, actorFor, type Actor } from "./access";

/** Runs a server route for the signed-in member, turning refusals into statuses. */
export async function asMember(
  request: Request,
  handle: (actor: Actor) => Promise<Response>,
): Promise<Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return Response.json({ error: "Sign in through your Gateway" }, { status: 401 });
  try {
    return await handle(await actorFor(user));
  } catch (error) {
    if (error instanceof AppError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
