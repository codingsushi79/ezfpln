export type SessionData = {
  oauth?: {
    state: string;
    codeVerifier: string;
  };
  navigraph?: {
    refreshToken: string;
    accessToken?: string;
    accessExpiresAt?: number;
  };
  user?: {
    sub?: string;
    name?: string;
    email?: string;
    preferred_username?: string;
  };
  simbrief?: {
    userid?: string;
    username?: string;
  };
};
