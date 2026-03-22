import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import { getPlanePosition } from "@/lib/plane-position-store";
import type { SessionData } from "@/types/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions(),
  );
  const userId = session.account?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Sign in required" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...cors,
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const p = getPlanePosition(userId);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(p)}\n\n`),
        );
      };
      send();
      const id = setInterval(send, 800);
      const onAbort = () => {
        clearInterval(id);
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
      request.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      ...cors,
    },
  });
}
