# VOXYFI v1.0.3

**Tag:** `v1.0.3` · **Release branch:** `release/v1.0.0` · **Status:** App Store submission candidate

Bug-fix patch on top of v1.0.2. No new features or redesign.

## Root cause (dictation microphone)

A full pass across the mic stack found the reported Safari failure had a single
primary cause and several secondary error-handling gaps:

- **Primary (fixed in v1.0.2):** the `Permissions-Policy` response header set
  `microphone=()`, disabling the mic page-wide. Every browser — including iOS
  Safari — rejected `getUserMedia` with `NotAllowedError` and never prompted.
  Now `microphone=(self)` (camera/geolocation stay denied). The v0 preview
  strips these headers, so it only reproduced on the deployed domain.
- **Verified NOT the cause:** user-gesture preservation (getUserMedia is the
  first `await` off the tap), MediaRecorder mime selection (`audio/mp4` on iOS),
  the authenticated `/api/transcribe` ElevenLabs pipeline, and HTTPS in
  production — all correct.

## Changes since v1.0.2

- **Accurate mic error messages** — distinct, correct copy for: insecure
  (non-HTTPS) context, permission/policy blocked, no microphone found, and
  microphone already in use by another app (`NotReadableError`/`AbortError`).
- **Expired session is reported as auth** — a `401` from `/api/transcribe` now
  says "session expired, sign in again" instead of a generic transcription
  failure.
- **iOS waveform** — the `AudioContext` is resumed on start so the live
  waveform animates on iOS (recording itself was already working).
- **Browser-accurate "mic blocked" guidance** — on iOS, third-party browsers
  (Chrome/`CriOS`, Firefox/`FxiOS`, Edge/`EdgiOS`) run on WKWebView, where the
  microphone is gated by a **per-app** iOS permission (Settings › ‹Browser› ›
  Microphone), not Safari's per-site prompt. When it is off, `getUserMedia`
  throws `NotAllowedError` and no prompt appears. The error now detects the
  browser and points the user to the correct setting (per-app for iOS
  Chrome/Firefox/Edge, the "aA" menu for iOS Safari, per-site elsewhere).

> Platform limitation: web code cannot force the microphone prompt to reappear
> where iOS has blocked it. This change corrects the *guidance*; the user must
> enable the mic in iOS Settings (or use Safari) to actually record.

## Rollback

If v1.0.3 regresses, roll back to the previous stable tag:

- **Previous stable:** `v1.0.2` → `8a6a285` (Permissions-Policy fix, without the
  extra error messaging).
- **Last known-good before dictation redesign:** `v1.0.0` → `4a8b9ed`.
- Redeploy the desired tag, e.g. `git checkout v1.0.2 && <deploy>`. All tags are
  immutable and were cut from `release/v1.0.0`.

## On-device checklist (must pass before App Store submission)

Runs only on a real iPhone build (cannot be verified in the CI sandbox):
tap Dictate → iOS mic permission prompt appears → record → stop → upload →
transcription succeeds → transcript inserts → word count updates → Create &
Listen works. Confirm File, Scan, Link, and Paste are unaffected.

> iOS shell requirement: the native wrapper must declare
> `NSMicrophoneUsageDescription` and grant the WKWebView microphone access.
> The web-layer `Permissions-Policy` fix does not replace this native config.

---

# VOXYFI v1.0.2

**Tag:** `v1.0.2` · **Release branch:** `release/v1.0.0` · **Status:** superseded by v1.0.3

Critical patch on top of v1.0.1.

## Changes since v1.0.1

- **Dictation microphone now works on the deployed site / iOS Safari** — the
  hardening `Permissions-Policy` response header disabled the microphone for
  the whole page (`microphone=()`), so iOS Safari rejected `getUserMedia` with
  `NotAllowedError` and never prompted, dropping straight into "Recording
  failed — Microphone access was denied." Changed to `microphone=(self)`;
  camera and geolocation remain denied.

> This bug was invisible in the v0 preview, which strips these response headers,
> and only reproduced on the deployed domain / real device.

> iOS shell requirement (unchanged): the native wrapper must declare
> `NSMicrophoneUsageDescription` and allow WKWebView microphone access.

---

# VOXYFI v1.0.1

**Tag:** `v1.0.1` · **Release branch:** `release/v1.0.0` · **Status:** superseded by v1.0.2

Patch release on top of v1.0.0 delivering a fixed and redesigned dictation and
Add Content experience.

## Changes since v1.0.0

- **Dictation now activates the microphone** — replaced the unreliable
  `webkitSpeechRecognition` implementation (which never activated the mic in
  iOS Safari or the App Store WKWebView) with a cross-browser `getUserMedia` +
  `MediaRecorder` capture pipeline, transcribed server-side via ElevenLabs
  Scribe (`POST /api/transcribe`).
- **Redesigned Add Content experience** — a single Dictate entry point that
  opens a dedicated full-screen recorder with a live waveform, timer, large
  one-handed controls, and clear ready → recording → processing → review →
  error/retry states, plus an editable transcript before insertion.
