// ===== LAYOUT DATA =====
const LAYOUT = {
  desks: [
    { id: 1,  x: 0, y: 0, group:"A" }, { id: 2,  x: 1, y: 0, group:"A" },
    { id: 3,  x: 0, y: 1, group:"A" }, { id: 4,  x: 1, y: 1, group:"A" },
    { id: 5,  x: 3, y: 0, group:"B" }, { id: 6,  x: 4, y: 0, group:"B" },
    { id: 7,  x: 3, y: 1, group:"B" },
    { id: 8,  x: 6, y: 0, group:"C" }, { id: 9,  x: 7, y: 0, group:"C" },
    { id: 10, x: 6, y: 1, group:"C" }, { id: 11, x: 7, y: 1, group:"C" },
    { id: 12, x: 10, y: 0, group:"D" }, { id: 13, x: 11, y: 0, group:"D" },
    { id: 14, x: 10, y: 1, group:"D" },
    { id: 15, x: 13, y: 0, group:"E" }, { id: 16, x: 14, y: 0, group:"E" },
    { id: 17, x: 13, y: 1, group:"E" }, { id: 18, x: 14, y: 1, group:"E" },
    { id: 19, x: 16, y: 0, group:"F" }, { id: 20, x: 17, y: 0, group:"F" },
    { id: 21, x: 16, y: 1, group:"F" }, { id: 22, x: 17, y: 1, group:"F" },
    { id: 24, x: 0, y: 4, group:"G" }, { id: 25, x: 1, y: 4, group:"G" },
    { id: 26, x: 0, y: 7, group:"H" },
  ],
  standingDesks: [
    { id: "S1", x: 3, y: 7 },
    { id: "S2", x: 5, y: 7 },
    { id: "S3", x: 7, y: 7 },
  ],
  rooms: [
    { label: "Sam's Office", x: 20, y: 0,  w: 3,   h: 2.5, type: "office"     },
    { label: "Kitchen",      x: 10, y: 7,  w: 3,   h: 2,   type: "amenity"    },
    { label: "IT Room",      x: 14, y: 6,  w: 2.5, h: 2,   type: "restricted" },
  ]
};

const CELL = 72, PAD = 6, OFFSET_X = 40, OFFSET_Y = 40;

const TIME_SLOTS = [
  { value: 'allday',    label: 'All Day'                },
  { value: 'morning',   label: 'Morning  (8am – 12pm)'  },
  { value: 'afternoon', label: 'Afternoon (12pm – 5pm)' },
  { value: 'custom',    label: 'Custom time…'            },
];

// ===== STATE =====
const state = {
  currentDate: new Date(),
  bookings: [],
  currentUser: null,
  isAdmin: false,
  zoom: 1,
  view: 'floor',
  deskConfig: {},
  apiAvailable: false,
  demoMode: false,
};

// ===== API =====
async function apiFetch(path, opts = {}) {
  console.debug('[DeskBook]', opts.method || 'GET', path);
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error('[DeskBook] API error', path, res.status, err.error);
    throw new Error(err.error || res.statusText);
  }
  const data = await res.json();
  console.debug('[DeskBook] ✓', path, data);
  return data;
}

async function loadData() {
  console.log('[DeskBook] Loading data...');
  try {
    const me = await apiFetch('/api/me');
    state.apiAvailable = true;
    state.demoMode = me.demoMode || false;
    console.log('[DeskBook] Server mode:', state.demoMode ? 'DEMO' : 'Production', '| User:', me.user?.email || 'not logged in');
    const [config, bookings] = await Promise.all([
      apiFetch('/api/desks/config'),
      Promise.resolve([]),
    ]);
    state.deskConfig = config;
    state.bookings = bookings;
    if (me.user) {
      state.currentUser = me.user;
      state.isAdmin = me.user.isAdmin;
      updateUserUI();
      if (state.isAdmin) showAdminNav();
      // Load bookings now that we're authenticated
      state.bookings = await apiFetch('/api/bookings');
    }
    // Update sign-in button label for demo mode
    const btn = document.getElementById('sign-in-btn');
    if (btn && state.demoMode) btn.textContent = 'Sign in (Demo)';
  } catch {
    state.apiAvailable = false;
    state.demoMode = true;
    try { state.bookings   = JSON.parse(localStorage.getItem('db_bookings') || '[]'); } catch { state.bookings = []; }
    try { state.deskConfig = JSON.parse(localStorage.getItem('db_config')   || '{}'); } catch { state.deskConfig = {}; }
    const btn = document.getElementById('sign-in-btn');
    if (btn) btn.textContent = 'Sign in (Demo)';
  }
}

async function saveBookingApi(booking) {
  if (state.apiAvailable) {
    const saved = await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(booking) });
    state.bookings = await apiFetch('/api/bookings');
    return saved;
  }
  state.bookings.push({ ...booking, pinHash: undefined });
  localStorage.setItem('db_bookings', JSON.stringify(state.bookings));
  return booking;
}

