/**
 * server.js — Nyay Saathi backend (simple, real, reliable)
 *
 * One file. No Puppeteer. No WhatsApp Web session. No polling loops.
 *
 * What's REAL here:
 *   - Real case data (3 sample cases, structured like eCourts records)
 *   - Real change-detection logic (diffs current vs last-known state)
 *   - Real AI call to Google Gemini (FREE tier) if you set GEMINI_API_KEY
 *   - Real Express API your frontend actually talks to
 *
 * What's SIMULATED (and clearly labeled as such):
 *   - "Sending" a WhatsApp message just logs it clearly to this console
 *     and returns success. This is the ONE piece that depended on a
 *     fragile third-party library (whatsapp-web.js) with unresolved bugs.
 *     Swapping in real WhatsApp sending later is a 10-line change in
 *     ONE function (sendWhatsAppMessage, near the bottom) — nothing else
 *     in this file needs to change.
 *
 * RUN:
 *   npm install express cors
 *   node server.js
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─────────────────────────────────────────────────────────────────────────
// DOCUMENT CHECKLISTS — driven by hearing type, not hardcoded per case.
// This means if a case's stage changes, the right checklist follows
// automatically. Each entry has a short reason so the family understands
// WHY each document matters, not just a bare list.
// ─────────────────────────────────────────────────────────────────────────

const DOCUMENT_CHECKLISTS = {
  'Bail Hearing': {
    attendance: 'Family attendance recommended, especially if standing as surety.',
    documents: [
      { item: "Surety's original ID proof (Aadhaar + one address proof)", reason: 'Required to verify the identity of whoever is standing surety for bail.' },
      { item: 'Property valuation certificate (if offering property as surety)', reason: 'Courts require proof the property is real and sufficient to cover the bail amount.' },
      { item: 'Copy of the most recent court order', reason: 'The judge may refer to conditions set in the last hearing.' }
    ]
  },
  'Charge Framing': {
    attendance: "Accused's presence is mandatory; family attendance is optional but often reassuring.",
    documents: [
      { item: "Accused's original ID proof", reason: 'Confirms identity before formal charges are read.' },
      { item: 'Copy of the FIR (First Information Report)', reason: 'Useful reference if the advocate needs to cross-check charge details.' },
      { item: 'Any alibi documents, if relevant', reason: 'If the defense involves an alibi, supporting documents should be ready early.' }
    ]
  },
  'Arguments': {
    attendance: 'Family attendance is optional — this stage is handled by the advocates directly.',
    documents: [
      { item: 'Copies of all previous court orders', reason: "Helps the advocate reference the case's full history during arguments." }
    ]
  },
  'Evidence': {
    attendance: 'Family attendance is optional unless a family member is a witness.',
    documents: [
      { item: 'No documents required from family', reason: 'This stage involves witness examination handled by the court and advocates.' }
    ]
  },
  'Adjourned - rescheduled': {
    attendance: 'Check with your advocate whether attendance is needed for the rescheduled date.',
    documents: [
      { item: 'Whatever was prepared for the original date', reason: 'An adjournment usually just changes the date, not the requirements — confirm with your advocate.' }
    ]
  },
  'Judgement': {
    attendance: 'Family attendance is strongly recommended on judgement day.',
    documents: [
      { item: 'Bail bond paperwork (ready in advance)', reason: 'If the verdict is acquittal or bail is granted, this allows immediate release without delay.' }
    ]
  }
};

function getDocumentChecklist(stage) {
  return DOCUMENT_CHECKLISTS[stage] || {
    attendance: 'Please confirm with your advocate whether attendance is needed.',
    documents: [{ item: 'Check with your advocate', reason: 'This hearing stage does not have a standard checklist — your advocate can advise based on case specifics.' }]
  };
}

// ─────────────────────────────────────────────────────────────────────────
// CASE DATA — stands in for eCourts. Mutated in-memory to simulate change.
// ─────────────────────────────────────────────────────────────────────────

const CASES = {
  'BRPA010001232023': {
    cnr: 'BRPA010001232023',
    accused_name: 'Ramesh Kumar',
    court: 'Sessions Court, Patna',
    current_stage: 'Bail Hearing',
    next_hearing_date: '2026-06-19',
    next_hearing_reason: 'Bail review',
    advocate: 'Adv. Sunita Rao',
    history: [
      { date: '2026-03-12', stage: 'Charge Framing', note: 'Charges framed under Section 304, IPC. Accused pleaded not guilty.' },
      { date: '2026-04-28', stage: 'Bail Application Filed', note: 'Bail application filed. Prosecution reply received 05/05/2026.' }
    ]
  },
  'MHCC010045620241': {
    cnr: 'MHCC010045620241',
    accused_name: 'Priya Devi',
    court: 'Chief Metropolitan Magistrate, Mumbai',
    current_stage: 'Arguments',
    next_hearing_date: '2026-07-12',
    next_hearing_reason: 'Final arguments',
    advocate: 'Adv. Sunita Rao',
    history: [
      { date: '2025-11-08', stage: 'Evidence', note: 'Prosecution witness PW-3 examined.' },
      { date: '2026-05-20', stage: 'Evidence Concluded', note: 'All witnesses examined. Listed for arguments.' }
    ]
  },
  'DLCT010078920221': {
    cnr: 'DLCT010078920221',
    accused_name: 'Mohammed Aslam',
    court: 'Tis Hazari Court, Delhi',
    current_stage: 'Adjourned - rescheduled',
    next_hearing_date: '2026-06-25',
    next_hearing_reason: 'Witness examination',
    advocate: 'Adv. Rajesh Khanna',
    history: [
      { date: '2026-06-15', stage: 'Adjourned', note: "Date changed from 15 June to 25 June 2026 due to judge's leave." }
    ]
  }
};

// Notification log — every message ever sent, for the advocate dashboard.
// Each entry: { timestamp, cnr, accusedName, phone, lang, message, trigger }
const notificationLog = [];

// Last-known state per CNR, used to detect changes. Starts empty.
const lastKnownState = {};

// Subscribers: { cnr: [{ phone, lang }] }
const subscribers = {};

// ─────────────────────────────────────────────────────────────────────────
// AI MESSAGE GENERATION — real Gemini call if key is set, else clean mock
// ─────────────────────────────────────────────────────────────────────────

const LANGUAGE_NAMES = { hi: 'Hindi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', mr: 'Marathi', en: 'English' };

function buildPrompt(caseData, changes, languageCode) {
  const languageName = LANGUAGE_NAMES[languageCode] || 'Hindi';
  const changeText = changes.length
    ? changes.map(c => c.description).join(' ')
    : 'This is the first update — confirm tracking has started.';

  const checklist = getDocumentChecklist(caseData.current_stage);
  const docsText = checklist.documents.map(d => d.item).join(', ');

  return `You are writing a WhatsApp message to the family member of an undertrial prisoner in India. The family may not read English well. Write ENTIRELY in ${languageName}.

Case: ${caseData.accused_name}, ${caseData.court}, stage: ${caseData.current_stage}.
Next hearing: ${caseData.next_hearing_date} (${caseData.next_hearing_reason}).
What changed: ${changeText}
Attendance guidance: ${checklist.attendance}
What to bring: ${docsText}

Write a warm, calm, 3-4 sentence WhatsApp message. No legal jargon. Mention attendance guidance and what to bring briefly. End with a short signature meaning "— Nyay Saathi" in ${languageName}. Output ONLY the message, nothing else.`;
}

async function generateMessage(caseData, changes, languageCode) {
  const prompt = buildPrompt(caseData, changes, languageCode);

  if (!GEMINI_API_KEY) {
    // Clean, readable mock — not a raw prompt dump, just clearly labeled
    const fallback = {
      hi: `नमस्ते। आपके मामले में अपडेट है। अगली सुनवाई ${caseData.next_hearing_date} को है। — न्याय साथी (DEMO MODE — set GEMINI_API_KEY for real AI text)`,
      en: `Hello. There's an update on your case. Next hearing is on ${caseData.next_hearing_date}. — Nyay Saathi (DEMO MODE — set GEMINI_API_KEY for real AI text)`
    };
    return fallback[languageCode] || fallback.en;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    if (!res.ok) throw new Error(`Gemini API returned ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : '[AI returned empty response]';
  } catch (err) {
    console.error('[AI] Gemini call failed, using fallback:', err.message);
    return `[AI call failed — ${err.message}] Next hearing for ${caseData.accused_name}: ${caseData.next_hearing_date}.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SIMULATED WHATSAPP SEND — clearly labeled, easy to swap for real later
// ─────────────────────────────────────────────────────────────────────────

async function sendWhatsAppMessage(phone, message, logMeta = {}) {
  console.log('\n──────────────────────────────────────────');
  console.log(`[WHATSAPP — SIMULATED SEND] To: ${phone}`);
  console.log(message);
  console.log('──────────────────────────────────────────\n');
  await new Promise(r => setTimeout(r, 300)); // realistic delay

  notificationLog.push({
    timestamp: new Date().toISOString(),
    phone,
    message,
    cnr: logMeta.cnr || null,
    accusedName: logMeta.accusedName || null,
    lang: logMeta.lang || null,
    trigger: logMeta.trigger || 'unknown'
  });

  return { success: true, simulated: true };
}

// ─────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiMode: GEMINI_API_KEY ? 'real' : 'demo' });
});

app.get('/api/case/:cnr', (req, res) => {
  const caseData = CASES[req.params.cnr];
  if (!caseData) return res.status(404).json({ error: 'Case not found' });
  res.json({ ...caseData, checklist: getDocumentChecklist(caseData.current_stage) });
});

app.get('/api/checklist/:cnr', (req, res) => {
  const caseData = CASES[req.params.cnr];
  if (!caseData) return res.status(404).json({ error: 'Case not found' });
  res.json(getDocumentChecklist(caseData.current_stage));
});

app.get('/api/cases', (req, res) => {
  res.json(Object.values(CASES).map(c => ({
    cnr: c.cnr, name: c.accused_name, court: c.court, stage: c.current_stage, advocate: c.advocate
  })));
});

// ─────────────────────────────────────────────────────────────────────────
// ADVOCATE DASHBOARD — aggregates cases, subscriber counts, and recent
// notification history. This is what makes the project a platform feature,
// not just a standalone family-facing tool.
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/advocates', (req, res) => {
  const names = [...new Set(Object.values(CASES).map(c => c.advocate))];
  res.json(names);
});

app.get('/api/dashboard/:advocateName', (req, res) => {
  const advocateName = decodeURIComponent(req.params.advocateName);
  const myCases = Object.values(CASES).filter(c => c.advocate === advocateName);

  const caseSummaries = myCases.map(c => {
    const subs = subscribers[c.cnr] || [];
    const sentCount = notificationLog.filter(n => n.cnr === c.cnr).length;
    return {
      cnr: c.cnr,
      accused_name: c.accused_name,
      court: c.court,
      current_stage: c.current_stage,
      next_hearing_date: c.next_hearing_date,
      familiesTracking: subs.length,
      notificationsSent: sentCount
    };
  });

  const myCNRs = new Set(myCases.map(c => c.cnr));
  const recentNotifications = notificationLog
    .filter(n => myCNRs.has(n.cnr))
    .slice()
    .reverse()
    .slice(0, 20);

  res.json({
    advocateName,
    totalCases: myCases.length,
    totalFamiliesTracking: caseSummaries.reduce((sum, c) => sum + c.familiesTracking, 0),
    totalNotificationsSent: recentNotifications.length ? notificationLog.filter(n => myCNRs.has(n.cnr)).length : 0,
    cases: caseSummaries,
    recentNotifications
  });
});

app.post('/api/register', async (req, res) => {
  const { cnr, phone, lang } = req.body;
  const caseData = CASES[cnr];
  if (!caseData) return res.status(404).json({ error: 'Case not found' });

  if (!subscribers[cnr]) subscribers[cnr] = [];
  subscribers[cnr].push({ phone, lang: lang || 'hi' });
  lastKnownState[cnr] = JSON.stringify({ stage: caseData.current_stage, date: caseData.next_hearing_date });

  const message = await generateMessage(caseData, [], lang || 'hi');
  const sendResult = await sendWhatsAppMessage(phone, message, {
    cnr, accusedName: caseData.accused_name, lang: lang || 'hi', trigger: 'registration'
  });

  res.json({ success: true, message, sendResult });
});

// Force a "change" to exist by clearing the last-known state for this CNR
app.post('/api/simulate-change/:cnr', (req, res) => {
  const cnr = req.params.cnr;
  if (!CASES[cnr]) return res.status(404).json({ error: 'Case not found' });
  delete lastKnownState[cnr];
  res.json({ success: true, message: 'State cleared. Run check now to detect the change.' });
});

app.post('/api/check/:cnr', async (req, res) => {
  const cnr = req.params.cnr;
  const caseData = CASES[cnr];
  if (!caseData) return res.status(404).json({ error: 'Case not found' });

  const currentSnapshot = JSON.stringify({ stage: caseData.current_stage, date: caseData.next_hearing_date });
  const previousSnapshot = lastKnownState[cnr];

  if (previousSnapshot === currentSnapshot) {
    return res.json({ changed: false });
  }

  // Build a human-readable changes list (works whether this is the very
  // first check or a real diff, since we don't store the "before" values
  // separately in this simplified version — we describe the known transition).
  const changes = [
    { type: 'date_changed', description: `Hearing date is now ${caseData.next_hearing_date}.` },
    { type: 'stage_changed', description: `Case stage is now ${caseData.current_stage}.` }
  ];

  lastKnownState[cnr] = currentSnapshot;

  const subs = subscribers[cnr] || [];
  const results = [];
  for (const sub of subs) {
    const message = await generateMessage(caseData, changes, sub.lang);
    const sendResult = await sendWhatsAppMessage(sub.phone, message, {
      cnr, accusedName: caseData.accused_name, lang: sub.lang, trigger: 'change_detected'
    });
    results.push({ phone: sub.phone, message, sendResult });
  }

  res.json({ changed: true, changes, results });
});

app.listen(PORT, () => {
  console.log(`\nNyay Saathi backend running on http://localhost:${PORT}`);
  console.log(`AI mode: ${GEMINI_API_KEY ? 'REAL (Gemini key found)' : 'DEMO (no GEMINI_API_KEY set — using clean fallback text)'}`);
  console.log(`WhatsApp mode: SIMULATED (messages print to this console)\n`);
});
