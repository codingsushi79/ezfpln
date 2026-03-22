import type { SessionData } from "@/types/session";
import {
  getUserIntegrationsById,
  updateUserNavigraph,
  updateUserSimbrief,
} from "@/lib/users-repo";

/**
 * When logged in, integrations live in Postgres. Hydrate the iron-session from
 * the DB; if the DB row is still empty but the cookie has legacy data, migrate
 * cookie → DB once.
 */
export async function syncIntegrationsForAccount(
  session: SessionData,
): Promise<void> {
  const id = session.account?.id;
  if (!id) return;

  const row = await getUserIntegrationsById(id);
  if (!row) return;

  session.account = {
    id: session.account!.id,
    email: session.account!.email,
    username: row.username ?? undefined,
  };

  const hasDbSimbrief =
    (row.simbrief_userid && row.simbrief_userid.length > 0) ||
    (row.simbrief_username && row.simbrief_username.length > 0);
  if (hasDbSimbrief) {
    if (row.simbrief_userid) {
      session.simbrief = { userid: row.simbrief_userid, username: undefined };
    } else {
      session.simbrief = {
        userid: undefined,
        username: row.simbrief_username ?? undefined,
      };
    }
  } else if (session.simbrief) {
    await updateUserSimbrief(id, session.simbrief);
  } else {
    session.simbrief = undefined;
  }

  if (row.navigraph_refresh_token) {
    session.navigraph = {
      refreshToken: row.navigraph_refresh_token,
      accessToken: row.navigraph_access_token ?? undefined,
      accessExpiresAt:
        row.navigraph_access_expires_at != null
          ? Number(row.navigraph_access_expires_at)
          : undefined,
    };
  } else if (session.navigraph?.refreshToken) {
    await updateUserNavigraph(id, {
      refreshToken: session.navigraph.refreshToken,
      accessToken: session.navigraph.accessToken,
      accessExpiresAt: session.navigraph.accessExpiresAt,
    });
  } else {
    session.navigraph = undefined;
  }
}

export async function persistNavigraphFromSession(
  session: SessionData,
): Promise<void> {
  const id = session.account?.id;
  if (!id || !session.navigraph?.refreshToken) return;
  await updateUserNavigraph(id, {
    refreshToken: session.navigraph.refreshToken,
    accessToken: session.navigraph.accessToken,
    accessExpiresAt: session.navigraph.accessExpiresAt,
  });
}
