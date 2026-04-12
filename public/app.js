// ===== LAYOUT DATA (from xlsx) =====
const LAYOUT = {
  desks: [
    // Top cluster pairs (facing each other across aisle)
    { id: 1,  x: 0,   y: 0,   group: "A" }, { id: 2,  x: 1,   y: 0,   group: "A" },
    { id: 3,  x: 0,   y: 1,   group: "A" }, { id: 4,  x: 1,   y: 1,   group: "A" },
    { id: 5,  x: 3,   y: 0,   group: "B" }, { id: 6,  x: 4,   y: 0,   group: "B" },
    { id: 7,  x: 3,   y: 1,   group: "B" },
    { id: 8,  x: 6,   y: 0,   group: "C" }, { id: 9,  x: 7,   y: 0,   group: "C" },
    { id: 10, x: 6,   y: 1,   group: "C" }, { id: 11, x: 7,   y: 1,   group: "C" },
    { id: 12, x: 10,  y: 0,   group: "D" }, { id: 13, x: 11,  y: 0,   group: "D" },
    { id: 14, x: 10,  y: 1,   group: "D" },
    { id: 15, x: 13,  y: 0,   group: "E" }, { id: 16, x: 14,  y: 0,   group: "E" },
    { id: 17, x: 13,  y: 1,   group: "E" }, { id: 18, x: 14,  y: 1,   group: "E" },
    { id: 19, x: 16,  y: 0,   group: "F" }, { id: 20, x: 17,  y: 0,   group: "F" },
    { id: 21, x: 16,  y: 1,   group: "F" }, { id: 22, x: 17,  y: 1,   group: "F" },
    // Side desks
    { id: 24, x: -2,  y: 4,   group: "G" },
    { id: 25, x: -2,  y: 5,   group: "G" },
    // Bottom desk
    { id: 26, x: -2,  y: 8,   group: "H" },
  ],
  standingDesks: [
    { id: "S1", x: 0, y: 8 },
    { id: "S2", x: 2, y: 8 },
    { id: "S3", x: 4, y: 8 },
  ],
  rooms: [
    { label: "Juno\nBoardroom",   x: -6,  y: 0,  w: 3.5, h: 3,  type: "boardroom" },
    { label: "Kapyong",           x: 19,  y: 0,  w: 3,   h: 1.5, type: "meeting" },
    { label: "Passchendaele",     x: 22.5,y: 0,  w: 3.5, h: 1.5, type: "meeting" },
    { label: "Vimy\nBoardroom",   x: 26,  y: 0,  w: 3,   h: 2,  type: "boardroom" },
    { label: "Kandahar",          x: 26,  y: 2.5,w: 3,   h: 1.5, type: "meeting" },
    { label: "Sam's\nOffice",     x: 26,  y: 4.5,w: 3,   h: 2,  type: "office" },
    { label: "Kitchen",           x: 3,   y: 8,  w: 3,   h: 2,  type: "amenity" },
    { label: "Nook",              x: 9,   y: 7,  w: 1.5, h: 1.5, type: "amenity" },
    { label: "Storage",           x: 11,  y: 7,  w: 2,   h: 1.5, type: "amenity" },
    { label: "Ctrl Good\nRoom",   x: 15,  y: 7,  w: 3,   h: 2,  type: "restricted" },
    { label: "IT Room",           x: 18.5,y: 7,  w: 2.5, h: 2,  type: "restricted" },
    { label: "Electrical",        x: 21.5,y: 7,  w: 2.5, h: 1.5, type: "restricted" },
  ]
};

const CELL = 56;  // pixels per grid cell
const PAD = 5;    // padding inside cells
const OFFSET_X = 360; // left offset to center
const OFFSET_Y = 60;  // top offset

// ===== STATE =====
const state = {
  currentDate: new Date(),
  bookings: loadBookings(),
  currentUser: null,
  isAdmin: false,
  zoom: 1,
  view: 'floor',
  deskConfig: loadDeskConfig(),
};

