/**
 * Client API TypeScript pour le backend PHP / MySQL de YouAndMe
 * Gère automatiquement les en-têtes CORS, les jetons Bearer et les cookies de session.
 */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_PHP_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

const TOKEN_STORAGE_KEY = 'yam_php_token';

class PhpApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    }
  }

  public setToken(token: string | null, remember = true) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        if (remember) {
          localStorage.setItem(TOKEN_STORAGE_KEY, token);
        } else {
          sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        }
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    }
    return this.token;
  }

  /**
   * Méthode générique d'appel HTTP vers le backend PHP
   */
  private async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    // Dans le navigateur (PC comme Mobile Wi-Fi), passer par /api permet à Next.js de relayer
    // de manière transparente sans conflit d'adresse IP locale (localhost vs LAN)
    const baseUrl = typeof window !== 'undefined' ? '/api' : API_BASE_URL;
    const url = `${baseUrl}/${cleanEndpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Indispensable pour transmettre les cookies cross-origin depuis Vercel
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      const errorMsg = data?.error || data?.message || `Erreur serveur (${response.status})`;
      const error = new Error(errorMsg) as Error & { status: number; data?: unknown };
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data as T;
  }

  // ============================================================================
  // 1. Authentification & Sessions
  // ============================================================================
  public auth = {
    verifyEmail: async (email: string) => {
      return this.request<{ valid: boolean; cleanEmail: string; isAdmin: boolean; error?: string }>(
        'verify-email',
        { method: 'POST', body: JSON.stringify({ email }) }
      );
    },

    sendOtp: async (email: string) => {
      return this.request<{ success: boolean; cleanEmail: string; message: string; devCode?: string }>(
        'auth/otp',
        { method: 'POST', body: JSON.stringify({ action: 'send', email }) }
      );
    },

    verifyOtp: async (email: string, code: string) => {
      const data = await this.request<{
        success: boolean;
        cleanEmail: string;
        token: string;
        userId: string;
        isAdmin: boolean;
      }>('auth/otp', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', email, code }),
      });

      if (data.token) {
        this.setToken(data.token, true);
      }
      return data;
    },

    sendMagicLink: async (email: string, handoffId: string) => {
      return this.request<{ success: boolean; message: string; devLink?: string }>(
        'auth/magic-link',
        { method: 'POST', body: JSON.stringify({ email, handoffId }) }
      );
    },

    getMagicLinkHandoff: async (handoffId: string) => {
      return this.request<{ ready: boolean; credential?: unknown; error?: string }>(
        `auth/magic-link/handoff?id=${encodeURIComponent(handoffId)}`,
        { method: 'GET' }
      );
    },

    confirmMagicLinkHandoff: async (handoffId: string, credential: unknown) => {
      return this.request<{ success: boolean }>(
        'auth/magic-link/handoff',
        { method: 'POST', body: JSON.stringify({ handoffId, credential }) }
      );
    },

    getSession: async () => {
      return this.request<{ email: string; userId: string; token: string }>('auth/session', {
        method: 'POST',
      });
    },

    logout: async () => {
      try {
        await this.request('auth/logout', { method: 'POST' });
      } finally {
        this.setToken(null);
      }
    },
  };

  // ============================================================================
  // 2. Carnet de Contacts
  // ============================================================================
  public contacts = {
    list: async () => {
      return this.request<{ contacts: Array<{ id: string; contact_email: string; created_at: string }>; userEmail: string }>(
        'contacts',
        { method: 'GET' }
      );
    },

    add: async (contactEmail: string) => {
      return this.request<{ contact: { id: string; contact_email: string; created_at: string } }>(
        'contacts',
        { method: 'POST', body: JSON.stringify({ contactEmail }) }
      );
    },

    remove: async (contactId: string) => {
      return this.request<{ success: boolean }>(
        'contacts',
        { method: 'DELETE', body: JSON.stringify({ contactId }) }
      );
    },
  };

  // ============================================================================
  // 3. Quotas & Licences
  // ============================================================================
  public usage = {
    get: async () => {
      return this.request<{
        usage: {
          email: string;
          usageCount: number;
          remainingUsages: number;
          hasLicense: boolean;
          licenseKey: string | null;
          licenseTier: string;
          licenseStatus: string;
          quotaUnlimited: boolean;
          isLocked: boolean;
          advertisingEnabled: boolean;
        };
      }>('usage', { method: 'GET' });
    },

    consume: async () => {
      return this.request<{ usage: unknown; allowed: boolean; error?: string }>(
        'usage',
        { method: 'POST', body: JSON.stringify({ action: 'consume' }) }
      );
    },

    activateLicense: async (key: string) => {
      return this.request<{ success: boolean; message: string }>(
        'usage',
        { method: 'POST', body: JSON.stringify({ action: 'activate-license', key }) }
      );
    },
  };

  // ============================================================================
  // 4. Signalement WebRTC (100% PHP / Mutualisé)
  // ============================================================================
  public webrtc = {
    getTurnCredentials: async () => {
      return this.request<{ iceServers: RTCIceServer[] }>(
        'webrtc/turn-credentials',
        { method: 'GET' }
      );
    },

    sendSignal: async (targetEmail: string, signal: unknown) => {
      return this.request<{ success: boolean }>(
        'webrtc/signal',
        { method: 'POST', body: JSON.stringify({ targetEmail, signal }) }
      );
    },

    pollSignals: async () => {
      return this.request<{
        signals: Array<{ type: string; [key: string]: unknown }>;
        online_users?: string[];
        timestamp: number;
      }>(
        'webrtc/poll',
        { method: 'GET' }
      );
    },

    getPresence: async () => {
      return this.request<{
        online_users: string[];
        timestamp: number;
      }>(
        'webrtc/presence',
        { method: 'GET' }
      );
    },
  };

  // ============================================================================
  // 5. Bannières Publicitaires
  // ============================================================================
  public banners = {
    getPublic: async () => {
      return this.request<{ banners: Array<{ id: string; title: string; image_url: string; target_url: string | null; display_order: number }> }>(
        'banners',
        { method: 'GET' }
      );
    },

    getAdmin: async () => {
      return this.request<{ banners: unknown[] }>('admin/banners', { method: 'GET' });
    },

    create: async (bannerData: Record<string, unknown>) => {
      return this.request<{ success: boolean; id: string }>('admin/banners', {
        method: 'POST',
        body: JSON.stringify(bannerData),
      });
    },

    update: async (bannerData: Record<string, unknown>) => {
      return this.request<{ success: boolean }>('admin/banners', {
        method: 'PUT',
        body: JSON.stringify(bannerData),
      });
    },

    delete: async (id: string) => {
      return this.request<{ success: boolean }>('admin/banners', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
  };

  // ============================================================================
  // 6. Journal des Connexions
  // ============================================================================
  public logs = {
    record: async (callee: string, status = 'connected') => {
      return this.request<{ success: boolean; deduped?: boolean }>(
        'log-connection',
        { method: 'POST', body: JSON.stringify({ callee, status }) }
      );
    },

    getAdmin: async (limit = 100) => {
      return this.request<{ logs: unknown[] }>(`admin/logs?limit=${limit}`, { method: 'GET' });
    },

    purgeAdmin: async (days = 30) => {
      return this.request<{ success: boolean; message: string }>(`admin/logs?days=${days}`, {
        method: 'DELETE',
      });
    },
  };

  // ============================================================================
  // 7. Paiements Stripe
  // ============================================================================
  public stripe = {
    createCheckout: async (params: { priceId?: string; supportAmount?: number }) => {
      return this.request<{ sessionId: string; url: string }>('checkout', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  };

  // ============================================================================
  // 8. Fichiers Partagés en Session
  // ============================================================================
  public files = {
    upload: async (targetEmail: string, file: File) => {
      const formData = new FormData();
      formData.append('targetEmail', targetEmail);
      formData.append('file', file);

      return this.request<{ success: boolean; fileName: string; fileSize: number; downloadUrl: string }>(
        'collaboration/files',
        { method: 'POST', body: formData }
      );
    },
  };
}

export const phpApi = new PhpApiClient();
export default phpApi;
