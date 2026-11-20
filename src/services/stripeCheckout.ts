export const EUROPE_UNLOCK_STORAGE_KEY = 'obscura_europe_unlock_v1';

interface EuropeUnlockState {
  purchased: boolean;
  email?: string;
  unlockedAt?: string;
  devOverride?: boolean;
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readUnlockState(): EuropeUnlockState {
  if (!hasStorage()) return { purchased: false };
  try {
    const raw = window.localStorage.getItem(EUROPE_UNLOCK_STORAGE_KEY);
    if (!raw) return { purchased: false };
    const parsed = JSON.parse(raw) as Partial<EuropeUnlockState>;
    return {
      purchased: Boolean(parsed.purchased),
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      unlockedAt: typeof parsed.unlockedAt === 'string' ? parsed.unlockedAt : undefined,
      devOverride: Boolean(parsed.devOverride),
    };
  } catch {
    return { purchased: false };
  }
}

function writeUnlockState(state: EuropeUnlockState): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(EUROPE_UNLOCK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function isDevMode(): boolean {
  return Boolean(import.meta.env?.DEV);
}

export function isEuropeUnlocked(): boolean {
  const state = readUnlockState();
  if (state.purchased) return true;
  if (isDevMode() && state.devOverride) return true;
  return false;
}

export function getSavedPurchaseEmail(): string | undefined {
  return readUnlockState().email;
}

export function setDevEuropeUnlocked(unlocked: boolean): void {
  if (!isDevMode()) return;
  const current = readUnlockState();
  writeUnlockState({
    ...current,
    devOverride: unlocked,
  });
}

export function saveVerifiedPurchase(email?: string | null): void {
  const current = readUnlockState();
  writeUnlockState({
    ...current,
    purchased: true,
    email: email || current.email,
    unlockedAt: new Date().toISOString(),
  });
}

// The web version has no payment server, so ticket sales are switched off here.
export async function fetchStripeConfig(): Promise<{
  configured: boolean;
  publishableKey: string | null;
  priceDisplay: string;
}> {
  return { configured: false, publishableKey: null, priceDisplay: '£1.99' };
}

export async function startEuropeCheckout(
  _email?: string,
): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: "Europe tickets aren't on sale in the web version yet." };
}

export async function verifyEuropeCheckoutSession(
  _sessionId: string,
): Promise<{ unlocked: boolean; email?: string | null; error?: string }> {
  return { unlocked: false, error: "Europe tickets aren't on sale in the web version yet." };
}

export async function restoreEuropePurchase(
  email: string,
): Promise<{ unlocked: boolean; message: string }> {
  const normalized = email.trim().toLowerCase();
  const local = readUnlockState();
  if (local.purchased && local.email?.toLowerCase() === normalized) {
    return { unlocked: true, message: 'Purchase already verified on this device.' };
  }
  return { unlocked: false, message: "Europe tickets aren't on sale in the web version yet." };
}
