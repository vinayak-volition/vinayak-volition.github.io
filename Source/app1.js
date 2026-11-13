/* ---------- app: state, storage, actions ---------- */
const S = { route: { v: 'login' }, mode: 'user', loginErr: '', loginUser: '', reg: { f: 'done', q: '' }, by: 'area', navList: [], showScoped: false, activity: [], users: [], user: null, settings: null, templates: [], audits: [], audit: null, tpl: null, photos: [], filter: 'all', search: '', matrix: 'find', form: null, modal: null, memOnly: false, opt: { photos: true }, keepScroll: false };
let BUILTIN = null;
const PERM = {
  users: ['sysadmin'], settings: ['sysadmin', 'auditadmin'], templates: ['sysadmin', 'auditadmin'], createAudit: ['sysadmin', 'auditadmin'],
  assess: ['sysadmin', 'auditor'], review: ['sysadmin', 'reviewer'], closure: ['sysadmin', 'auditor', 'reviewer'], data: ['sysadmin']
};
const AUDIT_VIEWS = ['scope', 'overview', 'sections', 'section', 'q', 'closure', 'clo', 'reports', 'more', 'details', 'profile', 'photos', 'trail'];

const DB = {
  db: null, mem: { kv: new Map(), templates: new Map(), audits: new Map(), photos: new Map() },
  async open() {
    if (typeof indexedDB === 'undefined') return;
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('safety-audit-pilot', 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('templates', { keyPath: 'id' }); d.createObjectStore('audits', { keyPath: 'id' }); d.createObjectStore('photos', { keyPath: 'id' }).createIndex('auditId', 'auditId'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
        setTimeout(() => rej(new Error('timeout')), 4000);
      });
    } catch (e) { this.db = null; }
  },
  _tx(store, mode, fn) { return new Promise((res, rej) => { const t = this.db.transaction(store, mode), rq = fn(t.objectStore(store)); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage write failed')); }); },
  async get(store, key) { return this.db ? this._tx(store, 'readonly', s => s.get(key)) : this.mem[store].get(key); },
  async put(store, val, key) { if (this.db) return this._tx(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)); this.mem[store].set(key === undefined ? val.id : key, val); },
  async del(store, key) { if (this.db) return this._tx(store, 'readwrite', s => s.delete(key)); this.mem[store].delete(key); },
  async all(store) { return this.db ? this._tx(store, 'readonly', s => s.getAll()) : [...this.mem[store].values()]; },
  async byAudit(id) { return this.db ? this._tx('photos', 'readonly', s => s.index('auditId').getAll(id)) : [...this.mem.photos.values()].filter(p => p.auditId === id); },
  async clear(store) { if (this.db) return this._tx(store, 'readwrite', s => s.clear()); this.mem[store].clear(); }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function can(p) { return PERM[p].includes(S.user.role); }
function assigned(a) { const n = S.user.name.trim().toLowerCase(); return S.user.role === 'sysadmin' || (a.lead || '').trim().toLowerCase() === n || (a.team || []).some(t => t.trim().toLowerCase() === n); }
function canAssess(a) { return can('assess') && assigned(a) && (a.status === 'draft' || a.status === 'inprogress'); }
function canClosure(a) { return can('closure') && (a.status === 'submitted' || a.status === 'approved'); }
function canDetails(a) { return (can('createAudit') || canAssess(a)) && (a.status === 'draft' || a.status === 'inprogress'); }
function visibleAudits() { const l = S.user.role === 'auditor' ? S.audits.filter(assigned) : S.audits.slice(); return l.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); }
function tplUsed(id) { return S.audits.filter(a => a.tplId === id).length; }
function mkBuiltin(b) { return { id: 'tpl-nbc2016-ver2', name: b.name, version: b.version, active: true, builtin: true, source: b.source, basis: b.basis, sections: clone(b.sections), items: b.items.map(i => Object.assign({ weight: i.sev }, i)), profile: clone(b.profile), createdAt: new Date().toISOString() }; }

/* ---------- persistence ---------- */
let _saveT = null;
function log(act, detail) { const a = S.audit; if (!a) return; (a.trail || (a.trail = [])).push({ at: new Date().toISOString(), by: S.user.name, role: ROLES[S.user.role], act, detail: detail || '' }); }
function saveAudit(now) {
  const a = S.audit; if (!a) return; a.updatedAt = new Date().toISOString();
  clearTimeout(_saveT);
  const doit = () => DB.put('audits', a).catch(e => toast('Could not save: ' + e.message));
  if (now) return doit(); _saveT = setTimeout(doit, 350);
}
function saveSettings() { return DB.put('kv', S.settings, 'settings'); }
function saveUsers() { return DB.put('kv', S.users, 'users'); }
function R(qid) { const a = S.audit; return a.resp[qid] || (a.resp[qid] = {}); }
function touch(qid) { const r = R(qid), a = S.audit; r.by = S.user.name; r.at = new Date().toISOString(); if (a.status === 'draft') { a.status = 'inprogress'; log('Audit started'); } saveAudit(); }
function logEdit(qid, what) { if (S.audit.reopened) log('Response modified after submission', qid + ': ' + what); }

/* ---------- navigation ---------- */
async function ensureAudit(id) {
  if (S.audit && S.audit.id === id) return true;
  const a = S.audits.find(x => x.id === id); if (!a) return false;
  S.audit = a; S.tpl = S.templates.find(t => t.id === a.tplId) || null; S.photos = await DB.byAudit(id); S.filter = 'all'; S.search = '';
  return true;
}
async function go(r, replace) {
  S.loginErr = '';
  if (AUDIT_VIEWS.includes(r.v) || r.v === 'aaudit') { if (!r.a && S.audit) r.a = S.audit.id; if (!(await ensureAudit(r.a))) r = { v: homeView() }; }
  S.route = r;
  try { if (typeof history !== 'undefined') history[replace ? 'replaceState' : 'pushState'](r, ''); } catch (e) { }
  render();
}
function toast(msg) {
  if (typeof document === 'undefined') return;
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function download(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function ask(m) { S.modal = m; rerender(); const el = document.getElementById('modal-in'); if (el) el.focus(); }
function rerender() { S.keepScroll = true; render(); }

/* ---------- photos ---------- */
function fileToPhoto(file, maxPx) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxPx / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); res({ data: c.toDataURL('image/jpeg', 0.8), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('unreadable image')); };
    img.src = url;
  });
}
async function addPhotos(files, qid, kind) {
  let n = 0;
  for (const f of files) {
    try {
      const p = await fileToPhoto(f, S.audit.cfg.photoMaxPx || 1600);
      const ph = { id: uid(), auditId: S.audit.id, qid, kind, caption: '', data: p.data, w: p.w, h: p.h, by: S.user.name, at: new Date().toISOString() };
      await DB.put('photos', ph); S.photos.push(ph); n++;
    } catch (e) { toast('Could not add ' + (f.name || 'photo') + ': ' + e.message); }
  }
  if (n) { touch(qid); logEdit(qid, n + ' photo(s) added'); }
  rerender();
}
function demoPhoto(label, hue) {
  const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d');
  g.fillStyle = `hsl(${hue},35%,78%)`; g.fillRect(0, 0, 800, 600); g.fillStyle = `hsl(${hue},35%,62%)`;
  for (let i = 0; i < 8; i++) g.fillRect(60 + i * 90, 380 - (i * 37 % 160), 60, 220 + (i * 37 % 160));
  g.fillStyle = '#1f2937'; g.font = 'bold 40px sans-serif'; g.fillText('SAMPLE PHOTO', 40, 80); g.font = '30px sans-serif'; g.fillText(label, 40, 130);
  return { data: c.toDataURL('image/jpeg', 0.75), w: 800, h: 600 };
}

