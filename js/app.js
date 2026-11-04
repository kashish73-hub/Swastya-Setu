/* Swastya Setu – lean production build. Real data: OpenStreetMap (Overpass) + Leaflet. */
const CONFIG = { DEMO: true, DEFAULT_LOC: [28.6139, 77.2090], RADIUS: 5000 };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const state = { cart: store.get('ss_cart', []), sym: new Set(), rx: null, loc: null, hosp: [], pharm: [], map: null, layer: null };

/* ---------- Router & toast ---------- */
function switchView(id) {
  document.querySelectorAll('.view-section').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.toggle('active', (i.getAttribute('onclick') || '').includes(`'${id}'`)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'view-hospital-locator') loadPlaces();
  if (id === 'view-pharmacy-locator') loadPlaces();
  if (id === 'view-doctor-appointment') renderServices();
  if (id === 'view-medicine-cart') updateCartUI();
}
function showToast(msg, type = 'info') {
  const box = $('toast-box'); if (!box) return;
  const t = document.createElement('div'); t.className = `toast ${type}`;
  t.innerHTML = '<i class="fa-solid fa-circle-info"></i> <span></span>'; t.lastChild.textContent = msg;
  box.appendChild(t); setTimeout(() => t.remove(), 4000);
}
const demo = m => showToast(CONFIG.DEMO ? `${m} (demo – backend not connected)` : m, 'info');

/* ---------- Location + OSM data (India) ---------- */
function getLoc() {
  return state.loc ? Promise.resolve(state.loc) : new Promise(res => {
    const fb = () => { state.loc = CONFIG.DEFAULT_LOC; showToast('Location off – showing New Delhi. Allow GPS for nearby results.', 'warning'); res(state.loc); };
    if (!navigator.geolocation) return fb();
    navigator.geolocation.getCurrentPosition(p => { state.loc = [p.coords.latitude, p.coords.longitude]; res(state.loc); }, fb, { timeout: 8000, maximumAge: 300000 });
  });
}
const km = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

let placesPromise = null;
function loadPlaces(force) {
  if (placesPromise && !force) return placesPromise;
  placesPromise = (async () => {
    const loc = await getLoc(), key = `ss_p_${loc[0].toFixed(2)}_${loc[1].toFixed(2)}`;
    let data = null;
    try { const c = JSON.parse(sessionStorage.getItem(key)); if (c) data = c; } catch {}
    if (!data) {
      const a = `(around:${CONFIG.RADIUS},${loc[0]},${loc[1]})`;
      const q = `[out:json][timeout:20];(nwr[amenity~"^(hospital|clinic)$"]${a};nwr[amenity=pharmacy]${a};);out center tags 80;`;
      try {
        const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
        if (!r.ok) throw 0; data = (await r.json()).elements;
        try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {}
      } catch { showToast('Could not load nearby places. Check internet and retry.', 'danger'); data = []; }
    }
    const items = data.map(e => { const t = e.tags || {}, p = [e.lat ?? e.center?.lat, e.lon ?? e.center?.lon];
      return { name: t.name || t['name:en'] || (t.amenity === 'pharmacy' ? 'Pharmacy' : 'Clinic / Hospital'), kind: t.amenity, p,
        d: km(loc, p), phone: (t.phone || t['contact:phone'] || '').split(';')[0].trim(), hours: t.opening_hours || '',
        addr: [t['addr:street'], t['addr:city']].filter(Boolean).join(', '), gov: /gov/i.test(t['operator:type'] || '') || /gov|aiims|civil|district/i.test(t.name || ''),
        spec: (t['healthcare:speciality'] || '').toLowerCase() }; }).filter(x => x.p[0] && x.p[1]).sort((a, b) => a.d - b.d);
    state.hosp = items.filter(x => x.kind !== 'pharmacy'); state.pharm = items.filter(x => x.kind === 'pharmacy');
    filterHospitals(); filterPharmacies(); drawMap();
  })();
  return placesPromise;
}
function drawMap() {
  const el = $('hosp-map'); if (!el || !window.L) return;
  if (!state.map) { state.map = L.map(el).setView(state.loc, 13); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map); state.layer = L.layerGroup().addTo(state.map); }
  state.layer.clearLayers(); L.circleMarker(state.loc, { radius: 8, color: '#1565C0' }).addTo(state.layer).bindPopup('You are here');
  state.hosp.slice(0, 30).forEach(h => L.marker(h.p).addTo(state.layer).bindPopup(`<b>${esc(h.name)}</b><br>${h.d.toFixed(1)} km`));
  state.map.setView(state.loc, 13); setTimeout(() => state.map.invalidateSize(), 200);
}
const dir = p => `https://www.google.com/maps/dir/?api=1&destination=${p[0]},${p[1]}`;
const callBtn = ph => ph ? `<a class="btn btn-secondary" href="tel:${esc(ph.replace(/[^\d+]/g, ''))}"><i class="fa-solid fa-phone"></i> Call</a>` : '';
const empty = () => '<p style="color:var(--text-muted)">No results nearby. Try again with GPS on.</p>';

