import {
  classifyVenue,
  resolveConMapLink,
  type ProgramItemV2,
} from "@ropecon/program-core";
import { languageLabel } from "../classify/language.ts";

const PHYSICAL_FALLBACK_LABEL = "Signup at the info desk";
const PHYSICAL_FALLBACK_DETAIL =
  "Sign up on site — ask at the program information desk.";

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

function signupLabel(item: ProgramItemV2): string {
  switch (item.signupProvider) {
    case "none":
      return "No signup needed";
    case "konsti":
      return item.signupStrategy === "lottery" ? "Konsti lottery" : "Konsti signup";
    case "physical":
      return item.physicalSignupLocation?.labelEn ?? PHYSICAL_FALLBACK_LABEL;
    case "other":
      return item.requiresSignup === true ? "Signup required" : "Signup information unavailable";
  }
}

function isKonstiUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).hostname === "ropekonsti.fi";
  } catch {
    return false;
  }
}

function signupDetail(item: ProgramItemV2): string {
  switch (item.signupProvider) {
    case "none":
      return "Just walk in — no signup required.";
    case "konsti":
      if (!item.signupUrl) {
        return "Live signup information is unavailable. Check the program details in Kompassi.";
      }
      if (item.signupStrategy === "lottery") {
        return "Lottery: a signup enters you in a draw — it does not confirm a seat.";
      }
      if (item.signupStrategy === "direct") {
        return "Direct signup: seats are given first come, first served.";
      }
      return "Signup is handled in Konsti; live seat information may be unavailable.";
    case "physical":
      return item.physicalSignupLocation?.instructionsEn ?? PHYSICAL_FALLBACK_DETAIL;
    case "other":
      return "Check the program details in Kompassi for signup instructions.";
  }
}

function capacityLabel(item: ProgramItemV2): string | null {
  switch (item.capacityStatus) {
    case "not-applicable":
      return null;
    case "available":
      if (item.availabilitySource !== "konsti") return "Live seat count unavailable";
      return item.remainingSeats != null
        ? `${item.remainingSeats} of ${item.maxAttendance} seats left`
        : "Seats available";
    case "full":
      return item.availabilitySource === "konsti"
        ? "No seats left"
        : "Live seat count unavailable";
    case "unknown":
      return "Live seat count unavailable";
  }
}

function renderContentWarning(item: ProgramItemV2): string {
  const warning = item.contentWarnings.trim();
  if (!warning) return "";
  return `<details class="content-warning">
    <summary>
      <span class="cw-icon" aria-hidden="true">⚠</span>
      <span class="cw-label">Content warning</span>
      <span class="cw-hint" aria-hidden="true"></span>
    </summary>
    <p class="cw-text">${escapeHtml(warning)}</p>
  </details>`;
}

function renderLocation(location: string | null | undefined): string {
  if (!location) return "—";
  const mapUrl = resolveConMapLink(location, "en");
  if (mapUrl) {
    return `<a href="${escapeHtml(mapUrl)}" rel="noopener">${escapeHtml(location)}</a>`;
  }
  const offSite = classifyVenue(location).status === "off-site";
  return `${escapeHtml(location)}${offSite ? ' <span class="off-site-note">off-site</span>' : ""}`;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});
const dayTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Shared program-card renderer for the chronological and game-system views.
 * All source text is escaped here so new views cannot accidentally diverge.
 */
export function renderProgramItem(
  item: ProgramItemV2,
  options: { includeDay?: boolean } = {},
): string {
  const capacity = capacityLabel(item);
  const languages =
    item.languages.length > 0
      ? item.languages.map(languageLabel).join(", ")
      : languageLabel("");
  const gameSystem = item.gameSystem.trim()
    ? `<div><dt>System</dt><dd>${escapeHtml(item.gameSystem)}</dd></div>`
    : "";
  const signupLink =
    item.signupProvider !== "none" && item.signupUrl && !item.isCancelled
      ? isKonstiUrl(item.signupUrl) && item.signupProvider === "konsti"
        ? ` <a class="signup-link konsti-link" href="${escapeHtml(item.signupUrl)}" rel="noopener">Sign up in Konsti ↗</a>`
        : ` <a class="signup-link" href="${escapeHtml(item.signupUrl)}" rel="noopener">Open signup information ↗</a>`
      : "";
  const kompassiLink =
    `<p class="kompassi-page"><a class="kompassi-page-link" href="${escapeHtml(item.kompassiUrl)}" rel="noopener">View in Kompassi ↗</a></p>`;
  const location = renderLocation(item.location);
  const timeRange = options.includeDay
    ? `${dayTimeFormat.format(new Date(item.start))}–${timeFormat.format(new Date(item.end))}`
    : `${timeFormat.format(new Date(item.start))}–${timeFormat.format(new Date(item.end))}`;

  return `<li class="session ${item.isCancelled ? "cancelled" : ""}"
    data-start="${escapeHtml(item.start)}"
    data-end="${escapeHtml(item.end)}"
    data-cancelled="${String(item.isCancelled)}"
    data-revolving="${String(item.isRevolvingDoor)}"
    data-signup-provider="${escapeHtml(item.signupProvider)}"
    data-availability-source="${item.availabilitySource ?? ""}"
    data-capacity="${escapeHtml(item.capacityStatus)}"
    data-languages="${escapeHtml(JSON.stringify(item.languages))}">
    <div class="session-head">
      <span class="time">${timeRange}</span>
      <h3 class="title">${escapeHtml(item.title)}</h3>
      ${item.isCancelled ? '<span class="badge cancelled-badge">Cancelled</span>' : ""}
      ${
        !item.isCancelled &&
        item.availabilitySource === "konsti" &&
        item.capacityStatus === "full"
          ? '<span class="badge full-badge">Full</span>'
          : ""
      }
    </div>
    ${
      !item.isCancelled && item.isRevolvingDoor
        ? '<p class="revolving-note">You can join mid-session.</p>'
        : ""
    }
    ${item.shortDescription ? `<p class="short">${escapeHtml(item.shortDescription)}</p>` : ""}
    ${renderContentWarning(item)}
    <dl class="facts">
      ${gameSystem}
      <div><dt>Language</dt><dd>${escapeHtml(languages)}</dd></div>
      <div><dt>Location</dt><dd>${location}</dd></div>
      <div>
        <dt>Signup</dt>
        <dd>
          <span class="signup-label">${escapeHtml(signupLabel(item))}</span>${signupLink}
          <span class="signup-detail">${escapeHtml(signupDetail(item))}</span>
        </dd>
      </div>
      ${capacity ? `<div><dt>Capacity</dt><dd>${escapeHtml(capacity)}</dd></div>` : ""}
    </dl>
    ${kompassiLink}
  </li>`;
}
