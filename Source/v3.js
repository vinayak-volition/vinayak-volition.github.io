/* ---------- v0.3: library + programmes, scoping, site walk-through, quick answer, measurements ---------- */
let AREAS = [], AREA_NAME = {};
const FACTS = [
  ['Building', [['height', 'Building height (m)', 'num'], ['basements', 'Number of basements', 'num'], ['atr', 'Atrium'], ['glass', 'Glass facade / curtain wall'], ['park', 'Car parking'], ['bpark', 'Basement car parking'], ['epark', 'Enclosed (above-ground) car parking'], ['opark', 'Stilt / open car parking'], ['clift', 'Car lifts']]],
  ['Fire protection systems', [['spk', 'Sprinklers (full or partial)'], ['fa', 'Automatic fire alarm / detection'], ['hyd', 'Internal hydrants, wet risers or hose reels'], ['yard', 'Yard (external) hydrants'], ['pump', 'Fire pumps on the premises'], ['dpump', 'Diesel fire pump'], ['tank', 'Fire water tank on the premises'], ['prs', 'Staircase / lobby pressurization'], ['fcc', 'Fire command centre']]],
  ['Building services', [['ac', 'Air-conditioned premises (any system)'], ['cac', 'Central air conditioning (AHUs / ducted)'], ['lift', 'Passenger lifts'], ['esc', 'Escalators / moving walks'], ['kit', 'Commercial kitchen'], ['gas', 'Piped gas or LPG'], ['boil', 'Boilers']]],
  ['Electrical supply', [['kw', 'Connected load (kW)', 'num'], ['dg', 'DG set(s) serving the premises'], ['sub', 'Substation / HT switch room on the premises'], ['tin', 'Transformer(s) inside the building'], ['hv', 'HV (above 650 V) installation owned by the occupier'], ['oil', 'Oil-filled transformer / switchgear'], ['ups', 'UPS, battery bank or IT loads'], ['solar', 'Solar PV'], ['ev', 'EV charging points']]]
];
const FACT = {}; FACTS.forEach(g => g[1].forEach(f => FACT[f[0]] = { k: f[0], label: f[1], num: f[2] === 'num' }));
function factOf(key) { const m = /^h(\d+)$/.exec(key); return m ? 'height' : key === 'bas' ? 'basements' : key === 'kw250' ? 'kw' : key; }
function evalKey(key, F) {
  if (key.includes('/')) { const r = key.split('/').map(k => evalKey(k, F)); return r.some(x => x.ok === true) ? { ok: true } : r.every(x => x.ok === false) ? { ok: false, why: r.map(x => x.why).join(' and ') } : { ok: null }; }
  const m = /^h(\d+)$/.exec(key), num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
  if (m) { const h = num(F.height); return h == null ? { ok: null } : h >= +m[1] ? { ok: true } : { ok: false, why: 'building height ' + h + ' m is below ' + m[1] + ' m' }; }
  if (key === 'bas') { const b = num(F.basements); return b == null ? { ok: null } : b > 0 ? { ok: true } : { ok: false, why: 'no basement' }; }
  if (key === 'kw250') { const k = num(F.kw); return k == null ? { ok: null } : k > 250 ? { ok: true } : { ok: false, why: 'connected load ' + k + ' kW is not above 250 kW' }; }
  const v = F[key]; if (v === 'Y') return { ok: true }; if (v === 'N') return { ok: false, why: 'no ' + ((FACT[key] || {}).label || key).toLowerCase() }; return { ok: null };
}
function scopeOf(it, F) { if (!it.rule || !it.rule.length || !F) return { ok: true }; const why = []; for (const k of it.rule) { const r = evalKey(k, F); if (r.ok === false) why.push(r.why); } return why.length ? { ok: false, why: why.join('; ') } : { ok: true }; }
function applyScope(a, tpl) {
  let out = 0, back = 0; const at = new Date().toISOString();
  tpl.items.forEach(it => {
    const s = scopeOf(it, a.facts), r = a.resp[it.id];
    if (!s.ok) { if (!r || !r.st || r.scoped) { a.resp[it.id] = { st: 'NA', naJust: 'Out of scope (building profile): ' + s.why + '.', scoped: true, by: S.user.name, at }; out++; } }
    else if (r && r.scoped) { delete a.resp[it.id]; back++; }
  });
  a.scopedAt = at; return { out, back };
}
function scopedCount(a, tpl) { return tpl.items.filter(it => (a.resp[it.id] || {}).scoped).length; }
function factUse(tpl) { const u = {}; tpl.items.forEach(it => (it.rule || []).forEach(k => k.split('/').forEach(x => { const f = factOf(x); u[f] = (u[f] || 0) + 1; }))); return u; }

