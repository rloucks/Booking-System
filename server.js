require('dotenv').config();
/**
 * DeskBook Server
 * Node.js + Express backend
 * Serves the frontend and exposes REST API for bookings + Google Workspace integration
 *
 * Setup:
 *   npm install
 *   cp .env.example .env   # fill in your Google OAuth credentials
 *   node server.js
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// ── Ensure data directory ──────────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Google OAuth2 Setup ────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`
);

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
];

// Admin emails — set in .env as ADMIN_EMAILS=a@co.com,b@co.com
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// ── Auth Middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.session.user.isAdmin) return res.status(403).json({ error: 'Admin required' });
  next();
}

// ── Auth Routes ────────────────────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    // Optional: restrict to your Google Workspace domain
    const allowedDomain = process.env.ALLOWED_DOMAIN;
    if (allowedDomain && !profile.email.endsWith('@' + allowedDomain)) {
      return res.redirect('/?error=unauthorized_domain');
    }

    req.session.user = {
      email: profile.email,
      name: profile.name,
      avatar: profile.picture,
      isAdmin: ADMIN_EMAILS.includes(profile.email.toLowerCase()),
      tokens,
    };

    res.redirect('/');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const { email, name, avatar, isAdmin } = req.session.user;
  res.json({ user: { email, name, avatar, isAdmin } });
});

// ── Bookings API ───────────────────────────────────────────────────────────
app.get('/api/bookings', requireAuth, (req, res) => {
  const bookings = readJson(DATA_FILE, []);
  const { date, deskId } = req.query;
  let result = bookings.filter(b => b.status === 'active');
  if (date) result = result.filter(b => b.date === date);
  if (deskId) result = result.filter(b => b.deskId == deskId);
  // Non-admins only see their own bookings in list view, but all bookings for floor display
  res.json(result);
});

app.post('/api/bookings', requireAuth, async (req, res) => {
  const { deskId, date, note, userEmail, userName } = req.body;
  if (!deskId || !date) return res.status(400).json({ error: 'deskId and date required' });

  const bookings = readJson(DATA_FILE, []);

  // Check conflict
  const conflict = bookings.find(b => b.deskId == deskId && b.date === date && b.status === 'active');
  if (conflict) return res.status(409).json({ error: 'Desk already booked for this date' });

  // Non-admins can only book for themselves
  const isAdmin = req.session.user.isAdmin;
  const targetEmail = (isAdmin && userEmail) ? userEmail : req.session.user.email;
  const targetName  = (isAdmin && userName)  ? userName  : req.session.user.name;

  const isStanding = String(deskId).startsWith('S');

  const booking = {
    id: 'bk_' + Date.now(),
    deskId, isStanding, date,
    userEmail: targetEmail,
    userName: targetName,
    note: note || '',
    createdBy: req.session.user.email,
    createdAt: new Date().toISOString(),
    status: 'active',
    calendarEventId: null,
  };

  // Create Google Calendar event
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials(req.session.user.tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    const event = await calendar.events.insert({
      calendarId,
      resource: {
        summary: `Desk ${deskId} — ${targetName}`,
        description: note || `Desk booking via DeskBook`,
        start: { date },
        end: { date },
        attendees: [{ email: targetEmail }],
      }
    });
    booking.calendarEventId = event.data.id;
  } catch (err) {
    console.warn('Calendar event creation failed (continuing):', err.message);
  }

  bookings.push(booking);
  writeJson(DATA_FILE, bookings);
  res.status(201).json(booking);
});

app.delete('/api/bookings/:id', requireAuth, async (req, res) => {
  const bookings = readJson(DATA_FILE, []);
  const b = bookings.find(b => b.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });

  // Only admin or the booking owner can cancel
  if (!req.session.user.isAdmin && b.userEmail !== req.session.user.email)
    return res.status(403).json({ error: 'Not authorized' });

  b.status = 'cancelled';
  b.cancelledAt = new Date().toISOString();
  b.cancelledBy = req.session.user.email;

  // Remove Google Calendar event
  if (b.calendarEventId) {
    try {
      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      auth.setCredentials(req.session.user.tokens);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', eventId: b.calendarEventId });
    } catch (err) {
      console.warn('Calendar event deletion failed (continuing):', err.message);
    }
  }

  writeJson(DATA_FILE, bookings);
  res.json({ success: true });
});

// Admin: reassign a booking
app.patch('/api/bookings/:id', requireAdmin, (req, res) => {
  const bookings = readJson(DATA_FILE, []);
  const b = bookings.find(b => b.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const { userEmail, userName, note } = req.body;
  if (userEmail) b.userEmail = userEmail;
  if (userName)  b.userName  = userName;
  if (note !== undefined) b.note = note;
  b.updatedAt = new Date().toISOString();
  b.updatedBy = req.session.user.email;
  writeJson(DATA_FILE, bookings);
  res.json(b);
});

// ── Desk Config API ────────────────────────────────────────────────────────
app.get('/api/desks/config', (req, res) => {
  res.json(readJson(CONFIG_FILE, {}));
});

app.patch('/api/desks/:deskId/config', requireAdmin, (req, res) => {
  const cfg = readJson(CONFIG_FILE, {});
  cfg[req.params.deskId] = { ...(cfg[req.params.deskId] || {}), ...req.body };
  writeJson(CONFIG_FILE, cfg);
  res.json(cfg[req.params.deskId]);
});

// ── Google Directory: list workspace users (admin only) ───────────────────
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: process.env.GOOGLE_ADMIN_EMAIL,
    });
    const directory = google.admin({ version: 'directory_v1', auth });
    const { data } = await directory.users.list({ domain: process.env.ALLOWED_DOMAIN, maxResults: 200 });
    res.json(data.users.map(u => ({ email: u.primaryEmail, name: u.name.fullName })));
  } catch (err) {
    console.warn('Directory API failed:', err.message);
    // Fallback: return unique users from bookings
    const bookings = readJson(DATA_FILE, []);
    const users = [...new Map(bookings.map(b => [b.userEmail, { email: b.userEmail, name: b.userName }])).values()];
    res.json(users);
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`DeskBook running at http://localhost:${PORT}`);
  console.log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'NOT configured — set .env'}`);
});
