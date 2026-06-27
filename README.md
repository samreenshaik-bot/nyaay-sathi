# Nyay Saathi — VerdictAI Edition

A complete, branded website: a landing page introducing Nyay Saathi as a
VerdictAI platform feature, plus the full working demo app with a Family
Portal and an Advocate Dashboard.

Everything is tested end-to-end with automated browser testing before
being handed to you — landing page, full registration flow, the change
detection pipeline, the new comparison feature, and the advocate
dashboard all confirmed working together with zero errors.

## Structure

```
nyay-final/
├── frontend/
│   ├── index.html   ← Landing page (VerdictAI branded)
│   └── app.html      ← The live demo app (Family Portal + Advocate Dashboard)
└── backend/
    ├── server.js
    └── package.json
```

## How to run

```bash
cd backend
npm install
node server.js
```

Then open `frontend/index.html` in your browser. Click "Launch Nyay
Saathi" or "Open the App" to go to the live demo (`app.html`).

## What's on the landing page

- VerdictAI-style navy and gold branding, matching their actual site
- Hero section with the value proposition
- Stats strip (4.3 lakh undertrials, 76% awaiting trial)
- "How it works" 4-step pipeline explainer
- Feature highlights for families and for advocates, side by side
- Call-to-action straight into the live demo

## What's in the app (`app.html`)

**Family Portal** (default view):
- Case selector, registration form, nightly check simulator — same
  proven pipeline from before
- **NEW: Wasted trips prevented counter** — increments every time a
  change is caught and an alert sent, with a brief explanation of the
  real-world cost this represents
- **NEW: Raw record vs. AI translation comparison** — a checkbox that
  reveals the original English case data next to the AI-generated
  plain-language message, side by side
- **NEW: AI disclosure note** — directly under the chat panel, reminding
  users to verify with their advocate before acting on any AI-generated
  message
- Document checklist, color-matched to the new theme

**Advocate Dashboard** (click the tab in the header):
- Same proven dashboard from before — per-advocate case list, family
  subscriber counts, and a live notification log
- Restyled to match the VerdictAI navy/gold theme

## What's real vs. simulated

Same as the previous build — unchanged:
- Real backend, real change detection, real AI calls (if you set
  `GEMINI_API_KEY`), real notification logging
- WhatsApp "sending" is simulated (clearly logged to the backend
  terminal) — this was the one piece that depended on a fragile
  third-party library with unresolved bugs, deliberately deferred

## Adding your Gemini key

```powershell
# Windows PowerShell
$env:GEMINI_API_KEY="your_key_here"
node server.js
```
```bash
# Mac/Linux
GEMINI_API_KEY=your_key_here node server.js
```

You'll see `AI mode: REAL` in the startup log when it's picked up
correctly.

## Presenting this to judges

A natural walkthrough:
1. Start on the landing page — explain the problem (4.3 lakh undertrials,
   families left uninformed) and how this fits into VerdictAI
2. Click into the Family Portal — register a case, simulate a change, run
   the check, watch the pipeline and the WhatsApp alert arrive
3. Toggle the raw-vs-AI comparison to make the value visually obvious in
   one glance
4. Switch to the Advocate Dashboard — show the same activity reflected
   there, making the "platform feature, not just a standalone tool" case
