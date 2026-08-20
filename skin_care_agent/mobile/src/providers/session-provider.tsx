import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { ApiError, apiRequest } from '@/lib/api';
import {
  AuthResponse,
  ConsentStatus,
  REQUIRED_CONSENT_TYPES,
  User,
  hasAllRequiredConsents,
} from '@/lib/auth-types';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from '@/lib/token-storage';

type SessionPhase = 'loading' | 'anonymous' | 'authenticated';

type Credentials = {
  email: string;
  password: string;
};

type Registration = Credentials & {
  nickname?: string;
};

type SessionContextValue = {
  phase: SessionPhase;
  user: User | null;
  consents: ConsentStatus[];
  hasRequiredConsents: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  register: (registration: Registration) => Promise<void>;
  signOut: () => Promise<void>;
  refreshConsents: () => Promise<ConsentStatus[]>;
  acceptRequiredConsents: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function deviceContext() {
  return {
    device_name: Device.modelName ?? Platform.OS + ' device',
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [consents, setConsents] = useState<ConsentStatus[]>([]);
  const authRef = useRef<AuthResponse | null>(null);
  const refreshInFlight = useRef<Promise<AuthResponse> | null>(null);

  const commitAuth = useCallback(async (nextAuth: AuthResponse) => {
    await saveRefreshToken(nextAuth.tokens.refresh_token);
    authRef.current = nextAuth;
    setAuth(nextAuth);
    setPhase('authenticated');
  }, []);

  const resetSession = useCallback(async () => {
    authRef.current = null;
    refreshInFlight.current = null;
    setAuth(null);
    setConsents([]);
    setPhase('anonymous');
    await clearRefreshToken();
  }, []);

  const rotateTokens = useCallback(async (): Promise<AuthResponse> => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const rotation = (async () => {
      const refreshToken =
        authRef.current?.tokens.refresh_token ?? (await loadRefreshToken());
      if (!refreshToken) {
        throw new ApiError(401, '登录已经过期。');
      }
      const nextAuth = await apiRequest<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      await commitAuth(nextAuth);
      return nextAuth;
    })();
    refreshInFlight.current = rotation;
    try {
      return await rotation;
    } finally {
      if (refreshInFlight.current === rotation) {
        refreshInFlight.current = null;
      }
    }
  }, [commitAuth]);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const currentAuth = authRef.current;
      if (!currentAuth) {
        throw new ApiError(401, '请先登录。');
      }
      try {
        return await apiRequest<T>(path, init, currentAuth.tokens.access_token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
      }

      let nextAuth: AuthResponse;
      try {
        nextAuth = await rotateTokens();
      } catch {
        await resetSession();
        throw new ApiError(401, '登录已经过期，请重新登录。');
      }

      try {
        return await apiRequest<T>(path, init, nextAuth.tokens.access_token);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await resetSession();
        }
        throw error;
      }
    },
    [resetSession, rotateTokens],
  );

  const refreshConsents = useCallback(async () => {
    const nextConsents = await request<ConsentStatus[]>('/me/consents');
    setConsents(nextConsents);
    return nextConsents;
  }, [request]);

  const establishSession = useCallback(
    async (nextAuth: AuthResponse) => {
      await commitAuth(nextAuth);
      const nextConsents = await apiRequest<ConsentStatus[]>(
        '/me/consents',
        {},
        nextAuth.tokens.access_token,
      );
      setConsents(nextConsents);
    },
    [commitAuth],
  );

  const signIn = useCallback(
    async ({ email, password }: Credentials) => {
      const nextAuth = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...deviceContext(),
        }),
      });
      await establishSession(nextAuth);
    },
    [establishSession],
  );

  const register = useCallback(
    async ({ email, password, nickname }: Registration) => {
      const nextAuth = await apiRequest<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          nickname: nickname?.trim() || null,
          ...deviceContext(),
        }),
      });
      await establishSession(nextAuth);
    },
    [establishSession],
  );

  const signOut = useCallback(async () => {
    const accessToken = authRef.current?.tokens.access_token;
    try {
      if (accessToken) {
        await apiRequest<void>('/auth/logout', { method: 'POST' }, accessToken);
      }
    } finally {
      await resetSession();
    }
  }, [resetSession]);

  const acceptRequiredConsents = useCallback(async () => {
    let currentConsents = consents;
    if (currentConsents.length === 0) {
      currentConsents = await refreshConsents();
    }
    const decisions = REQUIRED_CONSENT_TYPES.map((consentType) => {
      const status = currentConsents.find((item) => item.consent_type === consentType);
      if (!status) {
        throw new ApiError(422, '服务器没有返回完整的协议版本。');
      }
      return {
        consent_type: consentType,
        version: status.version,
        accepted: true,
      };
    });
    const updated = await request<ConsentStatus[]>('/me/consents', {
      method: 'PUT',
      body: JSON.stringify({
        consents: decisions,
        app_version: Constants.expoConfig?.version ?? 'dev',
      }),
    });
    setConsents(updated);
  }, [consents, refreshConsents, request]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const refreshToken = await loadRefreshToken();
        if (!refreshToken) {
          if (active) {
            setPhase('anonymous');
          }
          return;
        }
        const nextAuth = await apiRequest<AuthResponse>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        await saveRefreshToken(nextAuth.tokens.refresh_token);
        const nextConsents = await apiRequest<ConsentStatus[]>(
          '/me/consents',
          {},
          nextAuth.tokens.access_token,
        );
        if (active) {
          authRef.current = nextAuth;
          setAuth(nextAuth);
          setConsents(nextConsents);
          setPhase('authenticated');
        }
      } catch {
        await clearRefreshToken();
        if (active) {
          authRef.current = null;
          setAuth(null);
          setConsents([]);
          setPhase('anonymous');
        }
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      phase,
      user: auth?.user ?? null,
      consents,
      hasRequiredConsents: hasAllRequiredConsents(consents),
      signIn,
      register,
      signOut,
      refreshConsents,
      acceptRequiredConsents,
      request,
    }),
    [
      acceptRequiredConsents,
      auth?.user,
      consents,
      phase,
      refreshConsents,
      register,
      request,
      signIn,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