/* measurements */
function measOne(m, v) {
  if (v === '' || v == null || isNaN(+v)) return null; v = +v;
  const has = x => x != null && x !== '';
  if (!has(m.lo) && !has(m.hi)) return null;
  if ((!has(m.lo) || v >= +m.lo) && (!has(m.hi) || v <= +m.hi)) return 'C';
  if ((has(m.pcLo) || has(m.pcHi)) && (!has(m.pcLo) || v >= +m.pcLo) && (!has(m.pcHi) || v <= +m.pcHi)) return 'PC';
  return 'NC';
}
function measResult(it, r) { if (!it.meas) return null; const res = (r.vals || []).map(x => measOne(it.meas, x.v)).filter(Boolean); if (!res.length) return null; return res.includes('NC') ? 'NC' : res.includes('PC') ? 'PC' : 'C'; }
function valsText(it, r) { if (!it.meas || !r || !(r.vals || []).length) return ''; return r.vals.filter(x => x.v !== '' && x.v != null).map(x => (x.l ? x.l + ': ' : '') + x.v + (it.meas.unit ? ' ' + it.meas.unit : '')).join('; '); }
function measSync(it, r) {
  const st = measResult(it, r); if (!st || r.stManual) return;
  r.st = st; delete r.scoped; delete r.naJust;
  if (st === 'C' && !r.lik) { r.lik = S.audit.cfg.quickLik || 1; r.likAuto = true; }
}

/* grouping by site area or by section / KPI group */
function areaOf(it) { return it.area && AREA_NAME[it.area] ? it.area : 'OTH'; }
function groupList(tpl, by) {
  if (by === 'area') { const used = new Set(tpl.items.map(areaOf)); return AREAS.filter(x => used.has(x.id)).concat(used.has('OTH') ? [{ id: 'OTH', name: 'Other / not assigned' }] : []); }
  return tpl.sections;
}
function inGroup(it, by, g) { return by === 'area' ? areaOf(it) === g : it.sec === g; }
function groupStats(a, tpl, k, by) {
  return groupList(tpl, by).map(g => {
    const its = tpl.items.filter(it => inGroup(it, by, g.id)), o = { id: g.id, name: g.name, items: its.length, scoped: 0, live: 0, answered: 0, find: 0, num: 0, den: 0, counts: { C: 0, PC: 0, NC: 0, NA: 0, NV: 0, none: 0 } };
    its.forEach(it => { const r = a.resp[it.id] || {}, p = k.per[it.id]; o.counts[r.st || 'none']++; if (r.scoped) { o.scoped++; return; } o.live++; if (r.st) o.answered++; if (r.st === 'NC' || r.st === 'PC') o.find++; if (p.credit != null) { o.num += p.weighted; o.den += p.weight; } });
    o.score = o.den ? o.num / o.den * 100 : null; return o;
  });
}
const byLabel = tpl => tpl.client ? 'KPI group' : 'Section';

