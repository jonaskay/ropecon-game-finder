/**
 * Signup model config (primer §3 "Signup model").
 *
 * Raw `signupType` normalises to three modes:
 *   notRequired -> "none", konsti -> "konsti", anything else -> "physical".
 * A "physical" signupType must map to a configured location here. An unmapped one is
 * a `warn` (see audit/checks) and degrades to generic "see the info desk" copy — it
 * never halts publication.
 *
 * MAINTENANCE: Values are filled from `bun run audit:report`. A warning from the live
 * check means: add the location entry here, then add a fixture example, then the PR
 * `check` goes green.
 *
 * Filled from the live report on 2026-07-21: two physical signupTypes were observed —
 * `ropelarp` (10) and `other` (1). The entries below are PLACEHOLDERS with best-guess
 * labels; the real desk names, instructions, and map URLs still need to be confirmed
 * (see the TODOs) before the convention.
 */

export type SignupMode = "none" | "konsti" | "physical";

export interface PhysicalSignupLocation {
  id: string;
  labelFi: string;
  labelEn: string;
  instructionsFi?: string;
  instructionsEn?: string;
  mapUrlFi?: string;
  mapUrlEn?: string;
}

/** signupTypes that are NOT physical. Everything else routes to PHYSICAL_SIGNUP_TYPES. */
export const NON_PHYSICAL_SIGNUP_TYPES: readonly string[] = ["notRequired", "konsti"];

export const PHYSICAL_SIGNUP_TYPES: Record<string, PhysicalSignupLocation> = {
  // TODO(product): confirm the real larp signup desk name, instructions, and map URL.
  ropelarp: {
    id: "ropelarp",
    labelFi: "Larp-ilmoittautuminen",
    labelEn: "Larp signup desk",
    instructionsFi: "Ilmoittaudu larppien ilmoittautumispisteellä.",
    instructionsEn: "Sign up at the larp signup desk.",
  },
  // TODO(product): 'other' is a single item — confirm what/where this signup actually is.
  other: {
    id: "other",
    labelFi: "Ilmoittautuminen paikan päällä",
    labelEn: "On-site signup",
    instructionsFi: "Ilmoittaudu paikan päällä; katso ohjelman kuvaus.",
    instructionsEn: "Sign up on site; see the program description.",
  },
};

export function signupMode(signupType: string): SignupMode {
  if (signupType === "notRequired") return "none";
  if (signupType === "konsti") return "konsti";
  return "physical";
}

/** True when a physical signupType has no configured location (fallback territory). */
export function isUnmappedPhysicalSignupType(signupType: string): boolean {
  return (
    signupMode(signupType) === "physical" &&
    !Object.prototype.hasOwnProperty.call(PHYSICAL_SIGNUP_TYPES, signupType)
  );
}
