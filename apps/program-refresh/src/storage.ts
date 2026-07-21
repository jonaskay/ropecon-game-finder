import { Storage } from "@google-cloud/storage";

export interface StoredSnapshot { generation: number; contents: string }
export interface ProgramStorage {
  read(): Promise<StoredSnapshot | null>;
  write(contents: string, ifGenerationMatch: number): Promise<number>;
}

export class GenerationCollisionError extends Error {}

export function cloudProgramStorage(bucketName: string, objectName: string): ProgramStorage {
  const file = new Storage().bucket(bucketName).file(objectName);
  return {
    async read() {
      try {
        const [contents] = await file.download();
        const [metadata] = await file.getMetadata();
        return { contents: contents.toString("utf8"), generation: Number(metadata.generation) };
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw error;
      }
    },
    async write(contents, ifGenerationMatch) {
      try {
        await file.save(contents, {
          contentType: "application/json; charset=utf-8",
          metadata: { cacheControl: "no-cache" },
          preconditionOpts: { ifGenerationMatch },
          resumable: false,
        });
        const [metadata] = await file.getMetadata();
        return Number(metadata.generation);
      } catch (error) {
        if ((error as { code?: number }).code === 412) throw new GenerationCollisionError("generation collision");
        throw error;
      }
    },
  };
}