/* ---------- views ---------- */
function quickCard(it, k, ed) {
  const a = S.audit, r = a.resp[it.id] || {}, p = k.per[it.id], n = S.photos.filter(x => x.qid === it.id && x.kind !== 'closure').length, vt = valsText(it, r);
  const qb = !ed ? '' : it.meas ? `<div class="qbtns"><button class="btn sm" data-act="nav" data-v="q" data-q="${esc(it.id)}">${vt ? 'Edit readings' : 'Enter reading'} ›</button></div>`
    : `<div class="qbtns">${ST_KEYS.map(s => `<button class="qb${r.st === s ? ' on' : ''}" style="--c:${ST[s].color};--b:${ST[s].bg}" data-act="quick" data-q="${esc(it.id)}" data-st="${s}" aria-label="${ST[s].label}">${s}</button>`).join('')}</div>`;
  return `<div class="qc${r.scoped ? ' scoped' : ''}" style="border-left-color:${r.st ? ST[r.st].color : '#cfd4dc'}"><button class="qc-b" data-act="nav" data-v="q" data-q="${esc(it.id)}"><div class="qr-h"><b>${esc(it.id)}</b>${it.client ? '<span class="tag k">Client KPI</span>' : ''}${it.meas ? '<span class="tag m">Reading</span>' : ''}${pill(r.st)}${gchip(a.cfg, p.risk)}${n ? `<span class="cam">▣ ${n}</span>` : ''}</div><p>${esc(it.req)}</p>${vt ? `<small class="vt">${esc(vt)}</small>` : ''}${r.scoped ? `<small class="muted">${esc(r.naJust)}</small>` : ''}</button>${r.scoped ? '' : qb}</div>`;
}
function walkIndex() {
  const a = S.audit, t = S.tpl, k = computeAudit(a, t), by = S.by, gs = groupStats(a, t, k, by), sc = scopedCount(a, t), uses = Object.keys(factUse(t)).length;
  let h = '';
  if (uses && !a.facts && canAssess(a)) h += `<div class="card scopecta"><b>Step 1: scope this audit</b><p class="small">Answer about ${uses} questions about the building. Requirements that cannot apply are set aside automatically, with the reason recorded.</p><button class="btn pri" data-act="nav" data-v="scope">Scope the audit</button></div>`;
  else if (a.facts) h += `<p class="muted small">${sc} question(s) out of scope from the building profile · <button class="lnk" data-act="nav" data-v="scope">edit scoping</button></p>`;
  h += gs.map(g => `<button class="sec" data-act="nav" data-v="section" data-g="${esc(g.id)}"><span class="sid${by === 'area' ? ' ar' : ''}">${esc(by === 'area' ? g.id.slice(0, 3) : g.id)}</span><div class="sbody"><b>${esc(g.name)}</b><small>${g.answered} of ${g.live} answered${g.find ? ' · ' + g.find + ' finding(s)' : ''}${g.score != null ? ' · ' + pct(g.score) : ''}${g.scoped ? ' · ' + g.scoped + ' out of scope' : ''}</small>${bar(g.live ? g.answered / g.live * 100 : 100)}</div><span class="chev">›</span></button>`).join('');
  return h;
}
function byToggle() { const t = S.tpl; return `<div class="seg"><button class="${S.by === 'area' ? 'on' : ''}" data-act="setBy" data-by="area">By site area</button><button class="${S.by !== 'area' ? 'on' : ''}" data-act="setBy" data-by="sec">By ${t.client ? 'KPI group' : 'section'}</button></div>`; }
function v3checklistBody() {
  const a = S.audit, t = S.tpl, k = computeAudit(a, t), q = S.search.trim().toLowerCase(), g = S.route.v === 'section' ? (S.route.g || S.route.sec) : null, ed = canAssess(a);
  if (!g && !q && S.filter === 'all') return walkIndex();
  const items = t.items.filter(it => (!g || inGroup(it, S.route.sec ? 'sec' : S.by, g)) && (S.showScoped || !(a.resp[it.id] || {}).scoped || S.filter === 'NA') && qMatches(it, a.resp[it.id] || {}, k.per[it.id]) && (!q || (it.id + ' ' + it.req + ' ' + (it.ref || '') + ' ' + (it.kpi || '') + ' ' + (it.libRef || '')).toLowerCase().includes(q)));
  S.navList = items.map(it => it.id);
  if (!items.length) return '<p class="muted pad">No questions match this filter.</p>';
  return `<p class="muted small">${items.length} question(s)</p>` + items.slice(0, 400).map(it => quickCard(it, k, ed)).join('');
}
V.sections = function () {
  return `${byToggle()}<input class="search" type="search" data-scope="search" value="${esc(S.search)}" placeholder="Search question, ID, clause or client KPI">${chips()}<div id="qlist">${checklistBody()}</div>`;
};
V.section = function (r) {
  const a = S.audit, t = S.tpl, k = computeAudit(a, t), by = r.sec ? 'sec' : S.by, gid = r.g || r.sec, g = groupStats(a, t, k, by).find(x => x.id === gid); if (!g) return note('Group not found.');
  const ed = canAssess(a), open = t.items.filter(it => inGroup(it, by, gid) && !(a.resp[it.id] || {}).st && !it.meas).length;
  return `<div class="sechead"><span class="sid${by === 'area' ? ' ar' : ''}">${esc(by === 'area' ? gid.slice(0, 3) : gid)}</span><div><b>${esc(g.name)}</b><small>${g.answered} of ${g.live} answered · compliance ${pct(g.score)}${g.scoped ? ' · ' + g.scoped + ' out of scope' : ''}</small></div></div>${bar(g.live ? g.answered / g.live * 100 : 100)}
    ${chips()}${g.scoped ? `<label class="check small"><input type="checkbox" data-scope="showScoped"${S.showScoped ? ' checked' : ''} data-rr> Show the ${g.scoped} out-of-scope question(s)</label>` : ''}<div id="qlist">${checklistBody()}</div>
    ${ed && open ? `<div class="btnrow"><button class="btn" data-act="groupAllC" data-g="${esc(gid)}" data-by="${by}">Mark the ${open} unanswered as Compliant…</button><button class="btn" data-act="bulkNA" data-g="${esc(gid)}" data-by="${by}">…as N/A…</button></div>` : ''}`;
};
V.scope = function () {
  const a = S.audit, t = S.tpl, F = a.facts || {}, use = factUse(t), ed = canAssess(a) || canDetails(a);
  const row = f => { const v = F[f.k] == null ? '' : F[f.k], n = use[f.k] || 0;
    return `<div class="frow${n ? '' : ' unused'}"><div><b>${esc(f.label)}</b><small>${n ? 'decides ' + n + ' question(s)' : 'not used by this programme'}</small></div>${f.num ? `<input type="number" inputmode="decimal" step="any" data-scope="fact" data-k="${f.k}" value="${esc(v)}"${dis(ed)}>` : `<div class="yn">${[['Y', 'Yes'], ['N', 'No'], ['', '?']].map(o => `<button class="${v === o[0] ? 'on' : ''}" data-act="setFact" data-k="${f.k}" data-v="${o[0]}"${dis(ed)}>${o[1]}</button>`).join('')}</div>`}</div>`; };
  const groups = FACTS.map(g => { const fs = g[1].map(x => FACT[x[0]]), used = fs.filter(f => use[f.k]), unused = fs.filter(f => !use[f.k]); return { name: g[0], used, unused }; });
  const prev = t.items.filter(it => !scopeOf(it, F).ok).length;
  return `<p class="muted small">Answer what you know; leave "?" where unsure, and the requirement stays in the audit. Requirements out of scope are marked N/A with the reason. The auditor can still answer any of them.</p>
    ${groups.filter(g => g.used.length).map(g => `<div class="card"><h3>${esc(g.name)}</h3>${g.used.map(row).join('')}</div>`).join('')}
    ${groups.some(g => g.unused.length) ? `<details class="card"><summary>Other facts (not used by this programme)</summary>${groups.map(g => g.unused.map(row).join('')).join('')}</details>` : ''}
    <div class="card sticky-s"><div class="sr-t"><span>Out of scope with these answers</span><b>${prev} of ${t.items.length}</b></div>${ed ? '<button class="btn pri wide" data-act="applyScope">Apply scoping</button>' : ''}</div>`;
};
function measBlock(it, rs, ed) {
  const m = it.meas, vals = rs.vals && rs.vals.length ? rs.vals : [{ l: '', v: '' }], res = measResult(it, rs), lim = (m.lo != null && m.lo !== '') || (m.hi != null && m.hi !== '');
  return `<div class="card meas"><h3>Readings</h3><p class="small"><b>Benchmark:</b> ${esc(m.bench || 'none set')}</p>
    ${vals.map((x, i) => { const s = measOne(m, x.v); return `<div class="mrow">${m.multi || vals.length > 1 ? `<input data-scope="val" data-q="${esc(it.id)}" data-i="${i}" data-f="l" value="${esc(x.l)}" placeholder="Point / location"${dis(ed)}>` : ''}<input type="number" inputmode="decimal" step="any" data-scope="val" data-q="${esc(it.id)}" data-i="${i}" data-f="v" value="${esc(x.v)}" placeholder="Reading" data-rr${dis(ed)}><span class="unit">${esc(m.unit || '')}</span>${s ? `<span class="pill" style="background:${ST[s].bg};color:${ST[s].color}">${s}</span>` : '<span class="pill none">–</span>'}${ed && vals.length > 1 ? `<button class="ib del" data-act="delVal" data-q="${esc(it.id)}" data-i="${i}" aria-label="Remove reading">✕</button>` : ''}</div>`; }).join('')}
    ${ed ? `<button class="btn sm" data-act="addVal" data-q="${esc(it.id)}">＋ Add reading</button>` : ''}
    <p class="small mt">${!lim ? 'No limits set: record the reading and choose the status below.' : res ? `Result from readings: <b>${ST[res].label}</b>${rs.stManual && rs.st !== res ? ` · status set manually to ${esc(rs.st)} <button class="lnk" data-act="measAuto" data-q="${esc(it.id)}"${dis(ed)}>use result</button>` : ''}` : 'Enter a reading to set the status automatically.'}</p></div>`;
}