- **Polished editor** — consistent action cards with a clear selected state, an
  auto-growing text editor with live word/character/listening-time stats, a
  prominent CTA with a busy state that blocks duplicate submits, and a
  route-level loading skeleton.
- **Accessibility & motion** — ARIA roles/labels on the recorder, focus
  management, `prefers-reduced-motion` handling for all new animations, haptic
  feedback where supported, and safe-area insets.

> Note: the Add Content redesign is broader than the v1.0.0 freeze scope; it was
> included in this patch by explicit release direction to ship the improved
> recording experience to users.

> iOS shell requirement: the native wrapper must declare
> `NSMicrophoneUsageDescription` and allow WKWebView microphone access.

---

# VOXYFI v1.0.0 — First Production Release

**Tag:** `v1.0.0` · **Release branch:** `release/v1.0.0` · **Status:** UI & branding frozen for App Store submission

VOXYFI is a premium AI reading platform. This is the first production release
submitted to the App Store. The UI and branding are frozen as of this tag —
see [Release Freeze Policy](#release-freeze-policy) below.

---

## Highlights

- **Premium VOXYFI brand identity** — a cohesive, polished visual system with a
  custom wordmark, depth-enhanced logo lockup, and a signature Premium
  membership badge, applied consistently across every screen.
- **Personalized book discovery** — a curated storefront with Editor's Picks,
  New Releases, and Classic Literature rows, plus language-aware browsing.
- **AI Reading Assistant** — an in-app assistant that recommends real titles
  from the catalog, with graceful handling under load.
- **AI-enriched book details** — summaries, themes, difficulty, reading level,
  and author notes, generated once and cached.
- **Reader & AI audio narration** — read owned titles in-app with premium
  AI-narrated audio.
- **Amazon Associates monetization** — a Kindle-first purchase flow with proper
  affiliate tagging and disclosure.

---

## What's included

### Brand & UI
- Custom `.voxyfi-wordmark` treatment (tuned weight, tracking, and legibility)
  so the wordmark reads as designed rather than a system font.
- `BrandLogo` lockup with layered brand shadow, inset light edge, refined
  per-size proportions for mobile balance, and a subtle hover/focus sheen.
- Reusable `PremiumBadge` (green brand gradient, inset highlight, soft shadow,
  understated shine) unifying what were three separate badge implementations.
- Refined app header height, alignment, spacing, and hierarchy; polished
  profile button with a Premium ring indicator.
- AI Assistant header now leads with the real brand mark.

### Discovery & catalog
- Personalized discovery rows and a Classic Literature shelf.
- Language-aware storefront pooling so localized views (and the English/All
  views) always fill their shelves even when new imports skew to one language.
- Language filter with search across the catalog.
- Improved search tokenization and result ranking.

### AI features
- AI Reading Assistant with an assistant quota guard and token-spend logic.
- Cached AI book enrichment (summary, themes, difficulty, reading level,
  author note).
- Graceful AI Gateway rate-limit handling (no hard failures under load).

### Monetization
- Amazon Associates affiliate integration with Kindle / Audible / Print ASIN
  support and a Kindle-first buy flow.
- Affiliate link sanitization, tag enforcement (`tag=voxyfi-20`),
  `rel="sponsored nofollow"`, and required affiliate disclosure.
- Affiliate analytics and settings management.

### Content quality & operations
- Book quality review and approval workflow with metadata quality scoring.
- Scheduled book-import cron with centralized cron authorization and audit
  logging.
- Document scanning feature and library upload flow.

### Reader & audio
- In-app reader for owned titles.
- Premium AI audio narration.

---

## Accessibility

- All brand micro-animations are disabled under `prefers-reduced-motion`.
- Decorative animation layers are marked `aria-hidden`.
- Interactive controls carry descriptive `aria-label`s (e.g. the profile menu
  announces Premium vs. Free plan) and visible focus rings.

## Performance

- Brand animations use GPU transform/opacity only — never layout — so they add
  no measurable runtime cost.
- AI enrichment is cached after first view to avoid repeated model calls.

---

## Verification

This release passed a full regression before tagging:

- Production build (`next build`) — pass
- Type check (`tsc --noEmit`) — pass
- Authenticated (non-headless) browser QA of the logged-in header, Premium
  badge, and profile button across Home, Library, Books, AI Assistant,
  Reader/Audio Player, onboarding, auth, loading, and empty states.
- Light and dark mode; mobile (440px) and desktop (1280px) breakpoints.
- Revenue-critical Amazon Kindle-first affiliate flow (tag + `rel` +
  disclosure) confirmed intact.

---

## Release freeze policy

From the `v1.0.0` tag forward, until after the first production release, only
the following changes are accepted on the release branch:

- Bug fixes
- Accessibility improvements
- Performance optimizations
- App Store compliance changes

**No new features or redesigns** unless a critical issue is discovered.

## Rollback

- `v1.0.0-prev` — known-good baseline prior to the discovery feature work.
- `v1.0.0-rc1` — release candidate prior to the branding polish.
- `v1.0.0` — this release (branding included).

To roll back, redeploy from the appropriate tag above.
