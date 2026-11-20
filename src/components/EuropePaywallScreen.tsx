import React, { useEffect, useState } from 'react';
import { Home, KeyRound, Lock, MapPin, Ticket, Wrench } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { EUROPE_BIOMES } from '../games/next-stop/routes';
import {
  fetchStripeConfig,
  getSavedPurchaseEmail,
  isDevMode,
  restoreEuropePurchase,
  setDevEuropeUnlocked,
  startEuropeCheckout,
} from '../services/stripeCheckout';

interface EuropePaywallScreenProps {
  onUnlocked: () => void;
  onBackToHub: () => void;
}

export const EuropePaywallScreen: React.FC<EuropePaywallScreenProps> = ({
  onUnlocked,
  onBackToHub,
}) => {
  const [priceLabel, setPriceLabel] = useState('£1.99');
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [restoreEmail, setRestoreEmail] = useState(
    () => getSavedPurchaseEmail() ?? '',
  );
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchStripeConfig().then((cfg) => {
      setPriceLabel(cfg.priceDisplay || '£1.99');
      setStripeConfigured(cfg.configured);
    });
  }, []);

  const handleBuyTicket = async () => {
    soundEngine.playUiClick();
    setCheckoutError(null);
    setCheckoutBusy(true);
    const res = await startEuropeCheckout(restoreEmail || undefined);
    setCheckoutBusy(false);
    if (!res.ok) {
      setCheckoutError(res.error ?? 'Could not launch Stripe Checkout.');
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playUiClick();
    setRestoreBusy(true);
    setRestoreMessage(null);
    const res = await restoreEuropePurchase(restoreEmail);
    setRestoreBusy(false);
    setRestoreMessage(res.message);
    if (res.unlocked) {
      onUnlocked();
    }
  };

  const handleDevUnlock = () => {
    soundEngine.playUiClick();
    setDevEuropeUnlocked(true);
    onUnlocked();
  };

  return (
    <div
      className="fixed inset-0 z-20 overflow-y-auto bg-[#1e1e24] p-4 sm:p-6"
      data-testid="europe-paywall-screen"
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onBackToHub();
            }}
            className="n64-btn bg-[#2a2a32] text-[#f2ebdd] px-3.5 py-2 text-[10px] font-pixel flex items-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            HOME
          </button>

          <span className="n64-panel px-3 py-1.5 text-[10px] font-pixel text-[#ffb000] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            ONE-OFF TICKET
          </span>
        </div>

        {/* Retro Cartridge Preview Card */}
        <div className="n64-panel-warm p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-pixel text-[#ffb000] mb-1">
                40 EUROPEAN STATIONS · LONDON TO STOCKHOLM
              </p>
              <h1 className="text-xl sm:text-2xl font-pixel text-[#f2ebdd]">
                NEXT STOP EUROPE
              </h1>
              <p className="text-xs text-[#c9c1b2] mt-1">
                London St Pancras to Stockholm Central · 160+ European daily prompts.
              </p>
            </div>
            <div className="bg-[#16161b] border-2 border-[#ffb000] px-3.5 py-2 text-center shrink-0">
              <div className="text-[10px] text-[#c9c1b2]">ONE-OFF TICKET</div>
              <div className="text-lg font-pixel text-[#ffb000] tabular-nums">
                {priceLabel}
              </div>
            </div>
          </div>

          {/* Route & Biome Preview */}
          <div className="bg-[#16161b] border-2 border-[#3a3a44] p-3.5 space-y-2.5">
            <div className="text-[11px] font-pixel text-[#ffb000] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              ROUTE PREVIEW · 6 EUROPEAN BIOMES
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EUROPE_BIOMES.map((b) => (
                <div
                  key={b.id}
                  className="border border-[#3a3a44] bg-[#19191f] p-2.5 flex items-center gap-2"
                >
                  <span
                    className="w-3 h-3 border border-[#0e0e12] shrink-0"
                    style={{ backgroundColor: b.groundHex }}
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[#f2ebdd] truncate">
                      {b.name}
                    </div>
                    <div className="text-[10px] text-[#c9c1b2] tabular-nums">
                      Stn {b.minStation}–{b.maxStation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="n64-flap px-3 py-2.5 text-center mt-2">
              <div className="text-[10px] font-pixel text-[#ffb000] mb-1">
                SAMPLE DEPARTURE PROMPT
              </div>
              <div className="text-xs sm:text-sm font-pixel text-[#f2ebdd]">
                &quot;Name a European alpine railway pass or mountain tunnel&quot;
              </div>
            </div>
          </div>

          {/* Primary Buy CTA */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleBuyTicket}
              disabled={checkoutBusy || !stripeConfigured}
              data-testid="buy-ticket-btn"
              className="w-full n64-btn bg-[#ffb000] text-[#1e1e24] px-5 py-3.5 text-sm font-pixel flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 min-h-[48px]"
            >
              <Ticket className="w-4 h-4" />
              {checkoutBusy
                ? 'OPENING STRIPE CHECKOUT...'
                : `BUY TICKET — ${priceLabel}`}
            </button>

            {checkoutError && (
              <p className="text-xs text-[var(--accent)] bg-[var(--accent-dark)] border border-[var(--accent)] px-3 py-2">
                {checkoutError}
              </p>
            )}
            {!stripeConfigured && !checkoutError && (
              <p className="text-[11px] text-[#9a9386]">
                Tickets go on sale soon. The daily London line stays free to play.
              </p>
            )}
          </div>
        </div>

        {/* Restore Purchase by Email */}
        <form
          onSubmit={handleRestore}
          className="n64-panel p-4 space-y-2.5"
          data-testid="restore-purchase-form"
        >
          <div className="text-[10px] font-pixel text-[#ffb000] flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            ALREADY BOUGHT A TICKET? RESTORE PURCHASE
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="restore-email-input" className="sr-only">
              Purchase email address
            </label>
            <input
              id="restore-email-input"
              type="email"
              value={restoreEmail}
              onChange={(e) => setRestoreEmail(e.target.value)}
              placeholder="Enter email used at Stripe Checkout..."
              className="flex-1 bg-[#16161b] border-2 border-[#4a4a55] px-3 py-2 font-sans text-sm text-[#f2ebdd] placeholder:text-[#9a9386] focus:outline-none focus:border-[#ffb000]"
            />
            <button
              type="submit"
              disabled={restoreBusy}
              className="n64-btn bg-[#3a3a44] text-[#f2ebdd] px-4 py-2 text-[10px] font-pixel cursor-pointer whitespace-nowrap min-h-[40px]"
            >
              {restoreBusy ? 'CHECKING...' : 'RESTORE PURCHASE'}
            </button>
          </div>
          {restoreMessage && (
            <p className="text-xs text-[#f2ebdd]">{restoreMessage}</p>
          )}
        </form>

        {/* Dev-Only Unlock Toggle (stripped/disabled in production) */}
        {isDevMode() && (
          <div
            className="n64-panel border-[#a86f00] p-3.5 flex flex-wrap items-center justify-between gap-2"
            data-testid="dev-unlock-box"
          >
            <div className="text-[10px] text-[#ffd27a] flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 shrink-0" />
              <span>DEV MODE ONLY: Test Europe without live Stripe redirect</span>
            </div>
            <button
              type="button"
              onClick={handleDevUnlock}
              data-testid="dev-unlock-btn"
              className="n64-btn bg-[#a86f00] text-[#f2ebdd] px-3.5 py-2 text-[10px] font-pixel cursor-pointer"
            >
              DEV UNLOCK EUROPE
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
