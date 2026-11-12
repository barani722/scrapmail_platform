/** Discovery options shown when starting a "Find new agencies" job. */

export type DiscoverySource = "osm" | "links" | "search";

export const DISCOVERY_SOURCES: {
  value: DiscoverySource;
  label: string;
  description: string;
  free: boolean;
}[] = [
  {
    value: "osm",
    label: "OpenStreetMap",
    description:
      "Travel agencies, tour operators, ticket offices and concierges mapped in OpenStreetMap (with a website or an email). Free.",
    free: true,
  },
  {
    value: "links",
    label: "Links on known agency websites",
    description:
      "Partner and member links found on your agencies' websites. Only relevant websites are added. Free.",
    free: true,
  },
  {
    value: "search",
    label: "Web search (Brave)",
    description:
      "Targeted searches per country. Uses the monthly free Brave credit; results are cached for 30 days.",
    free: false,
  },
];

/** Search phrases for web-search discovery (Brave localizes results per country). */
export const SEARCH_PHRASES = [
  "sports ticket agency",
  "sports travel agency",
  "football tickets hospitality packages",
  "Formula 1 hospitality packages",
  "VIP hospitality sports events",
  "concert tickets travel packages",
  "tennis tickets travel packages",
  "corporate hospitality agency",
  "luxury concierge event tickets",
  "event travel packages agency",
  "concierge service live event tickets",
  "tour operator concert and sports tickets",
  "theatre and comedy show tickets agency",
  "tourism agency event tickets",
] as const;

/** The client's main markets (from the existing agency data). */
export const MAIN_MARKETS = [
  "GB",
  "AE",
  "US",
  "FR",
  "ES",
  "IT",
  "DE",
  "NL",
  "CH",
  "PT",
];
