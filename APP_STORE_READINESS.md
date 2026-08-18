# VOXYFI — App Store / Play Store Readiness

VOXYFI ships to the Apple App Store and Google Play as a **native wrapper**
(PWABuilder / Capacitor) around the deployed web app. The wrapper loads the site
with a `?platform=ios` (or `?platform=android`) query flag, which is persisted to
`localStorage` and read by `lib/platform.ts` → `usePlatform()`.

## Apple Guideline 3.1.1 — the "reader" model

Apple forbids selling digital content/subscriptions inside an iOS app through any
mechanism other than Apple In-App Purchase. VOXYFI's paid content (Premium
subscription + individual audiobook purchases) is sold **only on the web via
Stripe**. Inside the iOS shell we run the **reader model**: the app plays content
the user already owns, but shows **no purchase surface, no prices, and no external
links to buy**.

### What is hidden on iOS (`isIOS === true`)

| Surface | File | Behavior on iOS |
| --- | --- | --- |
| Subscription plans / prices / trial / checkout | `components/subscribe-plans.tsx`, `app/subscribe/page.tsx` | Reader message; no prices, no checkout, no external links |
| Manage billing (Stripe portal) | `components/manage-billing-button.tsx` | Hidden |
| Book store cart button | `components/books-store.tsx` (`BooksStore`) | Hidden |
| Cart drawer + checkout | `components/cart-drawer.tsx` | Returns `null` (never opens) |
| Featured hero "Add · $" / "In cart" | `components/books-store.tsx` (`BookHero`) | "Available on voxyfi.com" note |
| Store card "Add · $" + price badge | `components/books-store.tsx` (`StoreBookCard`) → `components/store/book-card.tsx` (`web-only` action) | "On voxyfi.com" note, no price |
| Book-detail "Buy for $" / "Add to cart" | `components/buy-book-button.tsx` | Neutral "get it on voxyfi.com" note |
| Premium feature gate CTA | `components/premium-gate.tsx` | Info text, no "View plans" link |
| Persistent "Upgrade" / "Subscribe" chrome | `app/app/layout.tsx`, `components/site-header.tsx`, `components/user-menu.tsx` | Hidden (wrapped in `WebOnly` / `!isIOS`) |

### What stays on iOS (Apple-compliant)

- **Amazon affiliate out-links** (`scan-result-sheet.tsx`, `live-book-results.tsx`,
  `buy-on-amazon-button.tsx`, `amazon-buy-formats.tsx`) — these open Amazon's own
  store in the external browser (physical goods / Amazon's storefront), not an
  in-app purchase mechanism.
- **Owned content** — "Listen" / "Listen now" for purchased or free titles.
- **Free public-domain** ("Read free") and **in-app samples**.
- All non-commerce features (uploads, library, player, AI tools within quota).

### Single compliant boundary

Every remaining in-app link to `/subscribe` (contextual quota banners,
locked-feature prompts, profile) now leads to the **reader-safe** `/subscribe`
page, which on iOS contains no prices, no checkout, and no external purchase
links. This is the single choke point that keeps the app compliant even where an
individual CTA was left in place for web/Android.

> Note: `isIOS` starts `false` on first render (to match SSR and avoid hydration
> mismatch) and resolves after mount. In the native shell the `platform=ios` flag
> is persisted in `localStorage`, so purchase UI is suppressed on every load.

## Android (Google Play)

Google permits external purchase links more liberally than Apple. The current
implementation only special-cases **iOS** (`isIOS`); Android (`isNative &&
!isIOS`) behaves like the web and keeps the Stripe flow. If Play policy for your
content category requires Play Billing, extend the gates from `isIOS` to
`isNative`.

## Pre-submission checklist

- [ ] Deploy the web app to production (Publish).
- [ ] Build the iOS wrapper so it loads `https://<prod-domain>/?platform=ios`.
- [ ] Build the Android wrapper so it loads `https://<prod-domain>/?platform=android`.
- [ ] Manually confirm on a signed-in iOS build: store shows no prices/cart,
      book detail shows no Buy button, `/subscribe` shows the reader message,
      account shows no "Manage billing" / "Upgrade".
- [ ] Confirm owned/free content still plays on iOS.
- [ ] App Review notes: state that Premium and book purchases are sold only on the
      website and the iOS app is a reader that plays previously purchased content.
- [ ] Provide a demo account with at least one owned title for reviewers.
- [ ] Privacy: `/legal/privacy`, `/legal/terms`, `/legal/refund` are reachable.
- [ ] `next build` passes with `ignoreBuildErrors: false` (verified).

## How to verify locally

Append `?platform=ios` to any URL to simulate the iOS shell (the flag persists via
`localStorage`); use `?platform=web` or clear the `voxyfi:platform` key to reset.
