import {
  classifyVenue,
  resolveConMapLink,
  type ProgramItem,
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

function signupLabel(item: ProgramItem): string {
  switch (item.signupMode) {
    case "none":
      return "No signup needed";
    case "konsti":
      return item.signupStrategy === "lottery" ? "Konsti lottery" : "Konsti signup";
    case "physical":
      return item.physicalSignupLocation?.labelEn ?? PHYSICAL_FALLBACK_LABEL;
  }
}

function signupDetail(item: ProgramItem): string {
  switch (item.signupMode) {
    case "none":
      return "Just walk in — no signup required.";
    case "konsti":
      return item.signupStrategy === "lottery"
        ? "Lottery: a signup enters you in a draw — it does not confirm a seat."
        : "Direct signup: seats are given first come, first served.";
    case "physical":
      return item.physicalSignupLocation?.instructionsEn ?? PHYSICAL_FALLBACK_DETAIL;
  }
}

function capacityLabel(item: ProgramItem): string | null {
  switch (item.capacityStatus) {
    case "not-applicable":
      return null;
    case "available":
      return item.remainingSeats != null
        ? `${item.remainingSeats} of ${item.maxAttendance} seats left`
        : "Seats available";
    case "full":
      return "No seats left";
    case "unknown":
      return "Live seat count unavailable";
  }
}

function renderContentWarning(item: ProgramItem): string {
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
  item: ProgramItem,
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
  const konstiLink =
    item.signupMode === "konsti" && item.signupUrl && !item.isCancelled
      ? ` <a class="konsti-link" href="${escapeHtml(item.signupUrl)}" rel="noopener">Sign up in Konsti ↗</a>`
      : "";
  const konstiPageLink = konstiLink
    ? ""
    : `<p class="konsti-page"><a class="konsti-page-link" href="${escapeHtml(item.konstiPageUrl)}" rel="noopener">View full details on Konsti ↗</a></p>`;
  const location = renderLocation(item.location);
  const timeRange = options.includeDay
    ? `${dayTimeFormat.format(new Date(item.start))}–${timeFormat.format(new Date(item.end))}`
    : `${timeFormat.format(new Date(item.start))}–${timeFormat.format(new Date(item.end))}`;

  return `<li class="session ${item.isCancelled ? "cancelled" : ""}"
    data-start="${escapeHtml(item.start)}"
    data-end="${escapeHtml(item.end)}"
    data-cancelled="${String(item.isCancelled)}"
    data-revolving="${String(item.isRevolvingDoor)}"
    data-signup-mode="${escapeHtml(item.signupMode)}"
    data-capacity="${escapeHtml(item.capacityStatus)}"
    data-languages="${escapeHtml(JSON.stringify(item.languages))}">
    <div class="session-head">
      <span class="time">${timeRange}</span>
      <h3 class="title">${escapeHtml(item.title)}</h3>
      ${item.isCancelled ? '<span class="badge cancelled-badge">Cancelled</span>' : ""}
      ${
        !item.isCancelled &&
        item.signupMode === "konsti" &&
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
          <span class="signup-label">${escapeHtml(signupLabel(item))}</span>${konstiLink}
          <span class="signup-detail">${escapeHtml(signupDetail(item))}</span>
        </dd>
      </div>
      ${capacity ? `<div><dt>Capacity</dt><dd>${escapeHtml(capacity)}</dd></div>` : ""}
    </dl>
    ${konstiPageLink}
  </li>`;
}
