const FETCHER = "https://www.simbrief.com/api/xml.fetcher.php";

export type SimbriefFetchParams = { userid: string } | { username: string };

export function simbriefFetcherUrl(params: SimbriefFetchParams): string {
  const u = new URL(FETCHER);
  u.searchParams.set("json", "1");
  if ("userid" in params) {
    u.searchParams.set("userid", params.userid);
  } else {
    u.searchParams.set("username", params.username);
  }
  return u.toString();
}

export async function fetchLatestOfpJson(
  params: SimbriefFetchParams,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string }> {
  const url = simbriefFetcherUrl(params);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: text.slice(0, 500) || `SimBrief returned ${res.status}`,
    };
  }
  try {
    const data = JSON.parse(text) as unknown;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      status: 500,
      message: "SimBrief response was not valid JSON.",
    };
  }
}