function renderHospitals(list) {
  const g = $('hospitals-card-grid'); if (!g) return;
  g.innerHTML = list.slice(0, 24).map(h => `<div class="card hospital-card">
    <div class="card-img-placeholder"><i class="fa-solid fa-hospital"></i><span class="card-badge ${h.gov ? 'badge-govt' : 'badge-private'}">${h.gov ? 'Govt' : 'Private/Other'}</span></div>
    <div><h3>${esc(h.name)}</h3><p style="color:var(--text-muted);font-size:.85rem"><i class="fa-solid fa-location-dot"></i> ${esc(h.addr || 'Nearby')} • ${h.d.toFixed(1)} km</p>
    ${h.hours ? `<p style="font-size:.85rem">Hours: ${esc(h.hours)}</p>` : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" target="_blank" rel="noopener" href="${dir(h.p)}"><i class="fa-solid fa-diamond-turn-right"></i> Directions</a>${callBtn(h.phone)}</div></div>`).join('') || empty();
}
function filterHospitals() {
  const q = ($('hosp-search-input')?.value || '').toLowerCase(), s = ($('hosp-spec-select')?.value || 'all').toLowerCase(), t = $('hosp-type-select')?.value || 'all';
  renderHospitals(state.hosp.filter(h => (h.name + h.addr).toLowerCase().includes(q) && (s === 'all' || h.spec.includes(s)) && (t === 'all' || (t === 'Govt') === h.gov)));
}
function renderPharmacies(list) {
  const g = $('pharmacy-card-grid'); if (!g) return;
  g.innerHTML = list.slice(0, 24).map(p => `<div class="card pharmacy-card"><div>
    <h3><i class="fa-solid fa-prescription-bottle-medical" style="color:var(--primary)"></i> ${esc(p.name)}</h3>
    <p style="font-size:.85rem;color:var(--text-muted)">${p.d.toFixed(1)} km away${p.addr ? ' • ' + esc(p.addr) : ''}</p>
    ${p.hours ? `<span class="badge-card badge-open" style="margin-top:8px">${esc(p.hours)}</span>` : ''}</div>
    <div style="display:flex;gap:8px;flex-direction:column"><a class="btn btn-primary" target="_blank" rel="noopener" href="${dir(p.p)}"><i class="fa-solid fa-diamond-turn-right"></i> Directions</a>${callBtn(p.phone)}</div></div>`).join('') || empty();
}
function filterPharmacies() {
  const q = ($('pharmacy-search')?.value || '').toLowerCase(), t = $('pharmacy-filter-type')?.value || 'all';
  renderPharmacies(state.pharm.filter(p => p.name.toLowerCase().includes(q) && (t === 'all' || (t === '24x7' && /24\/7/.test(p.hours)) || (t === 'delivery' && false))));
}

