export interface RefreshEnvironment {
  bucket: string;
  object: string;
  konstiUrl: string;
}

export function readEnvironment(env: Record<string, string | undefined>): RefreshEnvironment {
  const bucket = env.PROGRAM_BUCKET?.trim();
  if (!bucket) throw new Error("PROGRAM_BUCKET is required");
  return {
    bucket,
    object: env.PROGRAM_OBJECT?.trim() || "program.json",
    konstiUrl: env.KONSTI_URL?.trim() || "https://ropekonsti.fi/api/program-items",
  };
}
