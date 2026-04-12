# DeskBook — Setup Guide

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
nano .env  # fill in your Google credentials

# 3. Run (dev)
npm run dev

# 4. Run (production)
npm start
```

---

## Google Cloud Console Setup

### 1. Create OAuth Credentials
1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable APIs: **Google Calendar API**, **Admin SDK Directory API**, **Google OAuth2 API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs**
5. Application type: **Web application**
6. Authorized redirect URIs: `https://yourdomain.com/auth/google/callback`
7. Copy Client ID and Secret into `.env`

### 2. Configure OAuth Consent Screen
1. **APIs & Services → OAuth consent screen**
2. User type: **Internal** (restricts to your Workspace domain automatically)
3. App name: DeskBook
4. Add scopes: `openid`, `email`, `profile`, `calendar.events`

### 3. (Optional) Service Account for Directory API
To enable user autocomplete from Google Workspace:
1. **Credentials → Create Credentials → Service Account**
2. Download the JSON key → save as `service-account-key.json`
3. In Google Workspace Admin → Security → API Controls → Domain-wide delegation
4. Add your service account client ID with scope:
   `https://www.googleapis.com/auth/admin.directory.user.readonly`

---

## Linux Server Deployment (Nginx + systemd)

### Nginx config (`/etc/nginx/sites-available/deskbook`)
```nginx
server {
    listen 80;
    server_name desks.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name desks.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/desks.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/desks.yourcompany.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd service (`/etc/systemd/system/deskbook.service`)
```ini
[Unit]
Description=DeskBook Desk Booking System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/deskbook
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/opt/deskbook/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable deskbook
sudo systemctl start deskbook
sudo certbot --nginx -d desks.yourcompany.com
```

---

## ESP32-S2 Integration (Phase 2)

The device calls two endpoints:

```
GET /api/bookings?date=YYYY-MM-DD&deskId=<N>
→ Returns booking status for this desk today

POST /api/bookings
Body: { deskId, date, userEmail, userName }
→ Creates a booking (requires device auth token)
```

For device auth, add a `DEVICE_TOKEN` to `.env` and check `req.headers['x-device-token']` in the API middleware.

---

## File Structure
```
desk-booking/
├── public/           # Frontend (served statically)
│   ├── index.html
│   ├── style.css
│   └── app.js        # Floor plan, booking UI, admin panel
├── data/             # Auto-created at runtime
│   ├── bookings.json # All bookings
│   └── config.json   # Desk enable/disable config
├── server.js         # Express server + Google API integration
├── package.json
├── .env.example
└── README.md
```
