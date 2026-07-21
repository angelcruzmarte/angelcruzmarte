# VOXYFI — App Store & Google Play Listing Kit

Reference copy and assets for submitting VOXYFI to the Apple App Store and Google Play.
Production URL: https://www.voxyfi.com

---

## App identity

- **App name:** VOXYFI
- **Subtitle (Apple, 30 chars):** `Turn any text into audio`
- **Short description (Google Play, 80 chars):** `Turn articles, PDFs & books into natural-sounding audio you can listen to.`
- **Primary category:** Books & Reference (alt: Productivity)
- **Support email:** support@voxyfi.com
- **Privacy policy URL:** https://www.voxyfi.com/legal/privacy
- **Terms URL:** https://www.voxyfi.com/legal/terms

---

## Promotional text (Apple, 170 chars)

Listen to articles, documents, and books in natural voices — with word-by-word highlighting, adjustable speed, and offline listening. Your reading list, out loud.

---

## Full description

VOXYFI turns anything you read into natural-sounding audio. Paste an article, upload a PDF, DOCX, EPUB, or TXT, or browse the built-in library — then listen hands-free with lifelike voices.

WHY VOXYFI
- Natural voices — expressive, human-sounding narration
- Word-by-word highlighting — follow along as it reads
- Upload your own — PDF, DOCX, EPUB, TXT, and Markdown
- Adjustable speed — from a relaxed pace to 2x and beyond
- Built-in library — thousands of titles ready to play
- Listen anywhere — commute, cook, work out, or unwind

Upload a book and listen free. Go Premium for unlimited listening across the entire library. Cancel anytime.

---

## Keywords (Apple, 100 chars, comma-separated)

`text to speech,audiobook,tts,read aloud,pdf reader,listen,voice,ebook,narrator,speech,books,article`

## Tags (Google Play)

text-to-speech, audiobooks, read aloud, TTS, PDF reader, ebook, listening

---

## Assets (in /public/store/)

| Asset | Path | Size | Where it goes |
| --- | --- | --- | --- |
| App icon | `/public/icon-1024.png` | 1024x1024 | App Store & Play listing icon |
| Feature graphic | `/public/store/play-feature-graphic.png` | 1024x500 | Google Play "Feature graphic" |
| Phone screenshots | `/public/store/promo/promo-1..3.png` | 1290x2796 | App Store 6.7" + Play phone |
| 7-inch tablet | `/public/store/tablet/tablet-7in-1..2.png` | 1600x1000 | Play 7-inch tablet |
| 10-inch tablet | `/public/store/tablet/tablet-10in-1..2.png` | 2560x1600 | Play 10-inch tablet |
| Share/OG image | `/public/opengraph-image.png` | 1200x630 | Social/link previews |

---

## Packaging checklist (web app -> native)

You cannot upload a URL directly. Package the PWA into native apps:

1. Go to https://www.pwabuilder.com and enter `https://www.voxyfi.com`.
2. **Google Play (TWA):** download the Android package. Copy the SHA-256 signing
   fingerprint PWABuilder gives you into `/public/.well-known/assetlinks.json`
   (replace `REPLACE_WITH_YOUR_SHA256_FINGERPRINT`) and redeploy so the app runs
   without the browser address bar.
3. **Apple App Store:** download the generated Xcode project, build, and submit.
   Be ready for Apple Guideline 4.2 review — VOXYFI's TTS, uploads, and library
   features qualify it as more than a repackaged website.
4. **Accounts:** Apple Developer ($99/yr), Google Play Console ($25 one-time).
5. Fill in listing text/keywords above, upload the assets, set age rating and
   category, and add the privacy policy URL.

Note: the VOX 50% promo currently has no end date, so it will only end when
toggled off in the admin panel. Set an `endsAt` if you want it to auto-expire.