async function deleteBookingApi(id, pin) {
  if (state.apiAvailable) {
    await apiFetch(`/api/bookings/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    });
    state.bookings = await apiFetch('/api/bookings');
  } else {
    const b = state.bookings.find(b => b.id === id);
    if (b) b.status = 'cancelled';
    localStorage.setItem('db_bookings', JSON.stringify(state.bookings));
  }
}

async function patchDeskConfig(deskId, cfg) {
  state.deskConfig[deskId] = { ...(state.deskConfig[deskId] || {}), ...cfg };
  if (state.apiAvailable) {
    await apiFetch(`/api/desks/${deskId}/config`, { method: 'PATCH', body: JSON.stringify(cfg) });
  } else {
    localStorage.setItem('db_config', JSON.stringify(state.deskConfig));
  }
}

// ===== DATE / TIME =====
function dateKey(d) { return d.toISOString().split('T')[0]; }
function formatDate(d) { return d.toLocaleDateString('en-CA', { weekday:'short', month:'short', day:'numeric', year:'numeric' }); }
function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
function formatSlot(b) {
  if (!b.timeSlot || b.timeSlot === 'allday')   return 'All Day';
  if (b.timeSlot === 'morning')                  return 'Morning (8am–12pm)';
  if (b.timeSlot === 'afternoon')                return 'Afternoon (12pm–5pm)';
  if (b.timeSlot === 'custom')                   return `${b.timeStart||'?'} – ${b.timeEnd||'?'}`;
  return b.timeSlot;
}

// ===== BOOKING HELPERS =====
function dayBookings(date)         { return state.bookings.filter(b => b.date === dateKey(date) && b.status === 'active'); }
function deskDayBookings(id, date) { return dayBookings(date).filter(b => b.deskId == id); }
function isMyBooking(b)            { return state.currentUser && b.userEmail === state.currentUser.email; }
function deskFullyBooked(id, date) {
  const bks = deskDayBookings(id, date);
  return bks.some(b => b.timeSlot === 'allday' || !b.timeSlot) ||
    (bks.some(b => b.timeSlot === 'morning') && bks.some(b => b.timeSlot === 'afternoon'));
}

// ===== SVG =====
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k, v));
  return e;
}

function deskColors(id, isStanding) {
  const cfg = state.deskConfig[id] || {};
  if (cfg.disabled) return { fill:'#f1f5f9', stroke:'#94a3b8', text:'#94a3b8' };
  const bks = deskDayBookings(id, state.currentDate);
  if (bks.find(b => isMyBooking(b))) return { fill:'#dbeafe', stroke:'#3b82f6', text:'#1d4ed8' };
  if (deskFullyBooked(id, state.currentDate)) return { fill:'#fee2e2', stroke:'#ef4444', text:'#b91c1c' };
  if (bks.length) return { fill:'#fef9c3', stroke:'#ca8a04', text:'#92400e' };
  if (isStanding) return { fill:'#fef3c7', stroke:'#f59e0b', text:'#92400e' };
  return { fill:'#dcfce7', stroke:'#22c55e', text:'#15803d' };
}

function renderFloor() {
  const svg = document.getElementById('office-svg');
  svg.innerHTML = '';
  svg.setAttribute('width',  23 * CELL + OFFSET_X + 60);
  svg.setAttribute('height', 10 * CELL + OFFSET_Y + 40);

  const rc = { office:{fill:'#fdf2f8',stroke:'#d8b4fe'}, amenity:{fill:'#f0fdf4',stroke:'#86efac'}, restricted:{fill:'#fefce8',stroke:'#fde047'} };
  LAYOUT.rooms.forEach(r => {
    const rx=OFFSET_X+r.x*CELL, ry=OFFSET_Y+r.y*CELL, rw=r.w*CELL, rh=r.h*CELL;
    const c = rc[r.type]||rc.amenity;
    svg.appendChild(el('rect',{x:rx,y:ry,width:rw,height:rh,rx:8,fill:c.fill,stroke:c.stroke,'stroke-width':1,'stroke-dasharray':'4 3'}));
    r.label.split('\n').forEach((line,i) => {
      const t = el('text',{x:rx+rw/2, y:ry+rh/2+(i-(r.label.split('\n').length-1)/2)*15,
        'text-anchor':'middle','dominant-baseline':'central',fill:'#a0a0a0','font-size':'11','font-family':'system-ui,sans-serif'});
      t.textContent=line; svg.appendChild(t);
    });
  });

  svg.appendChild(el('line',{x1:OFFSET_X,y1:OFFSET_Y+2.5*CELL,x2:OFFSET_X+19*CELL,y2:OFFSET_Y+2.5*CELL,stroke:'#e2e8f0','stroke-width':1.5,'stroke-dasharray':'5 4'}));

  const stlbl = el('text',{x:OFFSET_X,y:OFFSET_Y+6.5*CELL,fill:'#94a3b8','font-size':'11','font-family':'system-ui,sans-serif','font-style':'italic'});
  stlbl.textContent='Standing desks'; svg.appendChild(stlbl);

  LAYOUT.desks.forEach(d         => drawDesk(svg, d.id, OFFSET_X+d.x*CELL, OFFSET_Y+d.y*CELL, false));
  LAYOUT.standingDesks.forEach(d => drawDesk(svg, d.id, OFFSET_X+d.x*CELL, OFFSET_Y+d.y*CELL, true));
}

function drawDesk(svg, id, px, py, isStanding) {
  const bks = deskDayBookings(id, state.currentDate);
  const { fill, stroke, text } = deskColors(id, isStanding);
  const w=CELL-PAD*2, h=CELL-PAD*2;
  const g = el('g',{class:'desk-group','data-desk-id':id});

  const hasMorn = bks.some(b=>b.timeSlot==='morning');
  const hasAftn = bks.some(b=>b.timeSlot==='afternoon');
  const hasAll  = bks.some(b=>!b.timeSlot||b.timeSlot==='allday');

  if (hasMorn && !hasAftn && !hasAll) {
    g.appendChild(el('rect',{x:px+PAD,y:py+PAD,width:w/2,height:h,rx:7,fill:'#fee2e2',stroke:'none'}));
    g.appendChild(el('rect',{x:px+PAD+w/2,y:py+PAD,width:w/2,height:h,rx:7,fill:'#dcfce7',stroke:'none'}));
  } else if (hasAftn && !hasMorn && !hasAll) {
    g.appendChild(el('rect',{x:px+PAD,y:py+PAD,width:w/2,height:h,rx:7,fill:'#dcfce7',stroke:'none'}));
    g.appendChild(el('rect',{x:px+PAD+w/2,y:py+PAD,width:w/2,height:h,rx:7,fill:'#fee2e2',stroke:'none'}));
  }

  g.appendChild(el('rect',{class:'desk-rect',x:px+PAD,y:py+PAD,width:w,height:h,rx:7,
    fill:(hasMorn||hasAftn)&&!hasAll?'none':fill, stroke,'stroke-width':isStanding?2:1.5,
    'stroke-dasharray':isStanding?'5 3':'none'}));

  const ly = bks.length ? py+CELL/2-10 : py+CELL/2;
  const lbl = el('text',{x:px+CELL/2,y:ly,'text-anchor':'middle','dominant-baseline':'central',
    fill:text,'font-size':'17','font-weight':'700','font-family':'system-ui,sans-serif'});
  lbl.textContent=String(id); g.appendChild(lbl);

  if (bks.length) {
    const myBk = bks.find(b=>isMyBooking(b));
    const sub = el('text',{x:px+CELL/2,y:py+CELL/2+12,'text-anchor':'middle','dominant-baseline':'central',
      fill:text,'font-size':'10','font-family':'system-ui,sans-serif'});
    if (myBk) sub.textContent = myBk.timeSlot==='allday'?'you':`you(${myBk.timeSlot==='morning'?'AM':'PM'})`;
    else { const nm=bks[0].userName||bks[0].userEmail||'?'; sub.textContent=nm.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(); }
    g.appendChild(sub);
    // Check-in indicator
    if (bks.some(b=>b.checkedIn)) {
      const ci = el('text',{x:px+CELL-PAD-2,y:py+PAD+10,'text-anchor':'end','dominant-baseline':'central',
        fill:'#16a34a','font-size':'11','font-family':'system-ui,sans-serif'});
      ci.textContent='✓'; g.appendChild(ci);
    }
  } else if (isStanding) {
    const sub = el('text',{x:px+CELL/2,y:py+CELL/2+14,'text-anchor':'middle','dominant-baseline':'central',
      fill:text,'font-size':'10','font-family':'system-ui,sans-serif'});
    sub.textContent='▲ stand'; g.appendChild(sub);
  }

  g.addEventListener('click', () => openDeskModal(id, isStanding));
  g.addEventListener('mouseenter', e => {
    const tip=document.createElement('div'); tip.className='desk-tooltip'; tip.id='active-tooltip';
    const cfg=state.deskConfig[id]||{};
    if (cfg.disabled) tip.textContent=`Desk ${id} — Disabled`;
    else if (bks.length) tip.textContent=`Desk ${id} — ${bks.map(b=>`${b.userName||b.userEmail} (${formatSlot(b)})`).join(', ')}`;
    else tip.textContent=`Desk ${id}${isStanding?' (Standing)':''} — Available`;
    tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-28)+'px';
    document.body.appendChild(tip);
  });
  g.addEventListener('mousemove', e => {
    const tip=document.getElementById('active-tooltip');
    if(tip){tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-28)+'px';}
  });
  g.addEventListener('mouseleave', () => document.getElementById('active-tooltip')?.remove());
  svg.appendChild(g);
}

// ===== MODAL =====
function openDeskModal(deskId, isStanding) {
  const bks  = deskDayBookings(deskId, state.currentDate);
  const cfg  = state.deskConfig[deskId] || {};
  const full = deskFullyBooked(deskId, state.currentDate);
  const content = document.getElementById('modal-content');

  let html = `
    <div class="desk-preview">
      <div class="desk-num">${deskId}</div>
      <div class="desk-type">${isStanding ? '▲ Standing Desk' : 'Sit/Stand Desk'}</div>
    </div>
    <h3>${full ? 'Fully Booked' : cfg.disabled ? 'Desk Disabled' : 'Book Desk ' + deskId}</h3>
    <p class="modal-subtitle">${formatDate(state.currentDate)}</p>`;

  if (cfg.disabled) {
    html += `<p style="color:var(--text-muted);font-size:13px">This desk is currently disabled.</p>`;
    if (cfg.note) html += `<p style="color:var(--text-muted);font-size:12px;margin-top:6px">Note: ${cfg.note}</p>`;
    if (state.isAdmin) html += `<div class="modal-actions"><button class="btn-primary" onclick="adminEnableDesk('${deskId}')">Re-enable Desk</button></div>`;
    content.innerHTML = html;
    document.getElementById('booking-modal').classList.remove('hidden');
    return;
  }

  // Show existing bookings
  if (bks.length) {
    html += `<div style="margin-bottom:16px">`;
    bks.forEach(b => {
      const mine = isMyBooking(b);
      const ci = b.checkedIn ? `<span style="color:var(--success);font-size:11px;margin-left:6px">✓ Checked in</span>` : '';
      html += `<div class="modal-info-row">
        <span class="label">${formatSlot(b)}</span>
        <span>${mine?'<strong>You</strong>':(b.userName||b.userEmail)}${ci}</span>
        ${mine||state.isAdmin ? `<button class="btn-cancel" style="margin-left:8px" onclick="openCancelPin('${b.id}',${mine})">Cancel</button>` : ''}
        ${(mine||state.isAdmin) && !b.checkedIn ? `<button class="btn-cancel" style="margin-left:4px;background:var(--success-light);color:var(--success)" onclick="openCheckinPin('${b.id}',${mine})">Check in</button>` : ''}
      </div>`;
    });
    html += `</div>`;

    // Admin reassign
    if (state.isAdmin) {
      html += `<div style="padding:12px 0;border-top:1px solid var(--border);margin-bottom:4px">
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Admin: reassign booking</p>
        <select id="reassign-bk-id" style="width:100%;padding:6px;margin-bottom:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">
          ${bks.map(b=>`<option value="${b.id}">${formatSlot(b)} — ${b.userName||b.userEmail}</option>`).join('')}
        </select>
        <div style="display:flex;gap:8px">
          <input type="email" id="reassign-email" placeholder="new-user@company.com" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">
          <button class="btn-ghost" onclick="doReassign()">Reassign</button>
        </div>
      </div>`;
    }
  }

  // Booking form
  if (!full) {
    if (!state.currentUser) {
      html += `<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Sign in to book a desk.</p>
        <div class="modal-actions"><button class="btn-primary" onclick="signIn()">Sign in${state.demoMode?' (Demo)':' with Google'}</button></div>`;
    } else if (isWeekend(state.currentDate)) {
      html += `<p style="color:var(--text-muted);font-size:13px">No bookings on weekends.</p>`;
    } else {
      html += `
        <div style="${bks.length?'border-top:1px solid var(--border);padding-top:16px':''}">
          <div class="modal-field">
            <label>Date</label>
            <input type="date" id="book-date" value="${dateKey(state.currentDate)}" min="${dateKey(new Date())}">
          </div>
          <div class="modal-field">
            <label>Time</label>
            <select id="book-timeslot" onchange="toggleCustomTime()">
              ${TIME_SLOTS.map(t=>`<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div id="custom-time-row" style="display:none;gap:8px">
            <div class="modal-field" style="flex:1"><label>From</label><input type="time" id="book-start" value="09:00"></div>
            <div class="modal-field" style="flex:1"><label>To</label><input type="time" id="book-end" value="17:00"></div>
          </div>
          <div class="modal-field">
            <label>Note (optional)</label>
            <input type="text" id="book-note" placeholder="e.g. Need dual monitors">
          </div>
          <div class="modal-field">
            <label>PIN <span style="font-weight:400;color:var(--text-muted)">(4 digits — you'll need this to check in or cancel)</span></label>
            <input type="password" id="book-pin" maxlength="4" pattern="[0-9]{4}" inputmode="numeric"
              placeholder="Choose a 4-digit PIN" style="letter-spacing:0.3em;font-size:18px;width:160px">
          </div>
          ${state.isAdmin?`<div class="modal-field"><label>Book for (email)</label>
            <input type="email" id="book-for" value="${state.currentUser.email}"></div>`:''}
          <div class="modal-actions">
            <button class="btn-primary" onclick="doConfirmBooking('${deskId}',${isStanding})">Confirm Booking</button>
            <button class="btn-ghost" onclick="closeModal()">Cancel</button>
          </div>
        </div>`;
    }
  }

  content.innerHTML = html;
  document.getElementById('booking-modal').classList.remove('hidden');
}

// PIN prompt modal for cancel / check-in
window.openCancelPin = function(bookingId, isMine) {
  if (state.isAdmin && !isMine) {
    // Admin can cancel without PIN
    if (!confirm('Cancel this booking as admin?')) return;
    doCancelBooking(bookingId, null);
    return;
  }
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3>Cancel Booking</h3>
    <p class="modal-subtitle">Enter your 4-digit PIN to confirm cancellation</p>
    <div class="modal-field">
      <input type="password" id="cancel-pin" maxlength="4" inputmode="numeric"
        placeholder="• • • •" style="letter-spacing:0.4em;font-size:24px;text-align:center;width:100%"
        autofocus>
    </div>
    <div class="modal-actions">
      <button class="btn-danger" onclick="doCancelBooking('${bookingId}', document.getElementById('cancel-pin').value)">Confirm Cancel</button>
      <button class="btn-ghost" onclick="closeModal()">Back</button>
    </div>`;
};

window.openCheckinPin = function(bookingId, isMine) {
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3>Check In</h3>
    <p class="modal-subtitle">Enter your 4-digit PIN to check in</p>
    <div class="modal-field">
      <input type="password" id="checkin-pin" maxlength="4" inputmode="numeric"
        placeholder="• • • •" style="letter-spacing:0.4em;font-size:24px;text-align:center;width:100%"
        autofocus>
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="doCheckin('${bookingId}', document.getElementById('checkin-pin').value)">Check In</button>
      <button class="btn-ghost" onclick="closeModal()">Back</button>
    </div>`;
};

window.toggleCustomTime = function() {
  const v = document.getElementById('book-timeslot')?.value;
  const r = document.getElementById('custom-time-row');
  if (r) r.style.display = v==='custom' ? 'flex' : 'none';
};

function closeModal() {
  document.getElementById('booking-modal').classList.add('hidden');
  document.getElementById('active-tooltip')?.remove();
}

// ===== ACTIONS =====
window.doConfirmBooking = async function(deskId, isStanding) {
  const date     = document.getElementById('book-date')?.value     || dateKey(state.currentDate);
  const timeSlot = document.getElementById('book-timeslot')?.value || 'allday';
  const timeStart= document.getElementById('book-start')?.value    || '';
  const timeEnd  = document.getElementById('book-end')?.value      || '';
  const note     = document.getElementById('book-note')?.value     || '';
  const pin      = document.getElementById('book-pin')?.value      || '';
  const bookFor  = document.getElementById('book-for')?.value      || state.currentUser.email;

  if (!pin || pin.length !== 4 || isNaN(pin)) {
    showToast('Please enter a 4-digit PIN', 'error'); return;
  }

  // Local conflict check
  const conflict = state.bookings.filter(b=>b.deskId==deskId&&b.date===date&&b.status==='active').find(b=>{
    if (b.timeSlot==='allday'||!b.timeSlot||timeSlot==='allday') return true;
    return b.timeSlot===timeSlot;
  });
  if (conflict) { showToast('That time slot is already taken', 'error'); return; }

  const booking = {
    id:'bk_'+Date.now(), deskId, isStanding, date, timeSlot, timeStart, timeEnd,
    userEmail:bookFor, userName:bookFor===state.currentUser.email?state.currentUser.name:bookFor,
    note, pin, status:'active', createdBy:state.currentUser.email, createdAt:new Date().toISOString(),
  };
  try {
    await saveBookingApi(booking);
    closeModal(); renderFloor();
    showToast(`Desk ${deskId} booked — ${formatSlot(booking)}`, 'success');
  } catch(e) { showToast('Booking failed: '+e.message, 'error'); }
};

window.doCancelBooking = async function(id, pin) {
  try {
    await deleteBookingApi(id, pin);
    closeModal(); renderFloor(); renderBookingsList();
    showToast('Booking cancelled', 'success');
  } catch(e) { showToast(e.message, 'error'); }
};

window.doCheckin = async function(id, pin) {
  if (!pin || pin.length !== 4) { showToast('Enter your 4-digit PIN', 'error'); return; }
  try {
    if (state.apiAvailable) {
      await apiFetch(`/api/bookings/${id}/checkin`, { method:'POST', body:JSON.stringify({ pin }) });
      state.bookings = await apiFetch('/api/bookings');
    } else {
      const b = state.bookings.find(b=>b.id===id);
      if (b) { b.checkedIn=true; b.checkedInAt=new Date().toISOString(); }
      localStorage.setItem('db_bookings', JSON.stringify(state.bookings));
    }
    closeModal(); renderFloor();
    showToast('Checked in!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
};

window.cancelBooking = window.doCancelBooking;

window.doReassign = async function() {
  const id    = document.getElementById('reassign-bk-id')?.value;
  const email = document.getElementById('reassign-email')?.value?.trim();
  if (!id||!email) return;
  try {
    if (state.apiAvailable) {
      await apiFetch(`/api/bookings/${id}`,{method:'PATCH',body:JSON.stringify({userEmail:email,userName:email})});
      state.bookings = await apiFetch('/api/bookings');
    } else {
      const b=state.bookings.find(b=>b.id===id);
      if(b){b.userEmail=email;b.userName=email;}
      localStorage.setItem('db_bookings',JSON.stringify(state.bookings));
    }
    closeModal(); renderFloor();
    showToast('Booking reassigned','success');
  } catch(e){ showToast('Error: '+e.message,'error'); }
};

window.adminEnableDesk = async function(deskId) {
  await patchDeskConfig(deskId, { disabled:false, note:'' });
  closeModal(); renderFloor();
  showToast(`Desk ${deskId} re-enabled`,'success');
};

// ===== MY BOOKINGS =====
function renderBookingsList() {
  const c = document.getElementById('bookings-list');
  if (!state.currentUser) { c.innerHTML=`<div class="empty-state"><strong>Sign in to view your bookings</strong></div>`; return; }
  const mine = state.bookings
    .filter(b=>b.userEmail===state.currentUser.email&&b.status==='active'&&b.date>=dateKey(new Date()))
    .sort((a,b)=>a.date.localeCompare(b.date));
  if (!mine.length) { c.innerHTML=`<div class="empty-state"><strong>No upcoming bookings</strong><p>Click any desk to book</p></div>`; return; }
  c.innerHTML = mine.map(b=>`
    <div class="booking-card">
      <div class="booking-card-header">
        <div class="booking-desk">Desk ${b.deskId}</div>
        <span class="booking-badge ${b.isStanding?'standing':''}">${b.isStanding?'Standing':'Regular'}</span>
      </div>
      <div class="booking-date">${new Date(b.date+'T12:00:00').toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric'})}</div>
      <div class="booking-date" style="font-size:12px;color:var(--text-muted)">${formatSlot(b)}</div>
      ${b.checkedIn?`<div style="font-size:12px;color:var(--success)">✓ Checked in</div>`:''}
      ${b.note?`<div class="booking-user">${b.note}</div>`:''}
      <div class="booking-actions">
        <button class="btn-cancel" onclick="openCancelPin('${b.id}',true)">Cancel</button>
        ${!b.checkedIn?`<button class="btn-cancel" style="background:var(--success-light);color:var(--success)" onclick="openCheckinPin('${b.id}',true)">Check in</button>`:''}
      </div>
    </div>`).join('');
}

// ===== ADMIN =====
function renderAdmin(tab='all-bookings') {
  const content = document.getElementById('admin-content');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));

  if (tab==='all-bookings') {
    const bks = [...state.bookings].filter(b=>b.status==='active').sort((a,b)=>a.date.localeCompare(b.date));
    content.innerHTML=`
      <div class="table-card">
        <div class="table-toolbar">
          <input class="search-input" placeholder="Search desk, user, date…" oninput="filterTable('admin-bk-table',this.value)">
          <button class="btn-ghost small" onclick="exportBookings()">Export CSV</button>
          <button class="btn-ghost small" onclick="refreshAdmin()">↻ Refresh</button>
        </div>
        <table class="admin-table" id="admin-bk-table">
          <thead><tr><th>Desk</th><th>Type</th><th>Date</th><th>Time</th><th>User</th><th>Checked in</th><th>Note</th><th></th></tr></thead>
          <tbody>${bks.map(b=>`
            <tr data-search="${b.deskId} ${b.userEmail||''} ${b.userName||''} ${b.date}">
              <td><strong>${b.deskId}</strong></td>
              <td><span class="status-pill ${b.isStanding?'standing':'active'}">${b.isStanding?'Standing':'Regular'}</span></td>
              <td>${b.date}</td>
              <td>${formatSlot(b)}</td>
              <td>${b.userName||b.userEmail}</td>
              <td>${b.checkedIn?`<span style="color:var(--success)">✓ ${b.checkedInAt?.slice(11,16)||''}</span>`:'—'}</td>
              <td style="color:var(--text-muted)">${b.note||'—'}</td>
              <td><button class="action-link danger" onclick="doCancelBooking('${b.id}',null).then(()=>renderAdmin('all-bookings'))">Cancel</button></td>
            </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">No active bookings</td></tr>'}
          </tbody>
        </table>
      </div>`;

  } else if (tab==='desks') {
    const all=[...LAYOUT.desks.map(d=>({...d,isStanding:false})),...LAYOUT.standingDesks.map(d=>({...d,isStanding:true}))];
    content.innerHTML=`
      <div class="table-card">
        <table class="admin-table">
          <thead><tr><th>Desk</th><th>Type</th><th>Status</th><th>Today</th><th>Note</th><th>Actions</th></tr></thead>
          <tbody>${all.map(d=>{
            const cfg=state.deskConfig[d.id]||{};
            const bks=deskDayBookings(d.id,state.currentDate);
            return `<tr>
              <td><strong>${d.id}</strong></td>
              <td><span class="status-pill ${d.isStanding?'standing':'active'}">${d.isStanding?'Standing':'Regular'}</span></td>
              <td><span class="status-pill ${cfg.disabled?'disabled':'enabled'}">${cfg.disabled?'Disabled':'Enabled'}</span></td>
              <td>${bks.length?bks.map(b=>`${b.userName||b.userEmail} (${formatSlot(b)})${b.checkedIn?' ✓':''}`).join('<br>'):'<span style="color:var(--text-muted)">Free</span>'}</td>
              <td style="color:var(--text-muted)">${cfg.note||'—'}</td>
              <td style="display:flex;gap:8px">
                <button class="action-link" onclick="adminToggleDesk('${d.id}',${!cfg.disabled})">${cfg.disabled?'Enable':'Disable'}</button>
                <button class="action-link" onclick="adminSetNote('${d.id}')">Note</button>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;

  } else if (tab==='users') {
    const active=state.bookings.filter(b=>b.status==='active');
    const future=active.filter(b=>b.date>=dateKey(new Date()));
    const users=[...new Set(active.map(b=>b.userEmail))];
    content.innerHTML=`
      <div class="table-card">
        <table class="admin-table">
          <thead><tr><th>User</th><th>All bookings</th><th>Upcoming</th><th>Actions</th></tr></thead>
          <tbody>${users.length?users.map(email=>{
            const tot=active.filter(b=>b.userEmail===email).length;
            const up=future.filter(b=>b.userEmail===email).length;
            return `<tr><td>${email}</td><td>${tot}</td><td>${up}</td>
              <td><button class="action-link danger" onclick="adminCancelUser('${email}')">Cancel all upcoming</button></td></tr>`;
          }).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">No users yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }
}

async function refreshAdmin() {
  if (state.apiAvailable) { state.bookings=await apiFetch('/api/bookings'); state.deskConfig=await apiFetch('/api/desks/config'); }
  renderAdmin(document.querySelector('.tab-btn.active')?.dataset.tab||'all-bookings');
}

window.filterTable = (id,q) => document.querySelectorAll(`#${id} tbody tr[data-search]`).forEach(r=>{
  r.style.display=r.dataset.search.toLowerCase().includes(q.toLowerCase())?'':'none';
});

window.adminToggleDesk = async (deskId, disable) => {
  await patchDeskConfig(deskId,{disabled:disable});
  renderAdmin('desks'); renderFloor();
  showToast(`Desk ${deskId} ${disable?'disabled':'enabled'}`, 'success');
};

window.adminSetNote = async (deskId) => {
  const note=prompt(`Note for desk ${deskId}:`,state.deskConfig[deskId]?.note||'');
  if (note===null) return;
  await patchDeskConfig(deskId,{note});
  renderAdmin('desks');
};

window.adminCancelUser = async (email) => {
  if (!confirm(`Cancel all upcoming bookings for ${email}?`)) return;
  const ids=state.bookings.filter(b=>b.userEmail===email&&b.status==='active'&&b.date>=dateKey(new Date())).map(b=>b.id);
  // Admin cancel — no PIN needed
  for (const id of ids) await deleteBookingApi(id, null);
  renderAdmin('users'); renderFloor();
  showToast(`Cancelled ${ids.length} booking(s) for ${email}`, 'success');
};

window.exportBookings = () => {
  const csv=['Desk,Type,Date,Time,User Email,User Name,Checked In,Note,Created By'].concat(
    state.bookings.filter(b=>b.status==='active').map(b=>[
      b.deskId,b.isStanding?'Standing':'Regular',b.date,formatSlot(b),
      b.userEmail,b.userName,b.checkedIn?'Yes':'No',b.note||'',b.createdBy||''
    ].join(','))
  ).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv,'+encodeURIComponent(csv);
  a.download=`bookings-${dateKey(new Date())}.csv`;
  a.click();
};

// ===== AUTH =====
function showAdminNav() { document.querySelectorAll('.admin-only').forEach(e=>e.classList.remove('hidden')); }

window.signIn = async () => {
  if (state.apiAvailable && !state.demoMode) {
    window.location.href = '/auth/google';
    return;
  }
  // Demo mode login via API
  const email = prompt('Demo mode — enter any email (use "admin@" for admin access):');
  if (!email) return;
  try {
    if (state.apiAvailable) {
      const data = await apiFetch('/auth/demo', { method:'POST', body:JSON.stringify({ email }) });
      state.currentUser = data.user;
      state.isAdmin = data.user.isAdmin;
    } else {
      const name = email.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
      state.currentUser = { email:email.toLowerCase(), name, avatar:'', isAdmin:email.startsWith('admin') };
      state.isAdmin = state.currentUser.isAdmin;
    }
    updateUserUI();
    if (state.isAdmin) showAdminNav();
    // Reload bookings now that we're logged in
    if (state.apiAvailable) state.bookings = await apiFetch('/api/bookings');
    renderFloor(); renderBookingsList();
    showToast(`Welcome, ${state.currentUser.name}!`);
    closeModal();
  } catch(e) { showToast('Login failed: '+e.message, 'error'); }
};

window.signOut = async () => {
  if (state.apiAvailable && !state.demoMode) {
    window.location.href = '/auth/logout';
    return;
  }
  if (state.apiAvailable) {
    await fetch('/auth/logout');
  }
  state.currentUser=null; state.isAdmin=false;
  state.bookings = state.apiAvailable ? await apiFetch('/api/bookings').catch(()=>[]) : [];
  updateUserUI();
  document.querySelectorAll('.admin-only').forEach(e=>e.classList.add('hidden'));
  renderFloor(); renderBookingsList(); showToast('Signed out');
};

function updateUserUI() {
  const btn=document.getElementById('sign-in-btn'), info=document.getElementById('user-info');
  if (state.currentUser) {
    btn.classList.add('hidden'); info.classList.remove('hidden');
    document.getElementById('user-name').textContent=state.currentUser.name;
    const av=document.getElementById('user-avatar');
    if(state.currentUser.avatar){av.src=state.currentUser.avatar;av.style.display='';}
    else av.style.display='none';
  } else {
    btn.classList.remove('hidden'); info.classList.add('hidden');
    btn.textContent = state.demoMode ? 'Sign in (Demo)' : 'Sign in with Google';
  }
}

// ===== NAV / DATE =====
function setView(view) {
  state.view=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  if(view==='list')  renderBookingsList();
  if(view==='admin') renderAdmin();
}

function updateDateDisplay() {
  const el=document.getElementById('current-date-display');
  const today=dateKey(new Date()), d=dateKey(state.currentDate);
  if(d===today) el.textContent='Today, '+state.currentDate.toLocaleDateString('en-CA',{month:'short',day:'numeric'});
  else if(d===dateKey(new Date(Date.now()+86400000))) el.textContent='Tomorrow, '+state.currentDate.toLocaleDateString('en-CA',{month:'short',day:'numeric'});
  else el.textContent=formatDate(state.currentDate);
}

function changeDate(delta) {
  state.currentDate=new Date(state.currentDate.getTime()+delta*86400000);
  updateDateDisplay(); renderFloor();
}

function setZoom(z) {
  state.zoom=Math.min(2,Math.max(0.35,z));
  document.getElementById('floor-viewport').style.transform=`scale(${state.zoom})`;
  document.getElementById('zoom-level').textContent=Math.round(state.zoom*100)+'%';
}

function showToast(msg,type='') {
  const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  updateDateDisplay();
  await loadData();
  renderFloor();

  document.getElementById('prev-day').addEventListener('click',()=>changeDate(-1));
  document.getElementById('next-day').addEventListener('click',()=>changeDate(1));
  document.getElementById('sign-in-btn').addEventListener('click',signIn);
  document.getElementById('sign-out-btn').addEventListener('click',signOut);
  document.getElementById('modal-close').addEventListener('click',closeModal);
  document.getElementById('booking-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>renderAdmin(b.dataset.tab)));
  document.getElementById('zoom-in').addEventListener('click',()=>setZoom(state.zoom+0.1));
  document.getElementById('zoom-out').addEventListener('click',()=>setZoom(state.zoom-0.1));
  document.getElementById('zoom-fit').addEventListener('click',()=>{
    const c=document.getElementById('floor-container'),s=document.getElementById('office-svg');
    setZoom(Math.min(+c.clientWidth/+s.getAttribute('width'),+c.clientHeight/+s.getAttribute('height'))*0.92);
  });
  setTimeout(()=>{
    const c=document.getElementById('floor-container'),s=document.getElementById('office-svg');
    setZoom(Math.min(1,Math.min(+c.clientWidth/+s.getAttribute('width'),+c.clientHeight/+s.getAttribute('height'))*0.90));
  },100);
});

// ===== DEBUG HELPERS (visible in Chrome console) =====
// Usage: dbg()  →  prints current state
// Usage: fetch('/api/log').then(r=>r.json()).then(console.log)  →  server log
window.dbg = async () => {
  console.group('DeskBook Debug');
  console.log('apiAvailable:', state.apiAvailable);
  console.log('demoMode:', state.demoMode);
  console.log('currentUser:', state.currentUser);
  console.log('isAdmin:', state.isAdmin);
  console.log('bookings:', state.bookings.length);
  const serverLog = await fetch('/api/log').then(r=>r.json()).catch(e=>({error:e.message}));
  console.log('server:', serverLog);
  console.groupEnd();
};
// Expose state for console inspection
window._state = state;