/* ---------- actions ---------- */
Object.assign(ACT, {
  setBy(d) { S.by = d.by; ss('sap-by', d.by); rerender(); },
  quick(d) {
    const a = S.audit; if (!canAssess(a)) return; const r = R(d.q), old = r.st || '';
    if (old === d.st && d.st === 'C') { r.st = ''; if (r.likAuto) { delete r.lik; delete r.likAuto; } touch(d.q); return rerender(); }
    r.st = d.st; delete r.scoped; if (d.st !== 'NA') delete r.naJust; else { delete r.lik; delete r.sev; }
    if (d.st === 'C' && !r.lik) { r.lik = a.cfg.quickLik || 1; r.likAuto = true; }
    touch(d.q); logEdit(d.q, 'status ' + (old || 'blank') + ' to ' + d.st + ' (quick answer)');
    if (d.st === 'C') rerender(); else go({ v: 'q', q: d.q });
  },
  groupAllC(d) {
    const a = S.audit, t = S.tpl, list = t.items.filter(it => inGroup(it, d.by, d.g) && !(a.resp[it.id] || {}).st && !it.meas);
    ask({ title: 'Mark ' + list.length + ' unanswered question(s) as Compliant?', msg: 'Use this only when you have checked them. Likelihood is set to ' + (a.cfg.quickLik || 1) + ' (' + a.cfg.lik[(a.cfg.quickLik || 1) - 1].name + ') where not yet rated; you can change any of them afterwards. Measurement questions are not included.', okLabel: 'Mark compliant',
      ok: () => { list.forEach(it => { const r = R(it.id); r.st = 'C'; if (!r.lik) { r.lik = a.cfg.quickLik || 1; r.likAuto = true; } touch(it.id); }); log('Bulk compliant', (d.by === 'area' ? 'Area ' : 'Group ') + d.g + ': ' + list.length + ' question(s)'); } });
  },
  bulkNA(d) {
    const a = S.audit, by = d.by || 'sec', g = d.g || d.sec, open = S.tpl.items.filter(it => inGroup(it, by, g) && !(a.resp[it.id] || {}).st);
    if (!open.length) return toast('No unanswered questions here.');
    ask({ title: 'Mark ' + open.length + ' unanswered question(s) as N/A', msg: 'Give the justification. It is recorded against each question with your name and the time.', input: 1, placeholder: 'e.g. The store has no escalators', okLabel: 'Mark as N/A', ok: v => { open.forEach(it => { const r = R(it.id); r.st = 'NA'; r.naJust = v; delete r.lik; touch(it.id); }); log('Bulk N/A', g + ': ' + open.length + ' question(s). Justification: ' + v); } });
  },
  setFact(d) { const a = S.audit; a.facts = a.facts || {}; a.facts[d.k] = d.v; saveAudit(); rerender(); },
  applyScope() { const a = S.audit, res = applyScope(a, S.tpl); log('Scoping applied', res.out + ' question(s) set out of scope, ' + res.back + ' returned to scope'); saveAudit(true); toast(res.out + ' out of scope' + (res.back ? ', ' + res.back + ' back in scope' : '')); go({ v: 'sections' }); },
  addVal(d) { const r = R(d.q); r.vals = (r.vals && r.vals.length ? r.vals : [{ l: '', v: '' }]); r.vals.push({ l: '', v: '' }); saveAudit(); rerender(); },
  delVal(d) { const r = R(d.q), it = S.tpl.items.find(x => x.id === d.q); (r.vals || []).splice(+d.i, 1); measSync(it, r); touch(d.q); rerender(); },
  measAuto(d) { const r = R(d.q), it = S.tpl.items.find(x => x.id === d.q); delete r.stManual; measSync(it, r); touch(d.q); rerender(); },
  async demoProg(d) { const a = await makeDemo(d.t); go({ v: S.mode === 'admin' ? 'aaudit' : 'overview', a: a.id }); }
});
const INPUT_EXT = {
  fact(d, v) { const a = S.audit; if (!(canAssess(a) || canDetails(a))) return; a.facts = a.facts || {}; a.facts[d.k] = v; saveAudit(); },
  val(d, v, isChange) { const a = S.audit; if (!canAssess(a)) return; const r = R(d.q), it = S.tpl.items.find(x => x.id === d.q); r.vals = r.vals && r.vals.length ? r.vals : [{ l: '', v: '' }]; r.vals[+d.i][d.f] = v; measSync(it, r); touch(d.q); if (isChange) logEdit(d.q, 'reading edited'); },
  showScoped(d, v) { S.showScoped = v; },
  tqm(d, v) { const t = S.templates.find(x => x.id === d.t); if (!t || tplUsed(t.id)) return; const it = t.items.find(x => x.id === d.q); if (!it) return; if (d.f === 'on') { if (v) it.meas = it.meas || { unit: '', bench: '' }; else delete it.meas; } else if (it.meas) { it.meas[d.f] = ['lo', 'hi', 'pcLo', 'pcHi'].includes(d.f) ? (v === '' ? null : +v) : d.f === 'multi' ? (v ? 1 : 0) : v; } DB.put('templates', t); },
  tqr(d, v) { const t = S.templates.find(x => x.id === d.t); if (!t || tplUsed(t.id)) return; const it = t.items.find(x => x.id === d.q); if (!it) return; it.rule = String(v).split(/[+,\s]+/).map(s => s.trim()).filter(Boolean); DB.put('templates', t); },
  pform(d, v) { if (S.form) { if (d.f === 'sec') { S.form.secs = S.form.secs.filter(x => x !== d.s); if (v) S.form.secs.push(d.s); } else S.form[d.f] = v; } }
};

