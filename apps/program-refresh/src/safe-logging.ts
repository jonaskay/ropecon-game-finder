export type LogLevel = "info" | "warn" | "error";
export interface SafeLogger { log(level: LogLevel, event: string, fields?: Record<string, string | number | boolean>): void }

export const jsonLogger: SafeLogger = {
  log(level, event, fields = {}) {
    const line = JSON.stringify({ severity: level.toUpperCase(), event, ...fields });
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  },
};