/* ---------- Official services (replaces fake doctor list) ---------- */
function renderServices() {
  const g = $('doctors-card-grid'); if (!g) return;
  const S = [['eSanjeevani – Free Govt Teleconsultation', 'Ministry of Health. Talk to a doctor by video, free.', 'https://esanjeevani.mohfw.gov.in', 'fa-video'],
    ['Ayushman Bharat – PM-JAY', 'Check eligibility for ₹5 lakh/yr cover & find empanelled hospitals.', 'https://pmjay.gov.in', 'fa-id-card'],
    ['ABHA Health ID', 'Create your Ayushman Bharat Health Account to store records.', 'https://abha.abdm.gov.in', 'fa-notes-medical'],
    ['Health Helpline 104 / 14443', 'State health advice (104) & Ayush helpline (14443). Free.', 'tel:104', 'fa-phone']];
  g.innerHTML = S.map(s => `<div class="card doctor-card"><div style="display:flex;gap:12px;align-items:center"><i class="fa-solid ${s[3]}" style="font-size:2.2rem;color:var(--primary)"></i><div><h3>${esc(s[0])}</h3><p style="font-size:.85rem;color:var(--text-muted)">${esc(s[1])}</p></div></div>
    <a class="btn btn-primary btn-sm" ${s[2].startsWith('http') ? 'target="_blank" rel="noopener"' : ''} href="${s[2]}">Open</a></div>`).join('');
}

/* ---------- Symptom triage (rule-based, transparent) ---------- */
const SYMPTOMS = ['Fever', 'Chills', 'Cough', 'Shortness of Breath', 'Chest Pain', 'Headache', 'Body Ache', 'Fatigue', 'Sore Throat', 'Runny Nose', 'Nausea', 'Vomiting', 'Diarrhea', 'Abdominal Pain', 'Joint Pain', 'Skin Rash', 'Dizziness', 'Loss of Smell/Taste', 'Weakness on One Side', 'Confusion', 'Burning Urination'];
const RED = new Set(['Chest Pain', 'Shortness of Breath', 'Weakness on One Side', 'Confusion']);
const DX = [
  ['Viral Fever / Flu', ['Fever', 'Body Ache', 'Cough', 'Sore Throat', 'Runny Nose', 'Fatigue', 'Headache'], 'General Physician', 'Rest, fluids, paracetamol as per label. See a doctor if fever lasts over 3 days.'],
  ['Common Cold', ['Runny Nose', 'Sore Throat', 'Cough', 'Headache'], 'General Physician', 'Warm fluids, steam, rest, saline gargle.'],
  ['Dengue (possible)', ['Fever', 'Headache', 'Body Ache', 'Joint Pain', 'Skin Rash', 'Nausea', 'Fatigue'], 'General Physician', 'Get a dengue NS1/platelet test. Avoid aspirin/ibuprofen. Drink plenty of fluids.'],
  ['Malaria (possible)', ['Fever', 'Chills', 'Headache', 'Nausea', 'Vomiting', 'Body Ache'], 'General Physician', 'Get a malaria smear/RDT test the same day.'],
  ['Typhoid (possible)', ['Fever', 'Abdominal Pain', 'Headache', 'Fatigue', 'Diarrhea', 'Nausea'], 'General Physician', 'Get a blood culture/Widal test. Drink only boiled or safe water.'],
  ['Gastroenteritis / Food infection', ['Diarrhea', 'Vomiting', 'Nausea', 'Abdominal Pain', 'Fever'], 'General Physician', 'Take ORS often. Seek care if blood in stool, or no urine for 8 hours.'],
  ['COVID-19 / Influenza-like illness', ['Fever', 'Cough', 'Loss of Smell/Taste', 'Sore Throat', 'Fatigue', 'Body Ache'], 'General Physician', 'Wear a mask, isolate, and test if symptoms continue.'],
  ['Urinary Tract Infection (possible)', ['Burning Urination', 'Abdominal Pain', 'Fever', 'Nausea'], 'General Physician / Urologist', 'Drink water and get a urine test. Do not self-start antibiotics.'],
  ['Migraine / Tension Headache', ['Headache', 'Nausea', 'Dizziness'], 'General Physician / Neurologist', 'Rest in a dark, quiet room and stay hydrated.'],
  ['Skin Allergy / Rash', ['Skin Rash'], 'Dermatologist', 'Avoid scratching and known triggers. Seek care if it spreads or there is breathlessness.']
];
function renderSymptomChips() {
  const b = $('symptom-chip-box'); if (!b) return; b.innerHTML = '';
  SYMPTOMS.forEach(s => { const c = document.createElement('div'); c.className = 'chip' + (state.sym.has(s) ? ' selected' : '');
    c.innerHTML = '<i class="fa-solid fa-plus"></i> '; c.append(s); c.onclick = () => toggleSymptom(s); b.appendChild(c); });
  filterSymptomChips();
}
function toggleSymptom(s) { state.sym.has(s) ? state.sym.delete(s) : state.sym.add(s); renderSymptomChips(); $('selected-symptom-count').textContent = `${state.sym.size} symptoms selected`; }
function filterSymptomChips() { const q = ($('symptom-search')?.value || '').toLowerCase();
  document.querySelectorAll('#symptom-chip-box .chip').forEach(c => c.style.display = c.textContent.toLowerCase().includes(q) ? 'inline-flex' : 'none'); }
