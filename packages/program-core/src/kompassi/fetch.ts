import { KOMPASSI_GRAPHQL_URL, KOMPASSI_SCHEDULE_QUERY } from "./query.ts";
import { parseKompassiSchedule, type KompassiSchedule } from "./schema.ts";

export interface FetchKompassiScheduleOptions {
  url?: string;
  eventSlug: string;
  locale: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchKompassiSchedule({
  url = KOMPASSI_GRAPHQL_URL,
  eventSlug,
  locale,
  fetchImpl = fetch,
  signal,
}: FetchKompassiScheduleOptions): Promise<KompassiSchedule> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "ropecon-program-refresh/1.0",
    },
    body: JSON.stringify({
      query: KOMPASSI_SCHEDULE_QUERY,
      variables: { eventSlug, locale },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Kompassi fetch failed: ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  return parseKompassiSchedule(payload);
}
