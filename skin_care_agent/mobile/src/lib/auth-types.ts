export const REQUIRED_CONSENT_TYPES = [
  'terms',
  'privacy',
  'health_disclaimer',
  'ai_processing',
] as const;

export type ConsentType = (typeof REQUIRED_CONSENT_TYPES)[number];

export type User = {
  user_id: number;
  email: string | null;
  nickname: string | null;
  created_at: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_expires_in: number;
};

export type AuthResponse = {
  user: User;
  tokens: AuthTokens;
};

export type ConsentStatus = {
  consent_type: ConsentType;
  version: string;
  accepted: boolean;
  accepted_at: string | null;
};

export function hasAllRequiredConsents(consents: ConsentStatus[]): boolean {
  return REQUIRED_CONSENT_TYPES.every((consentType) =>
    consents.some((consent) => consent.consent_type === consentType && consent.accepted),
  );
}