function runDiseasePrediction() {
  if (!state.sym.size) return showToast('Select at least 1 symptom.', 'warning');
  const sel = [...state.sym], red = sel.filter(s => RED.has(s));
  const ranked = DX.map(d => { const hit = d[1].filter(s => state.sym.has(s)).length; return { d, score: hit / Math.max(d[1].length, sel.length) * 100, hit }; })
    .filter(x => x.hit).sort((a, b) => b.score - a.score).slice(0, 3);
  const top = ranked[0], card = $('prediction-result-card');
  const sev = red.length ? 'EMERGENCY' : sel.length >= 5 ? 'See a doctor soon' : 'Mild – monitor';
  $('pred-severity').textContent = sev;
  $('pred-disease-title').textContent = red.length ? 'Possible emergency – call 108 / 112 now' : top ? top.d[0] : 'No clear match';
  $('pred-disease-desc').textContent = red.length ? `Warning signs: ${red.join(', ')}. Do not wait – go to the nearest hospital.` : top ? 'Other possibilities: ' + (ranked.slice(1).map(r => r.d[0]).join(', ') || 'none') : 'Symptoms do not match a common pattern. Please consult a doctor.';
  const pct = top ? Math.round(Math.min(top.score, 95)) : 0;
  $('pred-confidence-text').textContent = pct + '% match'; $('pred-confidence-bar').style.width = pct + '%';
  $('pred-specialist').textContent = red.length ? 'Emergency Department' : top ? top.d[2] : 'General Physician';
  $('pred-medicines').textContent = 'No prescription medicines are suggested here. Take only OTC drugs per label, or as advised by a doctor.';
  $('pred-precautions').textContent = top && !red.length ? top.d[3] : 'Seek medical care immediately.';
  card.style.display = 'block'; card.scrollIntoView({ behavior: 'smooth' });
  if (red.length) { showToast('Possible emergency! Call 108 or 112.', 'danger'); openSOSModal(); }
}

/* ---------- Prescription upload ---------- */
const triggerFileInput = () => $('rx-file-input').click();
function handleRxFileSelect(e) {
  const f = e.target.files[0]; if (!f) return;
  if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(f.type) || f.size > 5 * 1048576) { e.target.value = ''; return showToast('Only JPG, PNG or PDF up to 5 MB.', 'danger'); }
  state.rx = f; $('rx-file-name').textContent = f.name; $('rx-file-size').textContent = `${Math.max(1, Math.round(f.size / 1024))} KB • Selected`; $('rx-preview-box').style.display = 'flex';
}
function removeRxFile() { state.rx = null; $('rx-file-input').value = ''; $('rx-preview-box').style.display = 'none'; }
function simulateAIVerification() {
  if (!state.rx) return showToast('Upload a prescription first.', 'warning');
  demo('Prescription sent for pharmacist verification'); setTimeout(() => switchView('view-prescription-verification'), 800);
}

