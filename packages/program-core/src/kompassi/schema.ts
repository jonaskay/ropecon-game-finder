export interface KompassiLink {
  href: string;
}

/** Dimension names and values are intentionally open-ended at the wire boundary. */
export type KompassiCachedDimensions = Record<string, string[]>;

export interface KompassiProgramReference {
  slug: string;
  color: string;
  links: KompassiLink[];
}

export interface KompassiScheduleItemWire {
  slug: string;
  title: string;
  location: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isCancelled: boolean;
  cachedDimensions: KompassiCachedDimensions;
  links: KompassiLink[];
  program: KompassiProgramReference;
}

export interface KompassiGraphQlResponse {
  data?: {
    event: {
      name: string;
      timezone: string;
      program: {
        isSchedulePublic: boolean;
        scheduleItems: KompassiScheduleItemWire[] | null;
      } | null;
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    path?: Array<string | number>;
  }>;
}

export type KompassiLinkFindingCode =
  | "invalid_signup_link"
  | "duplicate_signup_link"
  | "invalid_guide_link"
  | "duplicate_guide_link";

export interface KompassiLinkFinding {
  code: KompassiLinkFindingCode;
  scheduleItemSlug: string;
}

export interface KompassiScheduleItem extends KompassiScheduleItemWire {
  signupUrl: string | null;
  kompassiUrl: string;
}

export interface KompassiSchedule {
  eventName: string;
  timezone: string;
  scheduleItems: KompassiScheduleItem[];
  findings: KompassiLinkFinding[];
}

export class KompassiStructuralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KompassiStructuralError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") {
    throw new KompassiStructuralError(`${path} is not a string`);
  }
}

function requireLinks(value: unknown, path: string): asserts value is KompassiLink[] {
  if (!Array.isArray(value)) {
    throw new KompassiStructuralError(`${path} is not an array`);
  }
  value.forEach((link, index) => {
    if (!isObject(link) || typeof link.href !== "string") {
      throw new KompassiStructuralError(`${path}[${index}].href is not a string`);
    }
  });
}

function requireDimensions(
  value: unknown,
  path: string,
): asserts value is KompassiCachedDimensions {
  if (!isObject(value)) {
    throw new KompassiStructuralError(`${path} is not an object`);
  }
  for (const [dimension, values] of Object.entries(value)) {
    if (!Array.isArray(values) || !values.every(item => typeof item === "string")) {
      throw new KompassiStructuralError(`${path}.${dimension} is not a string array`);
    }
  }
}

function requireScheduleItem(
  value: unknown,
  index: number,
): asserts value is KompassiScheduleItemWire {
  const path = `data.event.program.scheduleItems[${index}]`;
  if (!isObject(value)) {
    throw new KompassiStructuralError(`${path} is not an object`);
  }

  for (const key of ["slug", "title", "location", "startTime", "endTime"] as const) {
    requireString(value[key], `${path}.${key}`);
  }
  if (typeof value.durationMinutes !== "number" || !Number.isFinite(value.durationMinutes)) {
    throw new KompassiStructuralError(`${path}.durationMinutes is not a finite number`);
  }
  if (typeof value.isCancelled !== "boolean") {
    throw new KompassiStructuralError(`${path}.isCancelled is not a boolean`);
  }
  requireDimensions(value.cachedDimensions, `${path}.cachedDimensions`);
  requireLinks(value.links, `${path}.links`);

  if (!isObject(value.program)) {
    throw new KompassiStructuralError(`${path}.program is not an object`);
  }
  requireString(value.program.slug, `${path}.program.slug`);
  requireString(value.program.color, `${path}.program.color`);
  requireLinks(value.program.links, `${path}.program.links`);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function selectLink(
  links: KompassiLink[],
  type: "signup" | "guide",
  scheduleItemSlug: string,
): { url: string | null; findings: KompassiLinkFinding[] } {
  const validLinks = links.filter(link => isHttpUrl(link.href));
  const findings: KompassiLinkFinding[] = [];
  if (validLinks.length !== links.length) {
    findings.push({ code: `invalid_${type}_link`, scheduleItemSlug });
  }
  if (validLinks.length > 1) {
    findings.push({ code: `duplicate_${type}_link`, scheduleItemSlug });
  }
  return { url: validLinks[0]?.href ?? null, findings };
}

/** Read one open-ended dimension without spreading untyped property access. */
export function dimensionValues(
  item: Pick<KompassiScheduleItemWire, "cachedDimensions">,
  dimension: string,
): readonly string[] {
  return item.cachedDimensions[dimension] ?? [];
}

export function hasDimensionValue(
  item: Pick<KompassiScheduleItemWire, "cachedDimensions">,
  dimension: string,
  value: string,
): boolean {
  return dimensionValues(item, dimension).includes(value);
}

/**
 * Validate GraphQL's success/error envelope and select the two typed link sets.
 * A guide link is mandatory because every published card must have a safe
 * Kompassi details destination.
 */
export function parseKompassiSchedule(payload: unknown): KompassiSchedule {
  if (!isObject(payload)) {
    throw new KompassiStructuralError("response is not an object");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new KompassiStructuralError(
      `GraphQL returned ${payload.errors.length} error(s) for the schedule query`,
    );
  }
  if (!isObject(payload.data) || !isObject(payload.data.event)) {
    throw new KompassiStructuralError("data.event is missing");
  }
  requireString(payload.data.event.name, "data.event.name");
  requireString(payload.data.event.timezone, "data.event.timezone");

  const program = payload.data.event.program;
  if (!isObject(program)) {
    throw new KompassiStructuralError("data.event.program is missing");
  }
  if (program.isSchedulePublic !== true) {
    throw new KompassiStructuralError("data.event.program schedule is not public");
  }
  if (!Array.isArray(program.scheduleItems)) {
    throw new KompassiStructuralError("data.event.program.scheduleItems is not an array");
  }

  const findings: KompassiLinkFinding[] = [];
  const scheduleItems = program.scheduleItems.map((value, index): KompassiScheduleItem => {
    requireScheduleItem(value, index);
    const signup = selectLink(value.links, "signup", value.slug);
    const guide = selectLink(value.program.links, "guide", value.slug);
    findings.push(...signup.findings, ...guide.findings);
    if (guide.url === null) {
      throw new KompassiStructuralError(
        `schedule item ${value.slug} has no valid GUIDE_V2_LIGHT link`,
      );
    }
    return { ...value, signupUrl: signup.url, kompassiUrl: guide.url };
  });

  return {
    eventName: payload.data.event.name,
    timezone: payload.data.event.timezone,
    scheduleItems,
    findings,
  };
}