function loadBookings() {
  try { return JSON.parse(localStorage.getItem('deskbooking_bookings') || '[]'); } catch { return []; }
}
function saveBookings() { localStorage.setItem('deskbooking_bookings', JSON.stringify(state.bookings)); }
function loadDeskConfig() {
  const defaults = {};
  [...LAYOUT.desks, ...LAYOUT.standingDesks].forEach(d => {
    defaults[d.id] = { disabled: false, note: '' };
  });
  try {
    const saved = JSON.parse(localStorage.getItem('deskbooking_config') || '{}');
    return { ...defaults, ...saved };
  } catch { return defaults; }
}
function saveDeskConfig() { localStorage.setItem('deskbooking_config', JSON.stringify(state.deskConfig)); }

// ===== DATE HELPERS =====
function dateKey(date) {
  return date.toISOString().split('T')[0];
}
function formatDate(date) {
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function isWeekend(date) { return date.getDay() === 0 || date.getDay() === 6; }

// ===== BOOKING HELPERS =====
function getBookingsForDate(date) {
  return state.bookings.filter(b => b.date === dateKey(date) && b.status === 'active');
}
function getDeskBooking(deskId, date) {
  return getBookingsForDate(date).find(b => b.deskId == deskId);
}
function isMyBooking(booking) {
  return state.currentUser && booking.userEmail === state.currentUser.email;
}

// ===== SVG FLOOR PLAN =====
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function deskColor(deskId, isStanding) {
  const booking = getDeskBooking(deskId, state.currentDate);
  const cfg = state.deskConfig[deskId];
  if (cfg?.disabled) return { fill: '#f1f5f9', stroke: '#94a3b8', text: '#94a3b8' };
  if (booking) {
    if (isMyBooking(booking)) return { fill: '#dbeafe', stroke: '#3b82f6', text: '#1d4ed8' };
    return { fill: '#fee2e2', stroke: '#ef4444', text: '#b91c1c' };
  }
  if (isStanding) return { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' };
  return { fill: '#dcfce7', stroke: '#22c55e', text: '#15803d' };
}

function renderFloor() {
  const svg = document.getElementById('office-svg');
  svg.innerHTML = '';

  const svgW = 29 * CELL + OFFSET_X + 200;
  const svgH = 12 * CELL + OFFSET_Y + 80;
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);

  // Room type colors
  const roomColors = {
    boardroom:  { fill: '#ede9fe', stroke: '#8b5cf6' },
    meeting:    { fill: '#e0f2fe', stroke: '#0ea5e9' },
    office:     { fill: '#fce7f3', stroke: '#ec4899' },
    amenity:    { fill: '#f0fdf4', stroke: '#86efac' },
    restricted: { fill: '#fef9c3', stroke: '#fbbf24' },
  };

  // Draw rooms
  LAYOUT.rooms.forEach(room => {
    const rx = OFFSET_X + room.x * CELL;
    const ry = OFFSET_Y + room.y * CELL;
    const rw = room.w * CELL;
    const rh = room.h * CELL;
    const colors = roomColors[room.type] || roomColors.meeting;

    const rect = svgEl('rect', { x: rx, y: ry, width: rw, height: rh, rx: 8,
      fill: colors.fill, stroke: colors.stroke, 'stroke-width': 1.5, 'stroke-dasharray': '5 3' });
    svg.appendChild(rect);

    // Room label (handle newlines)
    const lines = room.label.split('\n');
    const cy = ry + rh / 2 - (lines.length - 1) * 8;
    lines.forEach((line, i) => {
      const t = svgEl('text', {
        x: rx + rw / 2, y: cy + i * 16,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        fill: colors.stroke, 'font-size': '11', 'font-weight': '600',
        'font-family': 'system-ui, sans-serif'
      });
      t.textContent = line;
      svg.appendChild(t);
    });
  });

  // Draw aisle line hint
  const aisle = svgEl('line', {
    x1: OFFSET_X - CELL, y1: OFFSET_Y + 2.5 * CELL,
    x2: OFFSET_X + 19 * CELL, y2: OFFSET_Y + 2.5 * CELL,
    stroke: '#e2e8f0', 'stroke-width': 1, 'stroke-dasharray': '4 4'
  });
  svg.appendChild(aisle);

  // Draw regular desks
  LAYOUT.desks.forEach(desk => {
    drawDesk(svg, desk.id, OFFSET_X + desk.x * CELL, OFFSET_Y + desk.y * CELL, false);
  });

  // Draw standing desks
  LAYOUT.standingDesks.forEach(desk => {
    drawDesk(svg, desk.id, OFFSET_X + desk.x * CELL, OFFSET_Y + desk.y * CELL, true);
  });
}

function drawDesk(svg, id, px, py, isStanding) {
  const booking = getDeskBooking(id, state.currentDate);
  const cfg = state.deskConfig[id];
  const { fill, stroke, text } = deskColor(id, isStanding);
  const w = CELL - PAD * 2;
  const h = CELL - PAD * 2;

  const g = svgEl('g', { class: 'desk-group', 'data-desk-id': id });

  // Desk background
  const rect = svgEl('rect', {
    class: 'desk-rect',
    x: px + PAD, y: py + PAD, width: w, height: h, rx: 7,
    fill, stroke, 'stroke-width': isStanding ? 2 : 1.5,
    'stroke-dasharray': isStanding ? '5 3' : 'none'
  });
  g.appendChild(rect);

  // Desk number
  const label = svgEl('text', {
    x: px + CELL / 2, y: py + CELL / 2 - 6,
    'text-anchor': 'middle', 'dominant-baseline': 'central',
    fill: text, 'font-size': isStanding ? '13' : '15', 'font-weight': '700',
    'font-family': 'system-ui, sans-serif'
  });
  label.textContent = String(id);
  g.appendChild(label);

  // Booked by initials or standing indicator
  if (booking) {
    const name = booking.userName || booking.userEmail || '?';
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const sub = svgEl('text', {
      x: px + CELL / 2, y: py + CELL / 2 + 10,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: text, 'font-size': '10', 'font-family': 'system-ui, sans-serif'
    });
    sub.textContent = isMyBooking(booking) ? 'you' : initials;
    g.appendChild(sub);
  } else if (isStanding) {
    const icon = svgEl('text', {
      x: px + CELL / 2, y: py + CELL / 2 + 10,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: text, 'font-size': '10', 'font-family': 'system-ui, sans-serif'
    });
    icon.textContent = '▲ stand';
    g.appendChild(icon);
  }

  g.addEventListener('click', () => openDeskModal(id, isStanding));

  // Tooltip
  g.addEventListener('mouseenter', (e) => {
    const tip = document.createElement('div');
    tip.className = 'desk-tooltip';
    tip.id = 'active-tooltip';
    if (cfg?.disabled) {
      tip.textContent = `Desk ${id} — Disabled`;
    } else if (booking) {
      tip.textContent = `Desk ${id} — Booked by ${booking.userName || booking.userEmail}`;
    } else {
      tip.textContent = `Desk ${id}${isStanding ? ' (Standing)' : ''} — Available`;
    }
    tip.style.left = (e.clientX + 12) + 'px';
    tip.style.top = (e.clientY - 28) + 'px';
    document.body.appendChild(tip);
  });
  g.addEventListener('mousemove', (e) => {
    const tip = document.getElementById('active-tooltip');
    if (tip) { tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 28) + 'px'; }
  });
  g.addEventListener('mouseleave', () => {
    document.getElementById('active-tooltip')?.remove();
  });

  svg.appendChild(g);
}

