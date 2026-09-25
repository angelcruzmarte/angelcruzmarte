# VOXYFI — App Store / Play Store Readiness

VOXYFI ships to the Apple App Store as a **native wrapper** (SWING2APP WKWebView)
around the deployed web app. The wrapper loads the production site, and the app
detects that it is running inside the native iOS WebView at runtime.

> **History — do not regress.** An earlier build hid all purchase surfaces on
> iOS ("reader model") and detected the platform from a `?platform=ios` URL
> flag. Apple rejected that under **Guideline 5.6 (Developer Code of Conduct)**
> as functionality "intentionally hidden during the review process" (cloaking).
> That model has been removed. The rules below are what keeps VOXYFI compliant;
> reverting to hiding features on iOS will get the app rejected again.

## The compliant model: same app, In-App Purchase as the iOS payment rail

The app shows **the same features, plans, books, and content to everyone**,
including App Review. The ONLY thing that changes inside the iOS app is the
**payment rail**: digital purchases run through **Apple In-App Purchase (IAP)**
instead of Stripe, as **Guideline 3.1.1** requires. Nothing is hidden.

### Platform detection (honest)

`lib/platform.ts` → `detectPlatform()` reports `"ios"` only inside the genuine
native iOS WebView (the WKWebView message-handler marker the SWING library
itself uses), and `"web"` in every ordinary browser including mobile Safari. It
is **never** driven by a URL flag, User-Agent, IP, date, or reviewer heuristic,
and is used for one purpose only: choosing the payment rail.

### What is identical on iOS and web (must stay visible to reviewers)

| Surface | File | Behavior |
| --- | --- | --- |
| Subscribe screen, plans, features | `app/subscribe/page.tsx`, `components/subscribe-plans.tsx` | Shown on every platform. On iOS the Subscribe button runs the Apple IAP sheet; on web it runs Stripe checkout. |
| Header "Subscribe" / "Upgrade" chrome | `components/site-header.tsx`, `app/app/layout.tsx`, `components/user-menu.tsx` | Shown to non-subscribers on every platform (no `isIOS` gating). |
| Premium feature gate CTA | `components/premium-gate.tsx` | Always shows "View plans" → `/subscribe`. |
| Book acquisition | `components/buy-book-button.tsx`, `components/books-store.tsx`, `components/genre-browser.tsx` | "Unlock with Premium" → `/subscribe` on every platform. Individual titles are no longer sold; Premium unlocks the whole library. |
| Owned / free content | reader + player | "Listen" / "Read free" everywhere. |
| Amazon affiliate out-links | `buy-on-amazon-button.tsx`, `amazon-buy-formats.tsx`, etc. | Open Amazon's own store in the external browser (physical goods) — allowed on iOS. |

### The only two iOS differences (both Apple-*required*, not cloaking)

1. **Manage/cancel subscription** (`components/manage-billing-button.tsx`) — on
   iOS an IAP subscription is managed in the App Store (Settings › Apple Account
   › Subscriptions), so the app shows that instruction instead of the Stripe
   billing portal. This is where Apple *requires* IAP subscriptions to be
   managed.
2. **Promotional / discount pricing** (`components/home-promo.tsx`) — the
   limited-time "% off" web promo is not shown on iOS, because the IAP price is
   Apple's configured price and 3.1.1 forbids advertising a discounted digital
   price inside the app that IAP will not actually charge. Fails closed (no
   discount shown if platform detection is uncertain).

Neither of these removes a feature or a path to subscribe — they present the
Apple-standard equivalent.

## Known submission blocker (as of this writing): StoreKit error code 3

TestFlight purchases of the **annual** plan (`com.voxyfi.premium.annual`) fail
with StoreKit **code 3** (`SKErrorPaymentInvalid`). This is thrown on-device by
StoreKit **before** any receipt reaches the server, and the annual purchase call
is byte-for-byte identical to the (working) monthly one except the product-id
string. **This is an App Store Connect / test-environment configuration issue,
not a code bug.** See the "Manual steps" below.

## IAP wiring (server)

- Product ids: `lib/plans.ts` (`com.voxyfi.premium.monthly`,
  `com.voxyfi.premium.annual`).
- Purchase verification: `app/api/apple/purchase/route.ts` + `lib/apple/verify.ts`
  (App Store Server API, signed with the `APPLE_IAP_*` env keys). Premium is
  granted **only after** server-side receipt verification.
- Restore: `app/api/apple/restore/route.ts`.
- Server notifications (renew / expire / revoke): `app/api/apple/notifications/route.ts`.
- Entitlement resolution: `lib/entitlements.ts`.

## Pre-submission checklist

- [ ] Deploy the web app to production (Publish) and confirm the SWING2APP
      wrapper loads the production domain.
- [ ] On a signed-in iOS build, confirm **the same app is visible as on web**:
      the store shows books, `/subscribe` shows the plans, and the header shows
      the Subscribe/Upgrade affordance. (Nothing purchase-related should be
      hidden — that was the rejected behavior.)
- [ ] Confirm the Subscribe button on iOS opens the **Apple IAP sheet** (not
      Stripe) and that a completed purchase unlocks Premium after server
      verification.
- [ ] Confirm owned/free content plays on iOS.
- [ ] Confirm "Manage subscription" on iOS points to App Store settings, and no
      discounted/strikethrough price is shown inside the iOS app.
- [ ] Resolve StoreKit code 3 on the annual product (see Manual steps).
- [ ] App Review notes: state that Premium is sold via **Apple In-App Purchase**
      inside the app, the same plans are shown on web via Stripe, and physical
      books link out to Amazon. Provide a demo account.
- [ ] Privacy/terms/refund pages reachable; account deletion available
      (`components/profile-view.tsx` / `components/settings-controls.tsx`).
- [ ] `next build` passes with `ignoreBuildErrors: false`.

## Manual steps to clear StoreKit code 3 (App Store Connect — cannot be fixed in code)

1. **The annual product** (`com.voxyfi.premium.annual`): product id matches
   exactly; type is **Auto-Renewable Subscription**; in the correct subscription
   group and attached to the app (bundle id `APPLE_IAP_BUNDLE_ID`); **pricing is
   set**; status is approved/"Ready to Submit" (not "Missing Metadata"); cleared
   for sale in the tested storefront; no invalid promotional/introductory offer
   attached. The first auto-renewable subscription in a group must be submitted
   with an app version before it is purchasable even in Sandbox.
2. **Test account / device:** Sandbox account has "Allow Purchases & Renewals"
   on, a valid payment method, no storefront mismatch, and no stuck prior
   transaction for the annual product. The device StoreKit environment is set by
   how the build was installed (TestFlight/dev = Sandbox), independent of
   `APPLE_IAP_ENVIRONMENT` (which governs server verification).
3. Re-test both monthly and annual and read the device logs; a failure prints a
   structured `[v0]` diagnostic with the product id and StoreKit code.

## Android (Google Play)

Only iOS is special-cased (IAP as the payment rail). Android behaves like the
web (Stripe). If Play policy for this content category requires Play Billing,
extend the payment-rail branch from iOS to native Android as well.