/* ---------- programmes: build from library + client KPI rows ---------- */
const KPI_COLS = { code: ['group code', 'code'], group: ['kpi group', 'group'], kpi: ['kpi / audit point', 'kpi', 'audit point', 'requirement'], type: ['type'], qid: ['question id', 'id'], refs: ['library refs', 'library ref', 'mapped library'], unit: ['unit'], lo: ['compliant min', 'min'], hi: ['compliant max', 'max'], pcLo: ['partial min'], pcHi: ['partial max'], multi: ['multiple readings'], bench: ['benchmark'], sev: ['severity'], area: ['site area code', 'site area', 'area'], when: ['applies when'], ref: ['reference'], guide: ['guidance'] };
function kpiRowsFromSheets(sheets) {
  for (const nm of Object.keys(sheets)) {
    const rows = sheets[nm]; for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const hdr = Array.from(rows[i] || [], v => String(v == null ? '' : v).trim().toLowerCase()); const col = {};
      for (const k in KPI_COLS) col[k] = hdr.findIndex(h => KPI_COLS[k].includes(h));
      if (col.kpi < 0 || col.type < 0) continue;
      const out = []; for (let j = i + 1; j < rows.length; j++) { const r = rows[j]; if (!r) continue; const o = {}; for (const k in col) o[k] = col[k] >= 0 && r[col[k]] != null ? r[col[k]] : ''; if (!String(o.kpi).trim() && !String(o.refs).trim()) continue; out.push(o); }
      return out;
    }
  }
  throw new Error('No client KPI sheet found. It needs header columns "KPI / audit point" and "Type".');
}
function buildProgramme(lib, rows, meta, libSecs) {
  const groups = [], gmap = {}, items = [], libIn = new Map(), warn = [], cnt = {}, byid = {}; lib.items.forEach(it => byid[it.id] = it);
  const G = (code, name) => { code = String(code || '').trim() || 'K' + (groups.length + 1); if (!gmap[code]) { gmap[code] = { id: code, name: String(name || code).trim() }; groups.push(gmap[code]); } return code; };
  const addLib = (id, g, kpi) => { id = id.trim(); if (!byid[id]) { warn.push(id); return; } if (!libIn.has(id)) libIn.set(id, { g, kpi: kpi || '' }); else if (kpi && !libIn.get(id).kpi) libIn.get(id).kpi = kpi; };
  const num = v => v === '' || v == null || isNaN(+v) ? null : +v;
  (libSecs || []).forEach(sid => { const s = lib.sections.find(x => x.id === sid); if (!s) return; const g = G(s.id, s.name); lib.items.filter(it => it.sec === sid).forEach(it => addLib(it.id, g, '')); });
  rows.forEach(r => {
    const g = G(r.code || r.group, r.group), type = String(r.type || 'Check').trim().toLowerCase(), refs = String(r.refs || '').split(/[,;\s]+/).filter(Boolean);
    if (type.startsWith('lib')) { refs.forEach(x => addLib(x, g, String(r.kpi || ''))); return; }
    cnt[g] = (cnt[g] || 0) + 1; let id = String(r.qid || '').trim() || g + '-' + String(cnt[g]).padStart(2, '0'); while (items.some(x => x.id === id) || byid[id]) id += '*';
    const sev = Math.min(5, Math.max(1, parseInt(r.sev, 10) || 3)), when = String(r.when || '').split(/[+,\s]+/).filter(Boolean);
    const it = { id, sec: g, req: String(r.kpi).trim(), ref: String(r.ref || (meta.client ? meta.client + ' KPI' : 'Client KPI')), type: 'Client KPI', app: when.length ? 'When: ' + when.map(k => (FACT[factOf(k)] || {}).label || k).join(' + ') : 'All', guide: String(r.guide || (r.bench ? 'Benchmark: ' + r.bench : '')), method: type.startsWith('meas') ? 'M' : 'V', sev, weight: sev, rule: when, area: AREA_NAME[String(r.area || '').trim()] ? String(r.area).trim() : 'HSK', kpi: String(r.kpi).trim(), client: 1 };
    if (type.startsWith('meas')) it.meas = { unit: String(r.unit || ''), lo: num(r.lo), hi: num(r.hi), pcLo: num(r.pcLo), pcHi: num(r.pcHi), bench: String(r.bench || ''), multi: /^y/i.test(String(r.multi || '')) ? 1 : 0 };
    items.push(it); refs.forEach(x => addLib(x, g, ''));
  });
  for (const [id, v] of [...libIn.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) { const c = clone(byid[id]); c.libRef = id; c.sec = v.g; if (v.kpi) c.kpi = v.kpi; items.push(c); }
  const order = groups.map(g => g.id), all = items.slice().sort((a, b) => order.indexOf(a.sec) - order.indexOf(b.sec) || (b.client ? 1 : 0) - (a.client ? 1 : 0));
  return { tpl: { id: 'tpl-' + uid(), name: meta.name, client: meta.client || '', version: meta.version || 'P1', source: meta.source || '', active: true, builtin: false, kind: 'programme', sections: groups.filter(g => all.some(i => i.sec === g.id)), items: all, profile: clone(lib.profile), createdAt: new Date().toISOString() }, warn: [...new Set(warn)] };
}
function libTpl() { return S.templates.find(t => t.kind === 'library') || S.templates.find(t => t.builtin); }
function kpiTemplateXlsx() {
  const b = new XlsxBook(), St = xlsxStyles(b), H = ['Group code', 'KPI group', 'KPI / audit point', 'Type', 'Question ID', 'Library refs', 'Unit', 'Compliant min', 'Compliant max', 'Partial min', 'Partial max', 'Multiple readings', 'Benchmark', 'Severity', 'Site area code', 'Applies when', 'Reference', 'Guidance'];
  const ex = [['EL', 'Electrical', 'Earth pit resistance (each pit)', 'Measurement', '', 'P-40', 'ohm', '', 2, '', 5, 'Yes', 'Not more than 2 ohm; up to 5 ohm partially compliant', 4, 'EXT', '', 'Client standard 4.2', 'Test each pit with a 3-point tester'], ['EL', 'Electrical', 'Rubber mats in front of all panels', 'Library item', '', 'P-16', '', '', '', '', '', '', '', '', '', '', '', ''], ['LF', 'Lifts', 'Automatic rescue device tested', 'Check', '', '', '', '', '', '', '', '', '', 4, 'LFT', 'lift', 'Client standard 7.1', '']];
  b.addSheet({ name: 'Client KPIs', cols: [8, 24, 50, 13, 10, 16, 8, 10, 10, 10, 10, 10, 40, 8, 10, 12, 24, 40], rows: [H.map(v => ({ v, s: St.h }))].concat(ex.map(r => r.map(v => ({ v, s: St.n })))), freeze: { row: 1 } });
  const codes = [[{ v: 'Site area code', s: St.h }, { v: 'Site area', s: St.h }]].concat(AREAS.map(a => [a.id, a.name]));
  codes.push([]); codes.push([{ v: 'Applies-when code', s: St.h }, { v: 'Meaning', s: St.h }]);
  ['h15', 'h24', 'h60', 'bas', 'kw250'].forEach(k => codes.push([k, { h15: 'Building height at least 15 m', h24: 'Height at least 24 m', h60: 'Height at least 60 m', bas: 'Basement(s)', kw250: 'Connected load above 250 kW' }[k]]));
  Object.values(FACT).filter(f => !f.num).forEach(f => codes.push([f.k, f.label]));
  b.addSheet({ name: 'Codes', cols: [18, 60], rows: codes });
  return b.build();
}
