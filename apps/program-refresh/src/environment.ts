export interface RefreshEnvironment {
  bucket: string;
  object: string;
  konstiUrl: string;
  kompassiUrl: string;
  kompassiEventSlug: string;
  kompassiLocale: string;
}

export function readEnvironment(env: Record<string, string | undefined>): RefreshEnvironment {
  const bucket = env.PROGRAM_BUCKET?.trim();
  if (!bucket) throw new Error("PROGRAM_BUCKET is required");
  return {
    bucket,
    object: env.PROGRAM_OBJECT?.trim() || "program.json",
    konstiUrl: env.KONSTI_URL?.trim() || "https://ropekonsti.fi/api/program-items",
    kompassiUrl: env.KOMPASSI_URL?.trim() || "https://kompassi.eu/graphql",
    kompassiEventSlug: env.KOMPASSI_EVENT_SLUG?.trim() || "ropecon2026",
    kompassiLocale: env.KOMPASSI_LOCALE?.trim() || "en",
  };
}
