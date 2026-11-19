export interface UserAgentSummary {
  browser?: string;
  os?: string;
}

// Order matters: Edge, Opera and Samsung Internet also say "Chrome", and
// Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

// Android also says "Linux", and iOS also says "Mac OS X".
const SYSTEMS: [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

function firstMatch(text: string, table: [RegExp, string][]): string | undefined {
  return table.find(([pattern]) => pattern.test(text))?.[1];
}

/**
 * The browser and operating system a user-agent string names, as the
 * short product names a reader recognises ("Chrome", "Windows"), or
 * undefined for a part it does not recognise. Enough to tell a reader's
 * own devices apart (active sessions, push registrations); not a full
 * parser.
 */
export function describeUserAgent(userAgent: string | undefined): UserAgentSummary {
  if (!userAgent) return {};
  return { browser: firstMatch(userAgent, BROWSERS), os: firstMatch(userAgent, SYSTEMS) };
}