// ===== MODAL =====
function openDeskModal(deskId, isStanding) {
  const booking = getDeskBooking(deskId, state.currentDate);
  const cfg = state.deskConfig[deskId];
  const modal = document.getElementById('booking-modal');
  const content = document.getElementById('modal-content');

  let html = `
    <div class="desk-preview">
      <div class="desk-num">${deskId}</div>
      <div class="desk-type">${isStanding ? 'Standing Desk' : 'Sit/Stand Desk'}</div>
    </div>
    <h3>${booking ? 'Desk Booked' : (cfg?.disabled ? 'Desk Disabled' : 'Book This Desk')}</h3>
    <p class="modal-subtitle">${formatDate(state.currentDate)}</p>`;

  if (cfg?.disabled) {
    html += `<p style="color:var(--text-muted);font-size:13px;">This desk is currently disabled by an admin.</p>`;
    if (cfg.note) html += `<p style="color:var(--text-muted);font-size:12px;margin-top:6px;">Note: ${cfg.note}</p>`;
    if (state.isAdmin) {
      html += `<div class="modal-actions"><button class="btn-primary" onclick="adminEnableDesk('${deskId}')">Re-enable Desk</button></div>`;
    }
  } else if (booking) {
    const mine = isMyBooking(booking);
    html += `
      <div class="modal-info-row"><span class="label">Booked by</span><span>${booking.userName || booking.userEmail}</span></div>
      <div class="modal-info-row"><span class="label">Time</span><span>All day</span></div>
      ${booking.note ? `<div class="modal-info-row"><span class="label">Note</span><span>${booking.note}</span></div>` : ''}`;
    if (mine || state.isAdmin) {
      html += `<div class="modal-actions">
        <button class="btn-danger" onclick="cancelBooking('${booking.id}')">Cancel Booking</button>
        ${state.isAdmin && !mine ? `<button class="btn-ghost" onclick="closeModal()">Close</button>` : ''}
      </div>`;
    }
    if (!mine && state.isAdmin) {
      html += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Admin: reassign this booking</p>
        <div class="modal-field">
          <label>Assign to (email)</label>
          <input type="email" id="reassign-email" placeholder="user@company.com">
        </div>
        <button class="btn-ghost" onclick="adminReassign('${booking.id}')">Reassign</button>
      </div>`;
    }
  } else {
    if (!state.currentUser) {
      html += `<p style="color:var(--text-muted);font-size:13px;">Please sign in to book a desk.</p>
        <div class="modal-actions"><button class="btn-primary" onclick="signIn()">Sign in with Google</button></div>`;
    } else if (isWeekend(state.currentDate)) {
      html += `<p style="color:var(--text-muted);font-size:13px;">Bookings are not available on weekends.</p>`;
    } else {
      // Check if user already has a booking this day
      const existingToday = getBookingsForDate(state.currentDate).find(b => isMyBooking(b));
      if (existingToday && !state.isAdmin) {
        html += `<p style="color:var(--warning);font-size:13px;">You already have desk ${existingToday.deskId} booked for this day.</p>
          <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`;
      } else {
        html += `
          <div class="modal-field">
            <label>Date</label>
            <input type="date" id="book-date" value="${dateKey(state.currentDate)}" min="${dateKey(new Date())}">
          </div>
          <div class="modal-field">
            <label>Note (optional)</label>
            <input type="text" id="book-note" placeholder="e.g. Remote day, need dual monitors">
          </div>
          ${state.isAdmin ? `<div class="modal-field">
            <label>Book for (email)</label>
            <input type="email" id="book-for" placeholder="${state.currentUser.email}" value="${state.currentUser.email}">
          </div>` : ''}
          <div class="modal-actions">
            <button class="btn-primary" onclick="confirmBooking('${deskId}', ${isStanding})">Confirm Booking</button>
            <button class="btn-ghost" onclick="closeModal()">Cancel</button>
          </div>`;
      }
    }
  }

  content.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('booking-modal').classList.add('hidden');
  document.getElementById('active-tooltip')?.remove();
}

// ===== BOOKING ACTIONS =====
window.confirmBooking = function(deskId, isStanding) {
  const dateInput = document.getElementById('book-date');
  const noteInput = document.getElementById('book-note');
  const bookForInput = document.getElementById('book-for');
  const date = dateInput ? dateInput.value : dateKey(state.currentDate);

  const targetEmail = bookForInput ? bookForInput.value : state.currentUser.email;
  const targetName = bookForInput && bookForInput.value !== state.currentUser.email ? bookForInput.value : state.currentUser.name;

  // Check for conflict
  const conflict = state.bookings.find(b => b.deskId == deskId && b.date === date && b.status === 'active');
  if (conflict) { showToast('This desk is already booked for that date', 'error'); return; }

  const booking = {
    id: 'bk_' + Date.now(),
    deskId, isStanding, date,
    userEmail: targetEmail,
    userName: targetName,
    note: noteInput?.value || '',
    createdAt: new Date().toISOString(),
    status: 'active',
    createdBy: state.currentUser.email,
  };

  state.bookings.push(booking);
  saveBookings();
  closeModal();
  renderFloor();
  showToast(`Desk ${deskId} booked for ${date}`, 'success');

  // In production: POST to /api/bookings + Google Calendar event
};

window.cancelBooking = function(bookingId) {
  const b = state.bookings.find(b => b.id === bookingId);
  if (!b) return;
  b.status = 'cancelled';
  saveBookings();
  closeModal();
  renderFloor();
  renderBookingsList();
  showToast('Booking cancelled', 'success');
  // In production: DELETE /api/bookings/:id + remove calendar event
};

window.adminReassign = function(bookingId) {
  const email = document.getElementById('reassign-email')?.value;
  if (!email) return;
  const b = state.bookings.find(b => b.id === bookingId);
  if (!b) return;
  b.userEmail = email;
  b.userName = email;
  saveBookings();
  closeModal();
  renderFloor();
  showToast('Booking reassigned', 'success');
};

window.adminEnableDesk = function(deskId) {
  state.deskConfig[deskId] = { disabled: false, note: '' };
  saveDeskConfig();
  closeModal();
  renderFloor();
  showToast(`Desk ${deskId} re-enabled`, 'success');
};

// ===== MY BOOKINGS VIEW =====
function renderBookingsList() {
  const container = document.getElementById('bookings-list');
  if (!state.currentUser) {
    container.innerHTML = `<div class="empty-state"><strong>Sign in to view your bookings</strong><p>Use the Sign in button in the top right</p></div>`;
    return;
  }
  const mine = state.bookings
    .filter(b => b.userEmail === state.currentUser.email && b.status === 'active')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!mine.length) {
    container.innerHTML = `<div class="empty-state"><strong>No upcoming bookings</strong><p>Click a desk on the floor plan to book</p></div>`;
    return;
  }

  container.innerHTML = mine.map(b => `
    <div class="booking-card">
      <div class="booking-card-header">
        <div class="booking-desk">Desk ${b.deskId}</div>
        <span class="booking-badge ${b.isStanding ? 'standing' : ''}">${b.isStanding ? 'Standing' : 'Regular'}</span>
      </div>
      <div class="booking-date">${new Date(b.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      ${b.note ? `<div class="booking-user">${b.note}</div>` : ''}
      <div class="booking-actions">
        <button class="btn-cancel" onclick="cancelBooking('${b.id}')">Cancel</button>
      </div>
    </div>`).join('');
}

// ===== ADMIN VIEW =====
function renderAdmin(tab = 'all-bookings') {
  const content = document.getElementById('admin-content');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  if (tab === 'all-bookings') {
    const bookings = state.bookings.filter(b => b.status === 'active').sort((a, b) => a.date.localeCompare(b.date));
    content.innerHTML = `
      <div class="table-card">
        <div class="table-toolbar">
          <input class="search-input" id="booking-search" placeholder="Search by desk, user, date..." oninput="filterBookingsTable(this.value)">
          <button class="btn-ghost small" onclick="exportBookings()">Export CSV</button>
        </div>
        <table class="admin-table" id="bookings-table">
          <thead><tr>
            <th>Desk</th><th>Type</th><th>Date</th><th>User</th><th>Note</th><th>Booked by</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${bookings.map(b => `<tr data-search="${b.deskId} ${b.userEmail} ${b.userName} ${b.date}">
              <td><strong>${b.deskId}</strong></td>
              <td><span class="status-pill ${b.isStanding ? 'standing' : 'active'}">${b.isStanding ? 'Standing' : 'Regular'}</span></td>
              <td>${b.date}</td>
              <td>${b.userName || b.userEmail}</td>
              <td style="color:var(--text-muted)">${b.note || '—'}</td>
              <td style="color:var(--text-muted);font-size:12px">${b.createdBy || b.userEmail}</td>
              <td><button class="action-link danger" onclick="cancelBooking('${b.id}');renderAdmin('all-bookings')">Cancel</button></td>
            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No active bookings</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  else if (tab === 'desks') {
    const allDesks = [
      ...LAYOUT.desks.map(d => ({ ...d, isStanding: false })),
      ...LAYOUT.standingDesks.map(d => ({ ...d, isStanding: true }))
    ];
    content.innerHTML = `
      <div class="table-card">
        <table class="admin-table">
          <thead><tr><th>Desk</th><th>Type</th><th>Status</th><th>Today's booking</th><th>Note</th><th>Actions</th></tr></thead>
          <tbody>
            ${allDesks.map(d => {
              const cfg = state.deskConfig[d.id] || {};
              const todayBk = getDeskBooking(d.id, state.currentDate);
              return `<tr>
                <td><strong>${d.id}</strong></td>
                <td><span class="status-pill ${d.isStanding ? 'standing' : 'active'}">${d.isStanding ? 'Standing' : 'Regular'}</span></td>
                <td><span class="status-pill ${cfg.disabled ? 'disabled' : 'enabled'}">${cfg.disabled ? 'Disabled' : 'Enabled'}</span></td>
                <td>${todayBk ? `${todayBk.userName || todayBk.userEmail}` : '<span style="color:var(--text-muted)">Free</span>'}</td>
                <td style="color:var(--text-muted)">${cfg.note || '—'}</td>
                <td style="display:flex;gap:8px">
                  <button class="action-link" onclick="adminToggleDesk('${d.id}', ${!cfg.disabled})">${cfg.disabled ? 'Enable' : 'Disable'}</button>
                  <button class="action-link" onclick="adminSetDeskNote('${d.id}')">Note</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  else if (tab === 'users') {
    const users = [...new Set(state.bookings.filter(b => b.status === 'active').map(b => b.userEmail))];
    const upcoming = state.bookings.filter(b => b.status === 'active' && b.date >= dateKey(new Date()));
    content.innerHTML = `
      <div class="table-card">
        <table class="admin-table">
          <thead><tr><th>User</th><th>Total bookings</th><th>Upcoming</th><th>Actions</th></tr></thead>
          <tbody>
            ${users.length ? users.map(email => {
              const total = state.bookings.filter(b => b.userEmail === email && b.status === 'active').length;
              const up = upcoming.filter(b => b.userEmail === email).length;
              return `<tr>
                <td>${email}</td><td>${total}</td><td>${up}</td>
                <td><button class="action-link danger" onclick="adminCancelUserBookings('${email}')">Cancel all upcoming</button></td>
              </tr>`;
            }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">No users yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }
}

window.filterBookingsTable = function(q) {
  document.querySelectorAll('#bookings-table tbody tr[data-search]').forEach(row => {
    row.style.display = row.dataset.search.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
};

window.adminToggleDesk = function(deskId, disable) {
  state.deskConfig[deskId] = { ...state.deskConfig[deskId], disabled: disable };
  saveDeskConfig();
  renderAdmin('desks');
  renderFloor();
  showToast(`Desk ${deskId} ${disable ? 'disabled' : 'enabled'}`, 'success');
};

window.adminSetDeskNote = function(deskId) {
  const note = prompt(`Note for desk ${deskId}:`, state.deskConfig[deskId]?.note || '');
  if (note !== null) {
    state.deskConfig[deskId] = { ...state.deskConfig[deskId], note };
    saveDeskConfig();
    renderAdmin('desks');
  }
};

window.adminCancelUserBookings = function(email) {
  if (!confirm(`Cancel all upcoming bookings for ${email}?`)) return;
  state.bookings
    .filter(b => b.userEmail === email && b.status === 'active' && b.date >= dateKey(new Date()))
    .forEach(b => b.status = 'cancelled');
  saveBookings();
  renderAdmin('users');
  renderFloor();
  showToast(`Cancelled all upcoming bookings for ${email}`, 'success');
};

window.exportBookings = function() {
  const active = state.bookings.filter(b => b.status === 'active');
  const csv = ['Desk,Type,Date,User Email,User Name,Note,Created By,Created At'].concat(
    active.map(b => [b.deskId, b.isStanding?'Standing':'Regular', b.date, b.userEmail, b.userName, b.note, b.createdBy, b.createdAt].join(','))
  ).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = `bookings-${dateKey(new Date())}.csv`;
  a.click();
};

// ===== AUTH (mock for demo, replace with Google OAuth) =====
window.signIn = function() {
  // In production: redirect to /auth/google which uses OAuth2
  // For demo: simulate login
  const email = prompt('Enter your work email (demo):');
  if (!email) return;
  const name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
  state.currentUser = { email, name, avatar: '' };
  state.isAdmin = email.startsWith('admin') || email.includes('+admin');
  updateUserUI();
  renderFloor();
  renderBookingsList();
  if (state.isAdmin) document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  showToast(`Welcome, ${name}!`);
  closeModal();
};

window.signOut = function() {
  state.currentUser = null;
  state.isAdmin = false;
  updateUserUI();
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  renderFloor();
  renderBookingsList();
  showToast('Signed out');
};

function updateUserUI() {
  const signInBtn = document.getElementById('sign-in-btn');
  const userInfo = document.getElementById('user-info');
  if (state.currentUser) {
    signInBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');
    document.getElementById('user-name').textContent = state.currentUser.name;
    const avatar = document.getElementById('user-avatar');
    if (state.currentUser.avatar) {
      avatar.src = state.currentUser.avatar;
      avatar.style.display = '';
    } else {
      avatar.style.display = 'none';
    }
  } else {
    signInBtn.classList.remove('hidden');
    userInfo.classList.add('hidden');
  }
}

// ===== NAV & DATE =====
function setView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  if (view === 'list') renderBookingsList();
  if (view === 'admin') renderAdmin();
}

function updateDateDisplay() {
  const el = document.getElementById('current-date-display');
  const today = dateKey(new Date());
  const d = dateKey(state.currentDate);
  if (d === today) el.textContent = 'Today, ' + state.currentDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  else if (d === dateKey(new Date(Date.now() + 86400000))) el.textContent = 'Tomorrow, ' + state.currentDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  else el.textContent = formatDate(state.currentDate);
}

function changeDate(delta) {
  state.currentDate = new Date(state.currentDate.getTime() + delta * 86400000);
  updateDateDisplay();
  renderFloor();
}

// ===== ZOOM =====
function setZoom(z) {
  state.zoom = Math.min(2, Math.max(0.4, z));
  document.getElementById('floor-viewport').style.transform = `scale(${state.zoom})`;
  document.getElementById('zoom-level').textContent = Math.round(state.zoom * 100) + '%';
}

// ===== TOAST =====
function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateDateDisplay();
  renderFloor();

  document.getElementById('prev-day').addEventListener('click', () => changeDate(-1));
  document.getElementById('next-day').addEventListener('click', () => changeDate(1));
  document.getElementById('sign-in-btn').addEventListener('click', signIn);
  document.getElementById('sign-out-btn').addEventListener('click', signOut);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('booking-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => renderAdmin(btn.dataset.tab));
  });

  document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom + 0.1));
  document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom - 0.1));
  document.getElementById('zoom-fit').addEventListener('click', () => {
    const container = document.getElementById('floor-container');
    const svg = document.getElementById('office-svg');
    const fz = Math.min(container.clientWidth / svg.getAttribute('width'), container.clientHeight / svg.getAttribute('height')) * 0.92;
    setZoom(fz);
  });

  // Auto fit on load
  setTimeout(() => {
    const container = document.getElementById('floor-container');
    const svg = document.getElementById('office-svg');
    const fz = Math.min(container.clientWidth / svg.getAttribute('width'), container.clientHeight / svg.getAttribute('height')) * 0.90;
    setZoom(Math.min(1, fz));
  }, 100);
});
