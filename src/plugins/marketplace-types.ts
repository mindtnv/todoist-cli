export interface MarketplaceManifest {
  name: string;
  description?: string;
  version?: string;
  plugins: MarketplacePluginEntry[];
}

export interface MarketplacePluginEntry {
  name: string;
  source: string | MarketplaceExternalSource;
  version?: string;
  description?: string;
}

export interface MarketplaceExternalSource {
  type: "github" | "git" | "npm";
  repo?: string;   // for github: "user/repo"
  url?: string;     // for git
  package?: string; // for npm
  ref?: string;     // branch or tag
  sha?: string;     // pin to exact commit
}

export interface MarketplaceConfig {
  name: string;
  source: string;  // "github:user/repo" or URL or local path
  autoUpdate: boolean;
}

export interface DiscoveredPlugin extends MarketplacePluginEntry {
  marketplace: string;  // marketplace name
  installed: boolean;
  enabled: boolean;
}

export interface InstallResult {
  name: string;
  version: string;
  marketplace: string;
  description?: string;
}

export interface UpdateResult {
  name: string;
  updated: boolean;
  oldVersion?: string;
  newVersion?: string;
  message: string;
}