/* ---------- audit lifecycle ---------- */
async function nextRef(dateISO) {
  const y = (dateISO || todayISO()).slice(0, 4), ctr = (await DB.get('kv', 'counter')) || {};
  let ref; do { ctr[y] = (ctr[y] || 0) + 1; ref = [S.settings.refPrefix || 'FSA', y, S.settings.deviceCode, String(ctr[y]).padStart(3, '0')].filter(Boolean).join('-'); } while (S.audits.some(a => a.ref === ref));
  await DB.put('kv', ctr, 'counter'); return ref;
}
async function createAudit(f) {
  const tpl = S.templates.find(t => t.id === f.tplId);
  const a = { id: uid(), ref: await nextRef(f.dateFrom), tplId: tpl.id, cfg: clone(S.settings), status: 'draft', org: f.org.trim(), site: f.site.trim(), location: f.location.trim(), type: f.type, dateFrom: f.dateFrom, dateTo: f.dateTo || f.dateFrom, lead: f.lead, team: f.team.slice(), teamOther: f.teamOther.trim(), scope: f.scope.trim(), profile: {}, resp: {}, trail: [], createdAt: new Date().toISOString(), createdBy: S.user.name };
  const P = tpl.profile || [], set = (i, v) => { if (P[i] && v) a.profile[P[i].label] = v; };
  if (P.length && /premises name/i.test(P[0].label)) { set(0, a.site); set(1, a.location); set(2, a.org); set(3, auditDates(a)); set(4, [a.lead + ' (Lead)'].concat(a.team, a.teamOther ? [a.teamOther] : []).join(', ')); }
  S.audits.push(a); S.audit = a; S.tpl = tpl; S.photos = [];
  log('Audit created', a.ref + ' on programme ' + tpl.name + ' ' + tpl.version + '; lead auditor ' + a.lead);
  await saveAudit(true); return a;
}
function submitIssues(k) {
  const hard = [], soft = [];
  if (k.miss.naJust.length) hard.push(k.miss.naJust.length + ' N/A question(s) have no justification: ' + k.miss.naJust.slice(0, 8).join(', ') + (k.miss.naJust.length > 8 ? '…' : ''));
  if (k.miss.risk.length) hard.push(k.miss.risk.length + ' assessed question(s) have no severity / likelihood rating: ' + k.miss.risk.slice(0, 8).join(', ') + (k.miss.risk.length > 8 ? '…' : ''));
  if (k.miss.status.length) soft.push(k.miss.status.length + ' question(s) have no response and will be reported as "Not assessed".');
  return { hard, soft };
}
async function importPackage(obj) {
  if (!obj || obj.type !== 'safety-audit-package' || !obj.audit) throw new Error('This is not an audit package file.');
  if (obj.tpl && !S.templates.find(t => t.id === obj.tpl.id)) { await DB.put('templates', obj.tpl); S.templates.push(obj.tpl); }
  const ex = S.audits.find(a => a.id === obj.audit.id); let nR = 0, nP = 0;
  if (!ex) {
    S.audits.push(obj.audit); await DB.put('audits', obj.audit);
    for (const p of obj.photos || []) { await DB.put('photos', p); nP++; }
    return 'Audit ' + obj.audit.ref + ' added with ' + nP + ' photo(s).';
  }
  for (const q in obj.audit.resp) { const inc = obj.audit.resp[q], cur = ex.resp[q]; if (!cur || (inc.at || '') > (cur.at || '')) { ex.resp[q] = inc; nR++; } }
  for (const kk in (obj.audit.profile || {})) if (!ex.profile[kk]) ex.profile[kk] = obj.audit.profile[kk];
  const keys = new Set((ex.trail || []).map(t => t.at + t.act + t.detail));
  (obj.audit.trail || []).forEach(t => { if (!keys.has(t.at + t.act + t.detail)) ex.trail.push(t); });
  ex.trail.sort((a, b) => a.at.localeCompare(b.at));
  const have = new Set((await DB.byAudit(ex.id)).map(p => p.id));
  for (const p of obj.photos || []) if (!have.has(p.id)) { await DB.put('photos', p); nP++; }
  if (ex.status === 'draft' && nR) ex.status = 'inprogress';
  const keep = S.audit; S.audit = ex; log('Audit package merged', nR + ' response(s) and ' + nP + ' photo(s) taken from the imported file'); await saveAudit(true); S.audit = keep;
  if (S.audit && S.audit.id === ex.id) S.photos = await DB.byAudit(ex.id);
  return 'Merged into ' + ex.ref + ': ' + nR + ' newer response(s), ' + nP + ' new photo(s).';
}
async function makeDemo(tplId) {
  const tpl = S.templates.find(t => t.id === tplId) || libTpl(), dec = !!tpl.client;
  const aud = S.users.filter(u => u.role === 'auditor' && u.active !== false).map(u => u.name);
  const a = await createAudit(dec ? { tplId: tpl.id, org: 'Decathlon Sports India (sample)', site: 'Decathlon store, sample mall location', location: 'Sample city', type: 'Electrical and fire safety audit', dateFrom: todayISO(), dateTo: todayISO(), lead: aud[0] || S.user.name, team: aud.slice(1, 2), teamOther: '', scope: 'SAMPLE DATA. Store premises inside a mall: sales floor, stockroom, panel room, UPS room, staff areas. Landlord-owned DG, fire pumps and tanks reviewed through records only.' }
    : { tplId: tpl.id, org: 'Orchid Realty Pvt Ltd (sample)', site: 'Orchid Business Park, Tower B (sample)', location: 'Plot 14, Sector 62, Noida', type: 'Fire and life safety audit - full', dateFrom: todayISO(), dateTo: todayISO(), lead: aud[0] || S.user.name, team: aud.slice(1, 2), teamOther: '', scope: 'SAMPLE DATA. Whole building: two basements, ground and ten upper floors, terrace and external areas.' });
  (tpl.profile || []).forEach(p => { if (!a.profile[p.label] && p.example) a.profile[p.label] = p.example; });
  a.facts = dec ? { height: 12, basements: 0, kw: 180, spk: 'Y', fa: 'Y', hyd: 'Y', yard: 'N', pump: 'N', dpump: 'N', tank: 'N', prs: 'N', fcc: 'N', ac: 'Y', cac: 'Y', lift: 'Y', esc: 'N', kit: 'N', gas: 'N', boil: 'N', atr: 'N', glass: 'Y', park: 'Y', bpark: 'N', epark: 'N', opark: 'Y', clift: 'N', dg: 'Y', sub: 'N', tin: 'N', hv: 'N', oil: 'N', ups: 'Y', solar: 'N', ev: 'N' }
    : { height: 42, basements: 2, kw: 900, spk: 'Y', fa: 'Y', hyd: 'Y', yard: 'Y', pump: 'Y', dpump: 'Y', tank: 'Y', prs: 'Y', fcc: 'Y', ac: 'Y', cac: 'Y', lift: 'Y', esc: 'N', kit: 'Y', gas: 'Y', boil: 'N', atr: 'N', glass: 'Y', park: 'Y', bpark: 'Y', epark: 'N', opark: 'N', clift: 'N', dg: 'Y', sub: 'Y', tin: 'Y', hv: 'Y', oil: 'N', ups: 'Y', solar: 'N', ev: 'N' };
  applyScope(a, tpl);
  let seed = 20261113; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const at = new Date().toISOString(), finds = [];
  tpl.items.forEach(it => {
    const x = rnd(); let r = a.resp[it.id]; if (r && r.scoped) return; r = { by: a.lead, at };
    if (it.meas) {
      const m = it.meas, lo = m.lo != null ? +m.lo : null, hi = m.hi != null ? +m.hi : null, mid = lo != null && hi != null ? (lo + hi) / 2 : lo != null ? lo * 1.08 : hi != null ? hi * 0.7 : 50;
      const n = m.multi ? 3 : 1; r.vals = [];
      for (let i = 0; i < n; i++) { let v = mid * (0.9 + rnd() * 0.2); if (rnd() < 0.18) v = hi != null ? hi * (1.1 + rnd() * 1.5) : lo != null ? lo * (0.8 + rnd() * 0.1) : v; r.vals.push({ l: m.multi ? (/ohm/.test(m.unit) ? 'Pit ' : 'Point ') + (i + 1) : '', v: +v.toFixed(2) }); }
      const st = measResult(it, r); r.st = st || 'C'; r.lik = st === 'C' || !st ? 1 : 2 + Math.floor(rnd() * 3); if (st === 'NC' || st === 'PC') { r.obs = 'Sample: reading outside the benchmark.'; r.rec = 'Sample action: investigate and correct; re-test.'; r.respb = 'Store maintenance'; }
    }
    else if (x < 0.72) { r.st = 'C'; r.lik = 1 + Math.floor(rnd() * 2); }
    else if (x < 0.82) { r.st = 'PC'; r.lik = 2 + Math.floor(rnd() * 3); r.obs = 'Sample observation: requirement met in part; deficiencies noted at two locations.'; r.rec = 'Sample action: rectify the deficiencies noted and record completion.'; r.respb = 'Facility Manager'; }
    else if (x < 0.91) { r.st = 'NC'; r.lik = 2 + Math.floor(rnd() * 4); r.obs = 'Sample observation: requirement not met at the time of audit.'; r.rec = 'Sample action: provide / restore the measure and verify by test.'; r.respb = 'Facility Manager'; }
    else if (x < 0.96) { r.st = 'NA'; r.naJust = 'Sample: not applicable to these premises.'; }
    else { r.st = 'NV'; r.obs = 'Sample: area not accessible / records not produced during the audit.'; }
    if (r.st === 'NC' || r.st === 'PC') finds.push(it.id);
    a.resp[it.id] = r;
  });
  if (typeof document !== 'undefined') {
    try { for (const [i, q] of finds.slice(0, 3).entries()) for (let j = 0; j < (i === 0 ? 3 : 1); j++) { const p = demoPhoto(q + '  view ' + (j + 1), (i * 70 + j * 25) % 360); const ph = { id: uid(), auditId: a.id, qid: q, kind: 'audit', caption: 'Sample photo ' + (j + 1) + ' for ' + q, data: p.data, w: p.w, h: p.h, by: a.lead, at: new Date().toISOString() }; await DB.put('photos', ph); S.photos.push(ph); } } catch (e) { }
  }
  a.status = 'inprogress'; log('Sample responses loaded', 'Demonstration data, not a real audit'); await saveAudit(true); return a;
}
async function ensureBuiltins() {
  const D = BUILTIN; AREAS = D.areas; AREA_NAME = {}; AREAS.forEach(x => AREA_NAME[x.id] = x.name);
  if (!S.templates.some(t => t.id === 'tpl-lib-ver3')) {
    const t = { id: 'tpl-lib-ver3', kind: 'library', name: D.lib.name, version: D.lib.version, active: true, builtin: true, source: D.lib.source, sections: clone(D.lib.sections), items: clone(D.lib.items), profile: clone(D.lib.profile), createdAt: new Date().toISOString() };
    await DB.put('templates', t); S.templates.push(t);
  }
  if (!S.templates.some(t => t.id === 'tpl-decathlon-p1')) {
    const { tpl } = buildProgramme(S.templates.find(t => t.id === 'tpl-lib-ver3'), D.decRows, D.decMeta, []); tpl.id = 'tpl-decathlon-p1'; tpl.builtin = true; tpl.active = true;
    await DB.put('templates', tpl); S.templates.push(tpl);
  }
}
async function runReport(kind) { await reportFor(S.audit, kind); }
function setPath(o, path, v) { const ks = path.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]]; x[ks[ks.length - 1]] = v; }
function readFile(file, as) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); as === 'text' ? fr.readAsText(file) : fr.readAsArrayBuffer(file); }); }

