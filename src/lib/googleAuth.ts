export interface GoogleProfile {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: GoogleIdConfig): void;
          prompt(): void;
        };
      };
    };
  }
}

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid Google credential payload.');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized);
  return JSON.parse(decoded) as Record<string, unknown>;
}

let scriptPromise: Promise<void> | null = null;
let clientIdPromise: Promise<string> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity script.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function resolveGoogleClientId(): Promise<string> {
  if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  }

  if (!clientIdPromise) {
    clientIdPromise = fetch('/api/auth/google-config', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load Google Sign-In settings from server.');
        return res.json() as Promise<{ clientId?: string }>;
      })
      .then((json) => json.clientId?.trim() ?? '');
  }

  return clientIdPromise;
}

export async function isGoogleSignInConfigured(): Promise<boolean> {
  const clientId = await resolveGoogleClientId();
  return Boolean(clientId);
}

export async function signInWithGoogle(): Promise<GoogleProfile> {
  const clientId = await resolveGoogleClientId();
  if (!clientId) {
    throw new Error('Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID (or NEXT_PUBLIC_GOOGLE_CLIENT_ID) in your environment and restart the app.');
  }

  await loadGoogleScript();

  return new Promise<GoogleProfile>((resolve, reject) => {
    if (!window.google?.accounts?.id) {
      reject(new Error('Google Identity is unavailable.'));
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        try {
          if (!response.credential) {
            reject(new Error('Google sign-in was cancelled.'));
            return;
          }
          const payload = decodeJwt(response.credential);
          const email = String(payload.email ?? '').trim().toLowerCase();
          const fullName = String(payload.name ?? '').trim();
          const givenName = String(payload.given_name ?? '').trim();
          const familyName = String(payload.family_name ?? '').trim();
          if (!email || !fullName) {
            reject(new Error('Google account did not provide required profile details.'));
            return;
          }

          resolve({
            id: String(payload.sub ?? email),
            email,
            fullName,
            firstName: givenName || fullName.split(' ')[0] || 'Google',
            lastName: familyName || fullName.split(' ').slice(1).join(' ') || 'User',
            picture: typeof payload.picture === 'string' ? payload.picture : undefined,
          });
        } catch {
          reject(new Error('Failed to parse Google account details.'));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.prompt();
  });
}
