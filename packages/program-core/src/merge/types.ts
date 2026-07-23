import type { ProjectedItem } from "../konsti/schema.ts";
import type { KompassiScheduleItem } from "../kompassi/schema.ts";

export interface MergedProgramItem {
  /** Authoritative inventory, identity, schedule, location, and cancellation source. */
  scheduleItem: KompassiScheduleItem;
  /** Optional PII-free enrichment and live capacity source. */
  konsti: ProjectedItem | null;
}

export type MergeFindingSeverity = "warn" | "hard";

export type MergeFindingCode =
  | "DUPLICATE_KOMPASSI_SLUG"
  | "DUPLICATE_KONSTI_ID"
  | "INVALID_KOMPASSI_TIME"
  | "UNKNOWN_KOMPASSI_DIMENSION"
  | "UNKNOWN_REGISTRATION_VALUE"
  | "MISSING_REGISTRATION"
  | "CONTRADICTORY_REGISTRATION"
  | "KONSTI_ORPHANS"
  | "MERGE_FIELD_CONFLICT"
  | "ZERO_MATCHES";

export interface MergeFinding {
  severity: MergeFindingSeverity;
  code: MergeFindingCode;
  count: number;
  field?: "title" | "startTime" | "location" | "cancellation" | "signupType";
  values?: string[];
}

export interface RegistrationCounts {
  matched: Record<string, number>;
  unmatched: Record<string, number>;
}

export interface ReconciliationReport {
  kompassiItems: number;
  kompassiGamingItems: number;
  konstiItems: number;
  matchedItems: number;
  unmatchedKompassiItems: number;
  konstiOrphans: number;
  registrations: RegistrationCounts;
  conflicts: {
    title: number;
    startTime: number;
    location: number;
    cancellation: number;
    signupType: number;
  };
}

export interface MergeResult {
  items: MergedProgramItem[];
  report: ReconciliationReport;
  findings: MergeFinding[];
  hasHardFailure: boolean;
}
