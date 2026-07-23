export const KOMPASSI_GRAPHQL_URL = "https://kompassi.eu/graphql";

/**
 * Public schedule query documented in docs/kompassi-api.md.
 *
 * Keep the event slug and locale as variables so the integration can be reused
 * for the next convention without changing the query.
 */
export const KOMPASSI_SCHEDULE_QUERY = /* GraphQL */ `
  query GamingFinder($eventSlug: String!, $locale: String) {
    event(slug: $eventSlug) {
      name
      timezone
      program {
        isSchedulePublic
        scheduleItems {
          slug
          title
          location(lang: $locale)
          startTime
          endTime
          durationMinutes
          isCancelled
          cachedDimensions
          links(types: [SIGNUP]) {
            href
          }
          program {
            slug
            color
            links(types: [GUIDE_V2_LIGHT]) {
              href
            }
          }
        }
      }
    }
  }
`;