/* ---------- click actions ---------- */
const ACT = {
  nav(d) { const r = Object.assign({}, d); delete r.act; go(r); },
  back() { if (typeof history !== 'undefined' && history.state && S.route.v !== homeView()) history.back(); else go({ v: homeView() }); },
  home() { go({ v: homeView() }); },
  async openAudit(d) { await go({ v: 'overview', a: d.id }); },
  filter(d) { S.filter = d.f; rerender(); },
  tile(d) { S.filter = d.f; S.search = ''; go({ v: 'sections' }); },
  matrix(d) { S.matrix = d.m; rerender(); },
  setSt(d) {
    const a = S.audit; if (!canAssess(a)) return; const r = R(d.q), old = r.st || '';
    r.st = old === d.st ? '' : d.st; if (r.st === 'NA') { delete r.lik; delete r.sev; } delete r.scoped; if (r.st !== 'NA' && old === 'NA') delete r.naJust;
    const it3 = S.tpl.items.find(x => x.id === d.q); if (it3 && it3.meas) { const auto = measResult(it3, r); if (auto && r.st !== auto) r.stManual = true; else delete r.stManual; }
    touch(d.q); logEdit(d.q, 'status ' + (old || 'blank') + ' to ' + (r.st || 'blank')); rerender();
  },
  setSev(d) { if (!canAssess(S.audit)) return; const r = R(d.q), it = S.tpl.items.find(x => x.id === d.q), old = effSev(it, r); r.sev = +d.n; touch(d.q); logEdit(d.q, 'severity ' + old + ' to ' + d.n); rerender(); },
  setLik(d) { if (!canAssess(S.audit)) return; const r = R(d.q), old = r.lik || 'blank'; r.lik = r.lik === +d.n ? null : +d.n; delete r.likAuto; touch(d.q); logEdit(d.q, 'likelihood ' + old + ' to ' + (r.lik || 'blank')); rerender(); },
  resetSev(d) { if (!canAssess(S.audit)) return; delete R(d.q).sev; touch(d.q); rerender(); },
  async delPhoto(d) {
    const p = S.photos.find(x => x.id === d.id); if (!p) return;
    ask({ title: 'Delete this photo?', msg: 'The photo will be removed from question ' + p.qid + '.', okLabel: 'Delete', danger: 1, ok: async () => { await DB.del('photos', p.id); S.photos = S.photos.filter(x => x.id !== p.id); logEdit(p.qid, 'photo deleted'); saveAudit(); } });
  },
  bulkNA(d) {
    const open = S.tpl.items.filter(it => it.sec === d.sec && !(S.audit.resp[it.id] || {}).st);
    if (!open.length) return toast('No unanswered questions in this section.');
    ask({ title: 'Mark ' + open.length + ' unanswered question(s) in Section ' + d.sec + ' as N/A', msg: 'Give the justification. It is recorded against each question with your name and the time.', input: 1, placeholder: 'e.g. The building has no atrium', okLabel: 'Mark as N/A', ok: v => { open.forEach(it => { const r = R(it.id); r.st = 'NA'; r.naJust = v; delete r.lik; touch(it.id); }); log('Bulk N/A', 'Section ' + d.sec + ': ' + open.length + ' question(s). Justification: ' + v); } });
  },
  submit() {
    const a = S.audit, k = computeAudit(a, S.tpl), is = submitIssues(k);
    if (is.hard.length) return ask({ title: 'The audit cannot be submitted yet', msg: is.hard.join('\n\n') + '\n\nUse the "To complete" filter in the Checklist to find them.', okLabel: 'Open checklist', ok: () => { S.filter = 'todo'; go({ v: 'sections' }); } });
    ask({ title: 'Submit audit ' + a.ref + '?', msg: (is.soft.length ? is.soft.join('\n') + '\n\n' : '') + 'After submission the responses are locked. A reviewer or administrator can return the audit for correction; every later change is recorded in the audit trail.', okLabel: 'Submit', ok: () => { a.status = 'submitted'; a.submittedAt = new Date().toISOString(); a.submittedBy = S.user.name; log('Audit submitted', 'Compliance ' + pct(k.score) + ', rating ' + k.rating); saveAudit(true); } });
  },
  approve() { const a = S.audit; ask({ title: 'Approve audit ' + a.ref + '?', msg: 'Optional review comment:', input: 1, optional: 1, okLabel: 'Approve', ok: v => { a.status = 'approved'; a.approvedAt = new Date().toISOString(); a.approvedBy = S.user.name; a.reviewNote = v; log('Audit approved', v); saveAudit(true); } }); },
  returnAudit() { const a = S.audit; ask({ title: 'Return audit to the auditor', msg: 'State what needs correction. The audit is unlocked and every change from now on is recorded in the audit trail.', input: 1, okLabel: 'Return for correction', ok: v => { a.status = 'inprogress'; a.reopened = true; delete a.approvedAt; delete a.approvedBy; log('Audit returned for correction', v); saveAudit(true); } }); },
  closeAudit() { const a = S.audit; ask({ title: 'Close audit ' + a.ref + '?', msg: 'All findings are verified closed. Closing marks the audit as complete.', okLabel: 'Close audit', ok: () => { a.status = 'closed'; a.closedAt = new Date().toISOString(); log('Audit closed', 'All corrective actions verified'); saveAudit(true); } }); },
  cloSet(d) {
    if (!canClosure(S.audit)) return; const r = R(d.q), c = r.clo || (r.clo = {}); c.status = d.st;
    if (d.st === 'done' && !c.doneDate) c.doneDate = todayISO();
    if (d.st === 'verified') { c.verBy = S.user.name; c.verDate = c.verDate || todayISO(); if (!c.doneDate) c.doneDate = todayISO(); } else { delete c.verBy; delete c.verDate; }
    r.at = new Date().toISOString(); log('Closure status changed', d.q + ': ' + CLO[d.st]); saveAudit(); rerender();
  },
  async report(d) { try { await runReport(d.k); toast('Report downloaded'); } catch (e) { console.error(e); toast('Report failed: ' + e.message); } },
  async exportAudit() { const a = S.audit; await saveAudit(true); download(JSON.stringify({ type: 'safety-audit-package', v: 1, exportedAt: new Date().toISOString(), exportedBy: S.user.name, audit: a, tpl: S.tpl, photos: S.photos }), a.ref + '_audit_package.json', 'application/json'); },
  deleteAudit() { const a = S.audit; ask({ title: 'Delete audit ' + a.ref + '?', msg: 'The audit, its responses and its photos are removed from this device. This cannot be undone. Type the audit reference to confirm.', input: 1, placeholder: a.ref, okLabel: 'Delete', danger: 1, ok: async v => { if (v.trim() !== a.ref) return toast('Reference did not match; nothing deleted.'); for (const p of S.photos) await DB.del('photos', p.id); await DB.del('audits', a.id); S.audits = S.audits.filter(x => x.id !== a.id); S.audit = null; S.photos = []; go({ v: homeView() }); } }); },
  applyCfg() { ask({ title: 'Apply current scoring settings to this audit?', msg: 'The audit keeps the settings that were in force when it was created. Applying the current settings recalculates its scores and grades.', okLabel: 'Apply', ok: () => { S.audit.cfg = clone(S.settings); log('Scoring settings updated', 'Current platform settings applied'); saveAudit(true); } }); },
  startNew() { const aud = S.users.filter(u => u.role === 'auditor' && u.active !== false); S.form = { org: '', site: '', location: '', type: 'Fire and life safety audit - full', dateFrom: todayISO(), dateTo: '', lead: (aud[0] || {}).name || '', team: [], teamOther: '', scope: '', tplId: (S.templates.find(t => t.active) || {}).id || '' }; go({ v: 'newAudit' }); },
  async createAudit() {
    const f = S.form; if (!f.site.trim() || !f.org.trim()) return toast('Enter the organisation and the facility / site name.');
    if (!f.tplId) return toast('Select a checklist version.');
    if (!f.lead) return toast('Select a lead auditor. The System Administrator must first create auditor accounts.');
    const a = await createAudit(f); S.form = null; go({ v: Object.keys(factUse(S.tpl)).length ? 'scope' : 'overview', a: a.id }, true);
  },
  async demo() { const a = await makeDemo('tpl-decathlon-p1'); go({ v: S.mode === 'admin' ? 'aaudit' : 'overview', a: a.id }); },
  tplToggle(d) { const t = S.templates.find(x => x.id === d.id); t.active = !t.active; DB.put('templates', t); rerender(); },
  async tplDup(d) { const t = S.templates.find(x => x.id === d.id), n = clone(t); n.id = 'tpl-' + uid(); n.builtin = false; n.active = false; n.createdAt = new Date().toISOString(); const m = /^(.*?)(\d+)$/.exec(t.version || ''); n.version = m ? m[1] + (+m[2] + 1) : (t.version || 'Ver') + ' copy'; n.source = 'Copied from ' + t.name + ' ' + t.version; S.templates.push(n); await DB.put('templates', n); go({ v: 'tpl', t: n.id }); toast('New version created (inactive). Edit it, then activate.'); },
  tplDel(d) { const t = S.templates.find(x => x.id === d.id); if (tplUsed(t.id)) return toast('This version is used by an audit and cannot be deleted.'); ask({ title: 'Delete checklist "' + t.name + ' ' + t.version + '"?', msg: 'This cannot be undone.', okLabel: 'Delete', danger: 1, ok: async () => { await DB.del('templates', t.id); S.templates = S.templates.filter(x => x.id !== t.id); go({ v: 'templates' }, true); } }); },
  tqAdd(d) { const t = S.templates.find(x => x.id === d.t); if (tplUsed(t.id)) return; const sec = d.sec || t.sections[0].id; let n = t.items.filter(i => i.sec === sec).length + 1, id; do { id = sec + '-' + String(n++).padStart(2, '0'); } while (t.items.some(i => i.id === id)); const it = { id, sec, req: '', ref: '', type: 'Mandatory (shall)', app: 'All', guide: '', method: 'V', sev: 3, weight: 3 }; let pos = -1; t.items.forEach((x, i) => { if (x.sec === sec) pos = i; }); t.items.splice(pos + 1, 0, it); DB.put('templates', t); go({ v: 'tq', t: t.id, q: id }); },
  tqDel(d) { const t = S.templates.find(x => x.id === d.t); if (tplUsed(t.id)) return; ask({ title: 'Delete question ' + d.q + '?', msg: '', okLabel: 'Delete', danger: 1, ok: () => { t.items = t.items.filter(i => i.id !== d.q); DB.put('templates', t); go({ v: 'tpl', t: t.id }, true); } }); },
  secAdd(d) { const t = S.templates.find(x => x.id === d.t); if (tplUsed(t.id)) return; ask({ title: 'Add section', msg: 'Section name:', input: 1, okLabel: 'Add', ok: v => { let i = 0, id; do { id = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''); i++; } while (t.sections.some(s => s.id === id)); t.sections.push({ id, name: v }); DB.put('templates', t); } }); },
  addRating() { S.settings.ratings.push({ name: 'New band', min: 0 }); saveSettings(); rerender(); },
  delRating(d) { if (S.settings.ratings.length <= 2) return toast('At least two rating bands are needed.'); S.settings.ratings.splice(+d.i, 1); saveSettings(); rerender(); },
  resetSettings() { ask({ title: 'Reset scoring settings?', msg: 'Credits, risk grade bands and rating bands return to the values on the Risk Grading sheet of the Excel checklist.', okLabel: 'Reset', ok: () => { const keep = S.settings; S.settings = defaultSettings(BUILTIN); ['refPrefix', 'deviceCode', 'firm', 'retentionYears'].forEach(k => S.settings[k] = keep[k]); saveSettings(); } }); },
  async backup() { const photos = await DB.all('photos'); download(JSON.stringify({ type: 'safety-audit-backup', v: 1, at: new Date().toISOString(), settings: S.settings, users: S.users, templates: S.templates, audits: S.audits, photos, counter: await DB.get('kv', 'counter') }), 'Safety_Audit_Backup_' + todayISO() + '.json', 'application/json'); },
  wipe() { ask({ title: 'Erase all data on this device?', msg: 'All audits, photos, imported checklists, users and settings are removed. Take a backup first. Type ERASE to confirm.', input: 1, placeholder: 'ERASE', okLabel: 'Erase everything', danger: 1, ok: async v => { if (v.trim() !== 'ERASE') return toast('Not confirmed; nothing erased.'); for (const s of ['kv', 'templates', 'audits', 'photos']) await DB.clear(s); S.audit = null; await loadAll(); signOut(true); } }); },
  modalCancel() { S.modal = null; rerender(); },
  async modalOk() {
    const m = S.modal; if (!m) return; let v = '';
    if (m.input) { v = (document.getElementById('modal-in').value || '').trim(); if (!v && !m.optional) return toast('Please fill in the text box.'); }
    S.modal = null; try { await m.ok(v); } catch (e) { console.error(e); toast(e.message); }
    rerender();
  }
};