/* ---------- Cart ---------- */
const GST = 0.12, DELIVERY = 25;
function updateCartUI() {
  const c = $('cart-items-container'); if (!c) return; let sub = 0;
  c.innerHTML = state.cart.map(i => { sub += i.price * i.qty; return `<div class="cart-item"><div><h4>${esc(i.name)}</h4>
    <span style="font-size:.8rem;color:var(--text-muted)">${i.rx ? 'Prescription Required' : 'Over The Counter'}</span><p style="font-weight:600;color:var(--primary)">₹${i.price} x ${i.qty}</p></div>
    <div class="quantity-control"><button class="qty-btn" onclick="changeQty(${i.id},-1)">-</button><span>${i.qty}</span><button class="qty-btn" onclick="changeQty(${i.id},1)">+</button></div></div>`; }).join('') || '<p style="color:var(--text-muted)">Cart is empty.</p>';
  const d = state.cart.length ? DELIVERY : 0, g = sub * GST;
  $('cart-subtotal').textContent = `₹${sub.toFixed(2)}`; $('cart-gst').textContent = `₹${g.toFixed(2)}`; $('cart-total').textContent = `₹${(sub + d + g).toFixed(2)}`;
  if ($('cart-delivery')) $('cart-delivery').textContent = `₹${d.toFixed(2)}`;
  [$('cart-badge-count'), $('cart-count-btn')].forEach(e => e && (e.textContent = state.cart.length));
  store.set('ss_cart', state.cart);
}
function changeQty(id, d) { const i = state.cart.find(x => x.id === id); if (!i) return; i.qty += d; if (i.qty <= 0) state.cart = state.cart.filter(x => x.id !== id); updateCartUI(); }
function addToCart(name, price, rx = false) { const e = state.cart.find(i => i.name === name); e ? e.qty++ : state.cart.push({ id: Date.now(), name, price, qty: 1, rx }); updateCartUI(); showToast(`Added ${name}`, 'success'); }
const applyCoupon = () => showToast('No active coupons.', 'warning');
function processCheckout() {
  if (!state.cart.length) return showToast('Cart is empty.', 'warning');
  if (state.cart.some(i => i.rx) && !state.rx) { showToast('Upload a valid prescription for Rx medicines.', 'danger'); return switchView('view-upload-prescription'); }
  demo('Order request placed'); state.cart = []; updateCartUI(); setTimeout(() => switchView('view-delivery-tracking'), 1000);
}

/* ---------- SOS (real dialer) ---------- */
async function openSOSModal() {
  $('sos-modal').classList.add('active'); const l = await getLoc(), el = $('sos-loc');
  if (el) el.innerHTML = `Lat ${l[0].toFixed(5)}, Long ${l[1].toFixed(5)} – <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${l[0]},${l[1]}">view map</a>`;
}
const closeSOSModal = () => $('sos-modal').classList.remove('active');
function triggerSOSDispatch() {
  closeSOSModal(); const l = state.loc || CONFIG.DEFAULT_LOC;
  try { navigator.clipboard?.writeText(`Emergency! My location: https://www.google.com/maps?q=${l[0]},${l[1]}`); } catch {}
  showToast('Dialing 108. Location link copied – share it with the operator.', 'danger'); location.href = 'tel:108';
}

/* ---------- Auth (local demo) ---------- */
let authRole = 'user';
const openAuthModal = () => $('auth-modal').classList.add('active');
const closeAuthModal = () => $('auth-modal').classList.remove('active');
function switchAuthTab(r) { authRole = r; $('auth-modal-title').textContent = { user: 'Account Login', hospital: 'Hospital Partner Login', admin: 'Admin Login' }[r]; }
function handleAuthSubmit(e) { e.preventDefault(); closeAuthModal(); store.set('ss_user', { role: authRole }); demo('Signed in'); switchView(authRole === 'admin' ? 'view-admin-dashboard' : authRole === 'hospital' ? 'view-hospital-dashboard' : 'view-dashboard'); }
const toggleNotifications = () => showToast('No new notifications.', 'info');

document.addEventListener('DOMContentLoaded', () => {
  renderSymptomChips(); updateCartUI();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSOSModal(); closeAuthModal(); } });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
});
