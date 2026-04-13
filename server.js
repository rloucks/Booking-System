require('dotenv').config();

const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcrypt');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Demo mode ──────────────────────────────────────────────────────────────
// Set DEMO_MODE=true in .env (or leave GOOGLE_CLIENT_ID blank) to bypass OAuth
// Demo users: any email works. Prefix with "admin" for admin access.
const DEMO_MODE = process.env.DEMO_MODE === 'true' || !process.env.GOOGLE_CLIENT_ID;

// ── File paths ─────────────────────────────────────────────────────────────
const DATA_DIR    = path.join(__dirname, 'data');
const DATA_FILE   = path.join(DATA_DIR, 'bookings.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && !DEMO_MODE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Google OAuth setup (skipped in demo mode) ──────────────────────────────
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

app.get('/auth/google', (req, res) => {
  console.log('Client ID:', process.env.GOOGLE_CLIENT_ID);
  console.log('Redirect URI:', process.env.GOOGLE_REDIRECT_URI);
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  console.log('Auth URL:', url);
  res.redirect(url);
});

let oauth2Client;
if (!DEMO_MODE) {
  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`
  );
}

const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/calendar.events',
];

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (DEMO_MODE && req.session.user) return next();
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.session.user.isAdmin) return res.status(403).json({ error: 'Admin required' });
  next();
}

// ── Auth routes ────────────────────────────────────────────────────────────
// Demo login — POST with { email }
app.post('/auth/demo', (req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'Not available' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  req.session.user = {
    email: email.toLowerCase(),
    name,
    avatar: '',
    isAdmin: email.toLowerCase().startsWith('admin') || ADMIN_EMAILS.includes(email.toLowerCase()),
  };
  res.json({ user: req.session.user });
});

// Google OAuth
app.get('/auth/google', (req, res) => {
  if (DEMO_MODE) return res.redirect('/?error=demo_mode');
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  if (DEMO_MODE) return res.redirect('/');
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    const oauth2    = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data }  = await oauth2.userinfo.get();
    const allowed   = process.env.ALLOWED_DOMAIN;
    if (allowed && !data.email.endsWith('@' + allowed))
      return res.redirect('/?error=unauthorized_domain');
    req.session.user = {
      email:   data.email,
      name:    data.name,
      avatar:  data.picture,
      isAdmin: ADMIN_EMAILS.includes(data.email.toLowerCase()),
      tokens,
    };
    res.redirect('/');
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null, demoMode: DEMO_MODE });
  const { email, name, avatar, isAdmin } = req.session.user;
  res.json({ user: { email, name, avatar, isAdmin }, demoMode: DEMO_MODE });
});

// ── PIN helpers ────────────────────────────────────────────────────────────
const SALT_ROUNDS = 10;
async function hashPin(pin)           { return bcrypt.hash(String(pin), SALT_ROUNDS); }
async function verifyPin(pin, hash)   { return bcrypt.compare(String(pin), hash); }

// ── Bookings — GET (public, no auth needed for floor plan) ─────────────────
app.get('/api/bookings', (req, res) => {
  const bookings = readJson(DATA_FILE, []);
  const { date, deskId } = req.query;
  let result = bookings.filter(b => b.status === 'active');
  if (date)   result = result.filter(b => b.date === date);
  if (deskId) result = result.filter(b => b.deskId == deskId);
  // Strip pinHash before sending to clients — never expose it
  res.json(result.map(({ pinHash, ...b }) => b));
});

// ── Bookings — POST ────────────────────────────────────────────────────────
app.post('/api/bookings', requireAuth, async (req, res) => {
  const { deskId, date, timeSlot, timeStart, timeEnd, note, pin, userEmail, userName } = req.body;
  if (!deskId || !date)  return res.status(400).json({ error: 'deskId and date required' });
  if (!pin || String(pin).length !== 4 || isNaN(pin))
    return res.status(400).json({ error: 'A 4-digit PIN is required' });

  const bookings = readJson(DATA_FILE, []);

  // Conflict check — same desk, same date, overlapping time slot
  const conflict = bookings.filter(b => b.deskId == deskId && b.date === date && b.status === 'active')
    .find(b => {
      if (b.timeSlot === 'allday' || !timeSlot || timeSlot === 'allday') return true;
      return b.timeSlot === timeSlot;
    });
  if (conflict) return res.status(409).json({ error: 'That desk/time is already booked' });

  const isAdmin     = req.session.user.isAdmin;
  const targetEmail = (isAdmin && userEmail) ? userEmail : req.session.user.email;
  const targetName  = (isAdmin && userName)  ? userName  : req.session.user.name;
  const isStanding  = String(deskId).startsWith('S');

  const booking = {
    id:          'bk_' + Date.now(),
    deskId, isStanding, date,
    timeSlot:    timeSlot  || 'allday',
    timeStart:   timeStart || '',
    timeEnd:     timeEnd   || '',
    userEmail:   targetEmail,
    userName:    targetName,
    note:        note || '',
    pinHash:     await hashPin(pin),
    checkedIn:   false,
    checkedInAt: null,
    status:      'active',
    createdBy:   req.session.user.email,
    createdAt:   new Date().toISOString(),
    calendarEventId: null,
  };

  // Google Calendar (skipped in demo mode or if no tokens)
  if (!DEMO_MODE && req.session.user.tokens) {
    try {
      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      auth.setCredentials(req.session.user.tokens);
      const calendar = google.calendar({ version: 'v3', auth });
      const event = await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        resource: {
          summary:     `Desk ${deskId} — ${targetName}`,
          description: note || 'Desk booking via DeskBook',
          start: { date }, end: { date },
          attendees: [{ email: targetEmail }],
        },
      });
      booking.calendarEventId = event.data.id;
    } catch (err) {
      console.warn('Calendar event failed (continuing):', err.message);
    }
  }

  // n8n webhook — booking created
  triggerN8n('booking_created', { booking: { ...booking, pinHash: undefined } });

  bookings.push(booking);
  writeJson(DATA_FILE, bookings);
  res.status(201).json({ ...booking, pinHash: undefined });
});

// ── Bookings — DELETE (requires PIN or admin session) ─────────────────────
app.delete('/api/bookings/:id', async (req, res) => {
  const { pin } = req.body;
  const bookings = readJson(DATA_FILE, []);
  const b = bookings.find(b => b.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });

  const isAdminSession = req.session.user?.isAdmin;

  if (!isAdminSession) {
    // Require PIN for non-admin cancellation
    if (!pin) return res.status(401).json({ error: 'PIN required' });
    const valid = await verifyPin(pin, b.pinHash);
    if (!valid) return res.status(403).json({ error: 'Incorrect PIN' });
  }

  b.status      = 'cancelled';
  b.cancelledAt = new Date().toISOString();
  b.cancelledBy = req.session.user?.email || 'device';

  // Remove Google Calendar event
  if (!DEMO_MODE && b.calendarEventId && req.session.user?.tokens) {
    try {
      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      auth.setCredentials(req.session.user.tokens);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: b.calendarEventId,
      });
    } catch (err) {
      console.warn('Calendar delete failed (continuing):', err.message);
    }
  }

  // n8n webhook — booking cancelled
  triggerN8n('booking_cancelled', { booking: { ...b, pinHash: undefined } });

  writeJson(DATA_FILE, bookings);
  res.json({ success: true });
});

// ── Bookings — PATCH (admin reassign/edit, no PIN needed) ─────────────────
app.patch('/api/bookings/:id', requireAdmin, (req, res) => {
  const bookings = readJson(DATA_FILE, []);
  const b = bookings.find(b => b.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const { userEmail, userName, note, timeSlot } = req.body;
  if (userEmail) b.userEmail = userEmail;
  if (userName)  b.userName  = userName;
  if (note  !== undefined) b.note     = note;
  if (timeSlot)            b.timeSlot = timeSlot;
  b.updatedAt = new Date().toISOString();
  b.updatedBy = req.session.user.email;
  writeJson(DATA_FILE, bookings);
  res.json({ ...b, pinHash: undefined });
});

// ── Check-in (requires PIN) ────────────────────────────────────────────────
app.post('/api/bookings/:id/checkin', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  const bookings = readJson(DATA_FILE, []);
  const b = bookings.find(b => b.id === req.params.id);
  if (!b)              return res.status(404).json({ error: 'Not found' });
  if (b.status !== 'active') return res.status(400).json({ error: 'Booking is not active' });
  if (b.checkedIn)     return res.status(400).json({ error: 'Already checked in' });

  const valid = await verifyPin(pin, b.pinHash);
  if (!valid) return res.status(403).json({ error: 'Incorrect PIN' });

  b.checkedIn   = true;
  b.checkedInAt = new Date().toISOString();

  // n8n webhook — checked in
  triggerN8n('checked_in', { booking: { ...b, pinHash: undefined } });

  writeJson(DATA_FILE, bookings);
  res.json({ success: true, checkedInAt: b.checkedInAt });
});

// ── Device status endpoint (ESP32 polls this) ─────────────────────────────
// GET /api/desk-status/:deskId?date=YYYY-MM-DD
// Returns clean status object — no auth needed, internal network only
app.get('/api/desk-status/:deskId', (req, res) => {
  const { deskId } = req.params;
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const bookings = readJson(DATA_FILE, []);
  const cfg = readJson(CONFIG_FILE, {});

  const active = bookings.filter(b =>
    b.deskId == deskId && b.date === date && b.status === 'active'
  );

  const deskCfg = cfg[deskId] || {};

  res.json({
    deskId,
    date,
    disabled:  deskCfg.disabled || false,
    note:      deskCfg.note || '',
    bookings:  active.map(b => ({
      id:          b.id,
      userName:    b.userName,
      timeSlot:    b.timeSlot || 'allday',
      timeStart:   b.timeStart || '',
      timeEnd:     b.timeEnd   || '',
      checkedIn:   b.checkedIn || false,
      checkedInAt: b.checkedInAt || null,
      note:        b.note || '',
      // Never send pinHash to device
    })),
    available: active.length === 0 && !deskCfg.disabled,
    fullyBooked: active.some(b => b.timeSlot === 'allday') ||
      (active.some(b => b.timeSlot === 'morning') && active.some(b => b.timeSlot === 'afternoon')),
  });
});

// ── Desk config ────────────────────────────────────────────────────────────
app.get('/api/desks/config', (req, res) => {
  res.json(readJson(CONFIG_FILE, {}));
});

app.patch('/api/desks/:deskId/config', requireAdmin, (req, res) => {
  const cfg = readJson(CONFIG_FILE, {});
  cfg[req.params.deskId] = { ...(cfg[req.params.deskId] || {}), ...req.body };
  writeJson(CONFIG_FILE, cfg);
  res.json(cfg[req.params.deskId]);
});

// ── Users (admin) ──────────────────────────────────────────────────────────
app.get('/api/users', requireAdmin, async (req, res) => {
  if (!DEMO_MODE && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
        subject: process.env.GOOGLE_ADMIN_EMAIL,
      });
      const directory = google.admin({ version: 'directory_v1', auth });
      const { data } = await directory.users.list({ domain: process.env.ALLOWED_DOMAIN, maxResults: 200 });
      return res.json(data.users.map(u => ({ email: u.primaryEmail, name: u.name.fullName })));
    } catch (err) {
      console.warn('Directory API failed, falling back:', err.message);
    }
  }
  // Fallback: unique users from booking history
  const bookings = readJson(DATA_FILE, []);
  const users = [...new Map(bookings.map(b => [b.userEmail, { email: b.userEmail, name: b.userName }])).values()];
  res.json(users);
});

// ── n8n webhook helper ─────────────────────────────────────────────────────
async function triggerN8n(event, data) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
    if (!fetch) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }),
    });
  } catch (err) {
    console.warn(`n8n webhook failed for ${event}:`, err.message);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nDeskBook running at http://localhost:${PORT}`);
  console.log(`Mode:         ${DEMO_MODE ? '⚠️  DEMO (no Google Auth)' : '✅ Production (Google OAuth)'}`);
  console.log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured'}`);
  console.log(`n8n webhook:  ${process.env.N8N_WEBHOOK_URL ? 'configured' : 'not configured'}`);
  console.log(`Admin emails: ${ADMIN_EMAILS.length ? ADMIN_EMAILS.join(', ') : 'none set'}\n`);
});