/* ---------- field input ---------- */
function onInput(el, ev) {
  const d = el.dataset, a = S.audit, isChange = ev.type === 'change';
  let v = el.type === 'checkbox' ? el.checked : el.value; if (d.num != null) { v = parseFloat(v); if (isNaN(v)) return; }
  switch (d.scope) {
    case 'resp': if (!canAssess(a)) return; R(d.q)[d.f] = v; touch(d.q); if (isChange) logEdit(d.q, d.f + ' edited'); break;
    case 'clo': { if (!canClosure(a)) return; const r = R(d.q); (r.clo || (r.clo = {}))[d.f] = v; r.at = new Date().toISOString(); saveAudit(); break; }
    case 'cap': { const p = S.photos.find(x => x.id === d.id); if (p) { p.caption = v; clearTimeout(p._t); p._t = setTimeout(() => { const o = Object.assign({}, p); delete o._t; DB.put('photos', o); }, 400); } break; }
    case 'audit': if (['summaryNote', 'conclusion', 'closureNote'].includes(d.f) ? (S.user.role === 'management' || S.user.role === 'auditadmin' || a.status === 'closed') : !canDetails(a)) return; a[d.f] = v; saveAudit(); break;
    case 'team': if (!canDetails(a)) return; a.team = a.team.filter(n => n !== d.name); if (v) a.team.push(d.name); saveAudit(); break;
    case 'profile': if (!canDetails(a)) return; a.profile[d.label] = v; saveAudit(); break;
    case 'form': S.form[d.f] = v; break;
    case 'formteam': S.form.team = S.form.team.filter(n => n !== d.name); if (v) S.form.team.push(d.name); break;
    case 'set': setPath(S.settings, d.path, v); saveSettings(); break;
    case 'uform': if (S.form) S.form[d.f] = v; break;
    case 'tpl': { const t = S.templates.find(x => x.id === d.t); if (t) { t[d.f] = v; DB.put('templates', t); } break; }
    case 'tsec': { const t = S.templates.find(x => x.id === d.t), s = t && t.sections.find(x => x.id === d.sec); if (s && !tplUsed(t.id)) { s.name = v; DB.put('templates', t); } break; }
    case 'tq': { const t = S.templates.find(x => x.id === d.t); if (!t || tplUsed(t.id)) return; const it = t.items.find(x => x.id === d.q); if (!it) return; if (d.f === 'id') { if (!isChange) return; v = v.trim(); if (!v || t.items.some(x => x.id === v)) { toast('Question ID must be unique and not blank.'); el.value = it.id; return; } it.id = v; DB.put('templates', t); go({ v: 'tq', t: t.id, q: v }, true); return; } it[d.f] = v; DB.put('templates', t); break; }
    case 'opt': S.opt[d.f] = v; break;
    case 'regq': S.reg.q = v; { const l = document.getElementById('reglist'); if (l) l.innerHTML = regListHtml(); } break;
    default: if (INPUT_EXT[d.scope]) INPUT_EXT[d.scope](d, v, isChange, el); break;
    case 'search': S.search = v; { const l = document.getElementById('qlist'); if (l) l.innerHTML = checklistBody(); } break;
  }
}
async function onFile(el) {
  const d = el.dataset, files = [...el.files]; el.value = ''; if (!files.length) return;
  try {
    if (d.file === 'photo') { if (d.kind === 'closure' ? !canClosure(S.audit) : !canAssess(S.audit)) return; await addPhotos(files, d.q, d.kind || 'audit'); }
    else if (d.file === 'xlsx') {
      const sheets = await readXlsx(new Uint8Array(await readFile(files[0]))), t = templateFromSheets(sheets, files[0].name);
      const base = S.templates.find(x => x.builtin) || S.templates[0];
      const tpl = Object.assign({ id: 'tpl-' + uid(), active: false, builtin: false, kind: 'programme', basis: '', createdAt: new Date().toISOString() }, t); if (!tpl.profile || !tpl.profile.length) tpl.profile = clone(base.profile);
      const same = S.templates.filter(x => x.name === tpl.name).length; if (same) tpl.version = 'Ver' + (same + 1);
      S.templates.push(tpl); await DB.put('templates', tpl); go({ v: 'tpl', t: tpl.id }); toast('Imported ' + tpl.items.length + ' questions in ' + tpl.sections.length + ' sections. Review, then activate.');
    }
    else if (d.file === 'kpis') await onKpiFile(files[0]);
    else if (d.file === 'package') { const msg = await importPackage(JSON.parse(await readFile(files[0], 'text'))); toast(msg); rerender(); }
    else if (d.file === 'restore') {
      const b = JSON.parse(await readFile(files[0], 'text')); if (b.type === 'safety-audit-package') { toast(await importPackage(b)); return rerender(); }
      if (b.type !== 'safety-audit-backup') throw new Error('This is not a backup file.');
      ask({ title: 'Restore backup of ' + fmtDT(b.at) + '?', msg: 'Everything on this device is replaced by the backup: ' + b.audits.length + ' audit(s), ' + b.photos.length + ' photo(s), ' + b.templates.length + ' checklist(s).', okLabel: 'Restore', danger: 1, ok: async () => { for (const s of ['kv', 'templates', 'audits', 'photos']) await DB.clear(s); await DB.put('kv', b.settings, 'settings'); await DB.put('kv', b.users, 'users'); if (b.counter) await DB.put('kv', b.counter, 'counter'); for (const t of b.templates) await DB.put('templates', t); for (const a of b.audits) await DB.put('audits', a); for (const p of b.photos) await DB.put('photos', p); S.audit = null; await loadAll(); signOut(true); toast('Backup restored'); } });
    }
  } catch (e) { console.error(e); toast('Import failed: ' + e.message); }
}
async function loadAll() {
  S.templates = await DB.all('templates');
  await ensureBuiltins();
  S.settings = Object.assign(defaultSettings(BUILTIN), (await DB.get('kv', 'settings')) || {});
  S.users = migrateUsers((await DB.get('kv', 'users')) || []);
  S.activity = (await DB.get('kv', 'activity')) || [];
  S.audits = await DB.all('audits');
}
async function boot(builtin) {
  BUILTIN = builtin; BUILTIN.name = builtin.lib.name; BUILTIN.profile = builtin.lib.profile; await DB.open(); S.memOnly = !DB.db; await loadAll();
  if (typeof document === 'undefined') return;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); Promise.resolve(f(Object.assign({}, el.dataset), el)).catch(err => { console.error(err); toast(err.message); }); } });
  const inH = e => { const el = e.target; if (el.dataset && el.dataset.file) { if (e.type === 'change') onFile(el); return; } if (el.dataset && el.dataset.scope) { if (e.type === 'change' && el.dataset.rr != null) { onInput(el, e); rerender(); } else onInput(el, e); } };
  document.addEventListener('input', inH); document.addEventListener('change', inH);
  window.addEventListener('popstate', async e => { const r = e.state || { v: 'home' }; if ((AUDIT_VIEWS.includes(r.v) || r.v === 'aaudit') && !(await ensureAudit(r.a))) { S.route = { v: 'home' }; } else S.route = r; S.modal = null; render(); });
  window.addEventListener('pagehide', () => { if (S.audit && _saveT) { clearTimeout(_saveT); DB.put('audits', S.audit); } });
  document.addEventListener('submit', e => { const f = e.target.dataset && e.target.dataset.form; if (f && ACT[f]) { e.preventDefault(); Promise.resolve(ACT[f]()).catch(err => { console.error(err); toast(err.message); }); } });
  window.addEventListener('hashchange', () => { const m = /^#admin/i.test(location.hash) ? 'admin' : 'user'; if (m !== S.mode) { S.mode = m; signOut(true); } });
  ['click', 'input', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, () => { S.lastAct = Date.now(); }, { passive: true }));
  setInterval(() => { if (S.user && Date.now() - (S.lastAct || Date.now()) > IDLE_MIN * 60000) { signOut(); toast('Signed out after ' + IDLE_MIN + ' minutes without activity.'); } }, 30000);
  S.mode = /^#admin/i.test(location.hash) ? 'admin' : 'user'; S.lastAct = Date.now(); restoreSession(); S.by = ss('sap-by') || 'area';
  S.route = { v: S.user ? homeView() : loginView() };
  try { history.replaceState(S.route, ''); } catch (e) { }
  render();
}
