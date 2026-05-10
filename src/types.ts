export type ResponseFormat = "markdown" | "json";
export type PrivacyMode = "summary" | "structured" | "raw";

export interface GoogleHealthTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface GoogleHealthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  tokenPath: string;
  privacyMode: PrivacyMode;
  cacheEnabled: boolean;
  cachePath: string;
  apiBaseUrl: string;
}

export interface GoogleHealthCollection<T = unknown> {
  records?: T[];
  next_page?: number;
}

export interface ToolResponse<T> extends Record<string, unknown> {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: T;
  isError?: boolean;
}
