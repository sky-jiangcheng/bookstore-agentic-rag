import type { UserInfo } from '@/lib/types/rag';
import config from '@/lib/config/environment';

/**
 * Validate an authentication token against an external auth service when configured.
 */
export async function validateToken(token: string): Promise<{ valid: boolean; user?: UserInfo }> {
  if (!token || token.trim() === '') {
    return { valid: false };
  }

  if (!config.services.authUrl) {
    return { valid: false };
  }

  try {
    const response = await fetch(`${config.services.authUrl}/api/rag/auth/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { valid: false };
    }

    return response.json() as Promise<{ valid: boolean; user?: UserInfo }>;
  } catch {
    return { valid: false };
  }
}

/**
 * Get user preferences from the external auth/profile service when configured.
 */
export async function getUserPreferences(userId: string): Promise<UserInfo['preferences']> {
  if (!config.services.authUrl || !userId) {
    return {};
  }

  try {
    const response = await fetch(`${config.services.authUrl}/api/rag/users/${userId}/preferences`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return {};
    }

    return response.json() as Promise<UserInfo['preferences']>;
  } catch {
    return {};
  }
}
