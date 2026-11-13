/* ---------- app: views ---------- */
const TITLES = { scope: 'Scoping', sections: 'Walk-through', pnew: 'New programme', templates: 'Programmes', tpl: 'Programme', home: 'Audits', newAudit: 'New audit', account: 'My account', pwchange: 'Change password', completed: 'Completed audits', adash: 'Dashboard', aaudit: 'Audit summary', user: 'User account', activity: 'Activity log', templates: 'Checklists', tpl: 'Checklist version', tq: 'Edit question', settings: 'Scoring settings', users: 'Users and roles', data: 'Backup and data', help: 'How it works' };
const pill = st => st ? `<span class="pill" style="background:${ST[st].bg};color:${ST[st].color}">${st}</span>` : '<span class="pill none">–</span>';
const gchip = (cfg, risk) => { if (!risk) return ''; const g = gradeStyle(cfg, risk.grade); return `<span class="chip" style="background:${g.bg};color:${g.color}">${risk.score} · ${esc(risk.grade)}</span>`; };
const rchip = (cfg, name) => { const s = ratingStyle(cfg, name); return `<span class="chip big" style="background:${s.bg};color:${s.color}">${esc(name)}</span>`; };
const badge = a => `<span class="badge s-${a.status}">${AUDIT_STATUS[a.status]}${a.reopened && a.status === 'inprogress' ? ' · returned' : ''}</span>`;
const fld = (label, inner, hint) => `<label class="fld"><span>${label}</span>${inner}${hint ? `<small>${hint}</small>` : ''}</label>`;
const dis = ok => ok ? '' : ' disabled';
const note = (t, cls) => `<div class="note ${cls || ''}">${t}</div>`;
const bar = (p, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p || 0)).toFixed(1)}%;${color ? 'background:' + color : ''}"></i></div>`;
const link = (label, sub, attrs) => `<button class="row" ${attrs}><div><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><span class="chev">›</span></button>`;
function ring(p, color, label) { const c = 2 * Math.PI * 52, off = c * (1 - (p || 0) / 100); return `<svg viewBox="0 0 120 120" class="ring" role="img" aria-label="Compliance ${label}"><circle cx="60" cy="60" r="52" fill="none" stroke="#e3e7ee" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" class="rv">${label}</text><text x="60" y="78" text-anchor="middle" class="rl">compliance</text></svg>`; }
function ratingColor(cfg, name) { const s = ratingStyle(cfg, name); return s.color === '#ffffff' ? s.bg : s.color; }
function qMatches(it, r, p) {
  switch (S.filter) {
    case 'todo': return !r.st || (r.st === 'NA' && !(r.naJust || '').trim()) || (['C', 'PC', 'NC'].includes(r.st) && !p.risk);
    case 'find': return r.st === 'NC' || r.st === 'PC';
    case 'top': return !!(p.risk && p.risk.top);
    case 'none': return !r.st;
    case 'all': return true;
    default: return r.st === S.filter;
  }
}
function qrow(it, k) {
  const a = S.audit, r = a.resp[it.id] || {}, p = k.per[it.id], n = S.photos.filter(x => x.qid === it.id && x.kind !== 'closure').length;
  return `<button class="qrow" data-act="nav" data-v="q" data-q="${esc(it.id)}" style="border-left-color:${r.st ? ST[r.st].color : '#cfd4dc'}"><div class="qr-h"><b>${esc(it.id)}</b>${pill(r.st)}${gchip(a.cfg, p.risk)}${n ? `<span class="cam">▣ ${n}</span>` : ''}</div><p>${esc(it.req)}</p></button>`;
}
function chips() {
  const F = [['all', 'All'], ['todo', 'To complete'], ['find', 'Findings'], ['top', 'High risk'], ['C', 'Compliant'], ['PC', 'Partial'], ['NC', 'Non-compliant'], ['NA', 'N/A'], ['NV', 'Not verified']];
  return `<div class="chips">${F.map(f => `<button class="fchip${S.filter === f[0] ? ' on' : ''}" data-act="filter" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>`;
}
function checklistBody() { return v3checklistBody(); }
function checklistBodyV2() {
  const a = S.audit, t = S.tpl, k = computeAudit(a, t), q = S.search.trim().toLowerCase(), sec = S.route.v === 'section' ? S.route.sec : null;
  if (!sec && !q && S.filter === 'all') return k.sections.map(s => `<button class="sec" data-act="nav" data-v="section" data-sec="${esc(s.id)}"><span class="sid">${esc(s.id)}</span><div class="sbody"><b>${esc(s.name)}</b><small>${s.answered} of ${s.items} answered${s.counts.NC + s.counts.PC ? ' · ' + (s.counts.NC + s.counts.PC) + ' finding(s)' : ''}${s.score != null ? ' · ' + pct(s.score) : ''}</small>${bar(s.items ? s.answered / s.items * 100 : 0)}</div><span class="chev">›</span></button>`).join('');
  const items = t.items.filter(it => (!sec || it.sec === sec) && qMatches(it, a.resp[it.id] || {}, k.per[it.id]) && (!q || (it.id + ' ' + it.req + ' ' + (it.ref || '')).toLowerCase().includes(q)));
  if (!items.length) return '<p class="muted pad">No questions match this filter.</p>';
  return `<p class="muted small">${items.length} question(s)</p>` + items.slice(0, 400).map(it => qrow(it, k)).join('');
}
function photoBlock(qid, kind, editable) {
  const list = S.photos.filter(p => p.qid === qid && (p.kind || 'audit') === kind), slots = Math.max(0, (S.audit.cfg.photoSlots || 3) - list.length);
  let h = '<div class="photos">';
  list.forEach((p, i) => { h += `<figure><img src="${p.data}" alt="Photo ${i + 1}"><figcaption><span class="pref">${esc(qid)}-${kind === 'closure' ? 'C' : 'P'}${i + 1}</span><input data-scope="cap" data-id="${p.id}" value="${esc(p.caption)}" placeholder="Caption"${dis(editable)}>${editable ? `<button class="ib del" data-act="delPhoto" data-id="${p.id}" aria-label="Delete photo">✕</button>` : ''}</figcaption></figure>`; });
  if (editable) for (let i = 0; i < slots; i++) h += `<label class="slot"><input type="file" accept="image/*" capture="environment" data-file="photo" data-q="${esc(qid)}" data-kind="${kind}" hidden><span>＋</span><small>Photo ${list.length + i + 1}</small></label>`;
  h += '</div>';
  if (editable) h += `<div class="btnrow"><label class="btn"><input type="file" accept="image/*" capture="environment" data-file="photo" data-q="${esc(qid)}" data-kind="${kind}" hidden>Take photo</label><label class="btn"><input type="file" accept="image/*" multiple data-file="photo" data-q="${esc(qid)}" data-kind="${kind}" hidden>Upload from device</label></div>`;
  else if (!list.length) h = '<p class="muted small">No photographs.</p>';
  return h;
}
function scale(kind, qid, cur, def, ed, cfg) {
  const defs = kind === 'sev' ? cfg.sev : cfg.lik, act = kind === 'sev' ? 'setSev' : 'setLik', d = cur ? defs[cur - 1] : null;
  return `<div class="scale">${[1, 2, 3, 4, 5].map(n => `<button class="${cur === n ? 'on' : ''}${def === n ? ' def' : ''}" data-act="${act}" data-q="${esc(qid)}" data-n="${n}"${dis(ed)}>${n}</button>`).join('')}</div><p class="sdesc">${d ? `<b>${esc(d.name)}.</b> ${esc(d.desc)}` : 'Select a rating from 1 to 5.'}</p>`;
}

const V = {
  home() {
    const l = visibleAudits(); let h = '';
    if (S.memOnly) h += note('This browser is not allowing this page to store data, so audits will be lost when the page is closed. Open the file in Chrome or Edge, or host it on a web server.', 'warn');
    h += `<div class="hello"><h1>Audits</h1><p>${esc(S.user.name)} · ${ROLES[S.user.role]}</p></div>`;
    if (can('createAudit')) h += '<button class="btn pri wide" data-act="startNew">＋ New audit</button>';
    if (!l.length) h += `<div class="card empty"><b>No audits ${S.user.role === 'auditor' ? 'assigned to you' : 'yet'}.</b><p>${can('createAudit') ? 'Create an audit, or load a sample audit with invented responses to see the dashboard and the reports.' : 'An Audit Administrator creates audits and assigns them to you by name.'}</p>${can('createAudit') ? '<button class="btn" data-act="demo">Load sample Decathlon audit</button>' : ''}</div>`;
    l.forEach(a => {
      const t = S.templates.find(x => x.id === a.tplId), k = t ? computeAudit(a, t) : null;
      h += `<button class="card acard" data-act="openAudit" data-id="${a.id}"><div class="ac-h"><span class="ref">${esc(a.ref)}</span>${badge(a)}</div><b class="site">${esc(a.site)}</b><small>${esc(a.org)}${a.location ? ' · ' + esc(a.location) : ''}</small><small>${esc(auditDates(a))} · Lead: ${esc(a.lead)}</small>${k ? `<div class="ac-f"><div class="grow">${bar(k.completion)}<small>${k.answered} of ${k.total} answered</small></div><div class="sc"><b>${pct(k.score)}</b>${k.score != null ? rchip(a.cfg, k.rating) : ''}</div></div>` : note('Checklist version missing on this device.', 'warn')}</button>`;
    });
    return h;
  },
  newAudit() {
    const f = S.form; if (!f) return note('Start from the Audits screen.');
    const aud = S.users.filter(u => u.role === 'auditor' && u.active !== false), act = S.templates.filter(t => t.active);
    const i = (k, extra) => `<input data-scope="form" data-f="${k}" value="${esc(f[k])}" ${extra || ''}>`;
    return `<div class="card"><p class="muted small">The audit reference number is generated when the audit is created.</p>
      ${fld('Organisation *', i('org'))}${fld('Facility / plant / site name *', i('site'))}${fld('Location', i('location'))}
      ${fld('Audit type', `<select data-scope="form" data-f="type">${['Fire and life safety audit - full', 'Follow-up audit', 'Pre-occupancy audit', 'Periodic statutory audit', 'Limited scope audit'].map(o => `<option${f.type === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`)}
      <div class="two">${fld('Audit date from', i('dateFrom', 'type="date"'))}${fld('to', i('dateTo', 'type="date"'))}</div>
      ${fld('Lead auditor', `<select data-scope="form" data-f="lead" data-rr>${aud.map(u => `<option${f.lead === u.name ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`, 'The lead auditor and team members can record responses.')}
      <div class="fld"><span>Audit team members</span><div class="checks">${aud.filter(u => u.name !== f.lead).map(u => `<label><input type="checkbox" data-scope="formteam" data-name="${esc(u.name)}"${f.team.includes(u.name) ? ' checked' : ''}> ${esc(u.name)}</label>`).join('') || '<small>No other auditors. The System Administrator creates auditor accounts in the Admin console.</small>'}</div></div>
      ${fld('Other team members (client side, specialists)', i('teamOther'))}
      ${fld('Audit programme', `<select data-scope="form" data-f="tplId">${act.map(t => `<option value="${t.id}"${f.tplId === t.id ? ' selected' : ''}>${esc(t.name)} (${esc(t.version)}) – ${t.items.length} questions</option>`).join('')}</select>`, 'A client programme (e.g. Decathlon) or the full requirement library. Scoping after creation removes what does not apply.')}
      ${fld('Audit scope and boundaries', `<textarea data-scope="form" data-f="scope" rows="4" placeholder="Buildings, floors and systems covered; exclusions">${esc(f.scope)}</textarea>`)}
      <button class="btn pri wide" data-act="createAudit">Create audit</button></div>`;
  },
  overview() {
    const a = S.audit, t = S.tpl; if (!t) return note('The checklist version used by this audit is not on this device. Import the audit package again.', 'warn');
    const k = computeAudit(a, t), n = k.counts, cfg = a.cfg, gs = k.grades.slice().reverse(), cs = closureStats(a, t, k), fin = findingsOf(a, t, k);
    let h = `<div class="statusrow">${badge(a)}<small>${esc(t.name)} (${esc(t.version)})</small></div>`;
    let acts = '';
    if (a.status === 'draft' || a.status === 'inprogress') acts = canAssess(a) ? `<button class="btn pri" data-act="nav" data-v="sections">${k.answered ? 'Continue checklist' : 'Start checklist'}</button><button class="btn" data-act="submit">Submit audit</button>` : `<small class="muted">Assessment is open to ${esc(a.lead)}${a.team.length ? ' and ' + esc(a.team.join(', ')) : ''}.</small>`;
    else if (a.status === 'submitted') acts = (can('review') ? '<button class="btn pri" data-act="approve">Approve</button><button class="btn" data-act="returnAudit">Return for correction</button>' : '<small class="muted">Submitted. Reports can be generated; reviewer approval is optional.</small>');
    else if (a.status === 'approved') acts = can('review') ? '<button class="btn" data-act="returnAudit">Return for correction</button>' : '';
    if ((a.status === 'submitted' || a.status === 'approved') && cs.verified === cs.total && can('closure')) acts += '<button class="btn pri" data-act="closeAudit">Close audit</button>';
    if (acts) h += `<div class="btnrow">${acts}</div>`;
    if (a.reopened && a.status === 'inprogress') h += note('Returned for correction. Changes are being recorded in the audit trail.', 'warn');
    h += `<div class="card hero">${ring(k.score, k.score == null ? '#9aa3af' : ratingColor(cfg, k.rating), pct(k.score))}<div class="hero-r"><small>Overall rating</small>${k.score == null ? '<b>Not assessed</b>' : rchip(cfg, k.rating)}<small class="mt">Audit completion ${pct(k.completion, 0)}</small>${bar(k.completion)}<small>${k.answered} of ${k.total} questions answered</small></div></div>`;
    const tile = (v, l, c, f) => `<button class="tile" data-act="tile" data-f="${f}" style="${c ? 'border-top-color:' + c : ''}"><b>${v}</b><span>${l}</span></button>`;
    h += `<div class="tiles">${tile(k.total, 'Total questions', '', 'all')}${tile(k.applicable, 'Applicable', '', 'all')}${tile(n.NA, 'Not applicable', ST.NA.color, 'NA')}${tile(n.C, 'Compliant', ST.C.color, 'C')}${tile(n.PC, 'Partially compliant', ST.PC.color, 'PC')}${tile(n.NC, 'Non-compliant', ST.NC.color, 'NC')}${tile(n.NV, 'Not verified', ST.NV.color, 'NV')}${tile(n.none, 'Not yet assessed', '', 'none')}</div>`;
    // risk
    const m = S.matrix === 'all' ? k.mAll : k.mFind;
    h += `<div class="card"><h2>Risk profile</h2><p class="muted small">Severity × Likelihood, rated for every applicable question. Separate from the compliance score; it does not change the overall rating.</p>
      <div class="gtable"><div class="gh"><span></span><span>Findings<br>(NC / PC)</span><span>All applicable</span></div>${gs.map(g => { const s = gradeStyle(cfg, g); return `<div><span class="chip" style="background:${s.bg};color:${s.color}">${esc(g)}</span><b>${k.find[g]}</b><span>${k.all[g]}</span></div>`; }).join('')}</div>
      ${k.compliantTop ? note(`<b>${k.compliantTop}</b> compliant question(s) still carry a ${esc(gs[1] || '')} or ${esc(gs[0])} risk rating. They pass today, but failure would be severe; the controls must be kept in place.`) : ''}
      <div class="chips mt"><button class="fchip${S.matrix === 'find' ? ' on' : ''}" data-act="matrix" data-m="find">Findings</button><button class="fchip${S.matrix === 'all' ? ' on' : ''}" data-act="matrix" data-m="all">All applicable</button></div>
      <table class="matrix"><tr><th>S \\ L</th>${[1, 2, 3, 4, 5].map(l => `<th>${l}</th>`).join('')}</tr>${[5, 4, 3, 2, 1].map(s => `<tr><th>${s}</th>${[1, 2, 3, 4, 5].map(l => { const g = gradeStyle(cfg, gradeForScore(cfg, s * l)), v = m[s - 1][l - 1]; return `<td style="background:${g.bg};color:${g.color}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</table>
      <p class="muted small">Rows: severity 5 (catastrophic) to 1. Columns: likelihood 1 (rare) to 5. ${k.miss.risk.length ? k.miss.risk.length + ' assessed question(s) still need a likelihood rating.' : ''}</p></div>`;
    // priority
    const top = fin.filter(f => f.risk && f.risk.top);
    h += `<div class="card"><h2>${esc(gs[1] || '')} and ${esc(gs[0])} risk observations <span class="count">${top.length}</span></h2>${top.length ? top.slice(0, 12).map(f => `<button class="qrow" data-act="nav" data-v="q" data-q="${esc(f.it.id)}" style="border-left-color:${ST[f.r.st].color}"><div class="qr-h"><b>${esc(f.it.id)}</b>${pill(f.r.st)}${gchip(cfg, f.risk)}</div><p>${esc(f.r.obs || f.it.req)}</p></button>`).join('') + (top.length > 12 ? `<button class="btn wide" data-act="nav" data-v="closure">All ${fin.length} findings</button>` : '') : '<p class="muted small">None recorded.</p>'}</div>`;
    // sections
    h += `<div class="card"><h2>Section-wise compliance</h2>${k.sections.map(s => `<button class="srow" data-act="nav" data-v="section" data-sec="${esc(s.id)}"><span class="sid sm">${esc(s.id)}</span><div class="grow"><div class="sr-t"><span>${esc(s.name)}</span><b>${pct(s.score)}</b></div>${bar(s.score, s.score == null ? '' : ratingColor(cfg, rateScore(s.score, cfg)))}<small>${s.counts.C} C · ${s.counts.PC} PC · ${s.counts.NC} NC · ${s.counts.NA} NA · ${s.counts.NV} NV${s.counts.none ? ' · ' + s.counts.none + ' open' : ''}</small></div></button>`).join('')}</div>`;
    const np = S.photos.filter(p => p.kind !== 'closure').length, pf = t.profile.filter(p => (a.profile[p.label] || '').trim()).length;
    { const fu = Object.keys(factUse(t)).length, sc = scopedCount(a, t); if (fu) h += `<div class="card">${link('Scoping', a.facts ? sc + ' of ' + t.items.length + ' questions out of scope from the building profile' : 'Not scoped yet: answer about ' + fu + ' building questions to remove what cannot apply', 'data-act="nav" data-v="scope"')}</div>`; }
    h += `<div class="card">${link('Photographs', np + ' photo(s) linked to ' + new Set(S.photos.filter(p => p.kind !== 'closure').map(p => p.qid)).size + ' question(s)', 'data-act="nav" data-v="photos"')}${link('Building profile', pf + ' of ' + t.profile.length + ' entries filled', 'data-act="nav" data-v="profile"')}${link('Corrective action closure', cs.total ? cs.verified + ' of ' + cs.total + ' findings verified closed' + (cs.overdue ? ' · ' + cs.overdue + ' overdue' : '') : 'No findings', 'data-act="nav" data-v="closure"')}</div>`;
    return h;
  },
  sections() {
    return `<input class="search" type="search" data-scope="search" value="${esc(S.search)}" placeholder="Search question, ID or clause">${chips()}<div id="qlist">${checklistBody()}</div>`;
  },
  section(r) {
    const a = S.audit, k = computeAudit(a, S.tpl), s = k.sections.find(x => x.id === r.sec); if (!s) return note('Section not found.');
    return `<div class="sechead"><span class="sid">${esc(s.id)}</span><div><b>${esc(s.name)}</b><small>${s.answered} of ${s.items} answered · compliance ${pct(s.score)}</small></div></div>${bar(s.items ? s.answered / s.items * 100 : 0)}${chips()}<div id="qlist">${checklistBody()}</div>${canAssess(a) && s.counts.none ? `<button class="btn wide mt" data-act="bulkNA" data-sec="${esc(s.id)}">Mark the ${s.counts.none} unanswered as N/A…</button>` : ''}`;
  },
  q(r) {
    const a = S.audit, t = S.tpl, idx = t.items.findIndex(x => x.id === r.q), it = t.items[idx]; if (!it) return note('Question not found.');
    const rs = a.resp[it.id] || {}, ed = canAssess(a), cfg = a.cfg, risk = itemRisk(it, rs, cfg), sec = t.sections.find(s => s.id === it.sec) || { name: '' };
    const nl = (S.navList || []).includes(it.id) ? S.navList : t.items.map(x => x.id), ni = nl.indexOf(it.id), prev = t.items.find(x => x.id === nl[ni - 1]), next = t.items.find(x => x.id === nl[ni + 1]), na = rs.st === 'NA', sev = effSev(it, rs);
    const gA = S.by === 'area', gid = gA ? areaOf(it) : it.sec, gname = gA ? (AREA_NAME[gid] || 'Other') : (t.client ? '' : 'Section ' + it.sec + ': ') + sec.name;
    let h = `<div class="crumb"><button data-act="nav" data-v="section" data-g="${esc(gid)}">${esc(gname)}</button><span>${ni + 1} of ${nl.length}</span></div>`;
    if (rs.scoped) h += note('Out of scope: ' + esc(rs.naJust.replace(/^Out of scope \(building profile\): /, '')) + ' Choose another response if it does apply.', 'lock');
    if (!ed) h += note(a.status === 'draft' || a.status === 'inprogress' ? 'Read only: you are not assigned to this audit, or your role cannot record responses.' : 'Read only: the audit is ' + AUDIT_STATUS[a.status].toLowerCase() + '.', 'lock');
    h += `<div class="card req"><div class="qr-h"><b class="qid">${esc(it.id)}</b><span class="tag">${esc(it.type || '')}</span>${it.libRef ? `<span class="tag">Library ${esc(it.libRef)}</span>` : ''}<span class="tag">${esc(AREA_NAME[areaOf(it)] || '')}</span></div>${it.kpi && !it.client ? `<p class="small kpil">Client KPI: ${esc(it.kpi)}</p>` : ''}<p class="reqt">${esc(it.req)}</p><p class="refc">${esc(it.ref || '')}</p>
      <details${it.guide ? '' : ' hidden'}><summary>Guidance for the auditor</summary><p>${esc(it.guide)}</p><p class="muted small"><b>Applies to:</b> ${esc(it.app || 'All')} &nbsp; <b>Method:</b> ${esc(it.method || '')} <span class="muted">(D document, V visual, M measurement, T test)</span></p></details></div>`;
    if (it.meas && !na) h += measBlock(it, rs, ed);
    h += `<div class="card"><h3>Compliance response</h3><div class="stbtns">${ST_KEYS.map(s => `<button data-act="setSt" data-q="${esc(it.id)}" data-st="${s}" class="${rs.st === s ? 'on' : ''}" style="--c:${ST[s].color};--b:${ST[s].bg}"${dis(ed)}><b>${s}</b><span>${ST[s].label}</span></button>`).join('')}</div>
      ${na ? fld('Justification for N/A *', `<textarea data-scope="resp" data-q="${esc(it.id)}" data-f="naJust" rows="2" placeholder="Why this requirement does not apply to the premises"${dis(ed)}>${esc(rs.naJust)}</textarea>`, 'Excluded from the compliance score. Not treated as compliant.') : ''}
      ${rs.st === 'NV' ? '<p class="muted small">Not verified: excluded from the compliance score and reported as an audit limitation. Record the reason below.</p>' : ''}
      ${rs.by ? `<p class="muted small">Recorded by ${esc(rs.by)}, ${fmtDT(rs.at)}</p>` : ''}</div>`;
    if (!na) {
      h += `<div class="card"><h3>Observation / evidence</h3><textarea data-scope="resp" data-q="${esc(it.id)}" data-f="obs" rows="3" placeholder="What was found, where (location), and the evidence seen"${dis(ed)}>${esc(rs.obs)}</textarea></div>`;
      h += `<div class="card"><h3>Risk assessment <span class="muted small">independent of the compliance response</span></h3>
        <div class="slabel"><span>Severity</span>${rs.sev && rs.sev !== it.sev ? `<button class="lnk" data-act="resetSev" data-q="${esc(it.id)}"${dis(ed)}>Reset to checklist value ${it.sev}</button>` : `<small class="muted">Pre-filled from checklist: ${it.sev}</small>`}</div>${scale('sev', it.id, sev, it.sev, ed, cfg)}
        <div class="slabel"><span>Likelihood</span>${rs.likAuto ? '<small class="muted">Default from quick answer; change if needed</small>' : ''}</div>${scale('lik', it.id, rs.lik || null, null, ed, cfg)}
        <div class="riskout">${risk ? `<div><small>Risk score</small><b>${risk.sev} × ${risk.lik} = ${risk.score}</b></div>${gchip(cfg, risk).replace('class="chip"', 'class="chip big"')}` : '<small class="muted">Select likelihood to calculate the risk score.</small>'}</div>
        ${risk && risk.finding ? `<p class="small"><b>${esc(risk.timeline)}.</b> ${esc(risk.action)}</p>` : ''}${risk && rs.st === 'C' && risk.top ? '<p class="small muted">Compliant, but the consequence of failure is severe. No action timeline applies; the control must be maintained.</p>' : ''}</div>`;
      const fnd = rs.st === 'NC' || rs.st === 'PC';
      h += `<div class="card"><h3>Recommendation${fnd ? '' : ' <span class="muted small">optional</span>'}</h3>${fld('Recommended corrective action', `<textarea data-scope="resp" data-q="${esc(it.id)}" data-f="rec" rows="3"${dis(ed)}>${esc(rs.rec)}</textarea>`)}<div class="two">${fld('Responsible', `<input data-scope="resp" data-q="${esc(it.id)}" data-f="respb" value="${esc(rs.respb)}"${dis(ed)}>`)}${fld('Target date', `<input type="date" data-scope="resp" data-q="${esc(it.id)}" data-f="target" value="${esc(rs.target)}"${dis(ed)}>`)}</div></div>`;
    }
    h += `<div class="card"><h3>Photographic evidence <span class="muted small">optional; appears in the report only if added</span></h3>${photoBlock(it.id, 'audit', ed)}</div>`;
    h += `<div class="pn"><button class="btn" ${prev ? `data-act="nav" data-v="q" data-q="${esc(prev.id)}"` : 'disabled'}>‹ ${prev ? esc(prev.id) : ''}</button><button class="btn pri" ${next ? `data-act="nav" data-v="q" data-q="${esc(next.id)}"` : 'disabled'}>${next ? esc(next.id) : 'End'} ›</button></div>`;
    return h;
  },
  closure() {
    const a = S.audit, t = S.tpl, k = computeAudit(a, t), fin = findingsOf(a, t, k), cs = closureStats(a, t, k), open = a.status === 'submitted' || a.status === 'approved';
    let h = '';
    if (!open && a.status !== 'closed') h += note('Closure verification opens once the audit is submitted. The findings recorded so far are listed below.', 'lock');
    h += `<div class="tiles four"><div class="tile"><b>${cs.total}</b><span>Findings</span></div><div class="tile" style="border-top-color:${ST.C.color}"><b>${cs.verified}</b><span>Verified closed</span></div><div class="tile" style="border-top-color:${ST.PC.color}"><b>${cs.done + cs.progress}</b><span>In progress</span></div><div class="tile" style="border-top-color:${ST.NC.color}"><b>${cs.overdue}</b><span>Overdue</span></div></div>`;
    h += fin.length ? fin.map(f => { const c = (f.r.clo && f.r.clo.status) || 'open', od = c !== 'verified' && f.r.target && f.r.target < todayISO(); return `<button class="qrow" data-act="nav" data-v="clo" data-q="${esc(f.it.id)}" style="border-left-color:${ST[f.r.st].color}"><div class="qr-h"><b>${esc(f.it.id)}</b>${pill(f.r.st)}${gchip(a.cfg, f.risk)}<span class="clo c-${c}">${CLO[c].split(' - ')[0]}</span></div><p>${esc(f.r.obs || f.it.req)}</p><small class="muted">${f.r.respb ? esc(f.r.respb) + ' · ' : ''}${f.r.target ? 'Target ' + fmtDate(f.r.target) : 'No target date'}${od ? ' · <b class="red">overdue</b>' : ''}</small></button>`; }).join('') : '<p class="muted pad">No non-compliant or partially compliant questions.</p>';
    if (fin.length) h += `<div class="card mt"><h3>Closure reports</h3>${fld('Closure remarks (optional, printed in the report)', `<textarea data-scope="audit" data-f="closureNote" rows="2">${esc(a.closureNote)}</textarea>`)}<div class="btnrow"><button class="btn" data-act="report" data-k="cdocx">Word (.docx)</button><button class="btn" data-act="report" data-k="cxlsx">Excel (.xlsx)</button></div></div>`;
    return h;
  },
  clo(r) {
    const a = S.audit, t = S.tpl, it = t.items.find(x => x.id === r.q); if (!it) return note('Question not found.');
    const rs = a.resp[it.id] || {}, c = rs.clo || {}, st = c.status || 'open', ed = canClosure(a), risk = itemRisk(it, rs, a.cfg);
    const i = (f, type) => `<input ${type ? `type="${type}"` : ''} data-scope="clo" data-q="${esc(it.id)}" data-f="${f}" value="${esc(c[f])}"${dis(ed)}>`;
    return `${ed ? '' : note(a.status === 'closed' ? 'Read only: the audit is closed.' : 'Read only: closure is recorded after submission by an auditor or reviewer.', 'lock')}
      <div class="card req"><div class="qr-h"><b class="qid">${esc(it.id)}</b>${pill(rs.st)}${gchip(a.cfg, risk)}</div><p class="reqt">${esc(it.req)}</p><p class="refc">${esc(it.ref || '')}</p>
      <dl><dt>Observation</dt><dd>${esc(rs.obs) || '–'}</dd><dt>Recommended action</dt><dd>${esc(rs.rec) || '–'}</dd><dt>Responsible / target</dt><dd>${esc(rs.respb) || '–'} / ${fmtDate(rs.target) || '–'}${risk ? ' · ' + esc(risk.timeline) : ''}</dd></dl>
      <button class="lnk" data-act="nav" data-v="q" data-q="${esc(it.id)}">Open the audit response</button></div>
      <div class="card"><h3>Closure status</h3><div class="clobtns">${Object.keys(CLO).map(s => `<button class="${st === s ? 'on c-' + s : ''}" data-act="cloSet" data-q="${esc(it.id)}" data-st="${s}"${dis(ed)}>${CLO[s]}</button>`).join('')}</div>
      ${fld('Corrective action taken', `<textarea data-scope="clo" data-q="${esc(it.id)}" data-f="action" rows="3"${dis(ed)}>${esc(c.action)}</textarea>`)}
      <div class="two">${fld('Action completed on', i('doneDate', 'date'))}${fld('Verified on', i('verDate', 'date'))}</div>
      ${st === 'verified' ? `<p class="muted small">Verified closed by ${esc(c.verBy)}.</p>` : ''}${fld('Verifier remarks', `<textarea data-scope="clo" data-q="${esc(it.id)}" data-f="remarks" rows="2"${dis(ed)}>${esc(c.remarks)}</textarea>`)}</div>
      <div class="card"><h3>Photographs after corrective action</h3>${photoBlock(it.id, 'closure', ed)}</div>
      <div class="card"><h3>Photographs at audit</h3>${photoBlock(it.id, 'audit', false)}</div>`;
  },
  reports() {
    const a = S.audit, k = computeAudit(a, S.tpl), fin = ['submitted', 'approved', 'closed'].includes(a.status), ro = S.user.role === 'management' || S.user.role === 'auditadmin' || a.status === 'closed';
    return `${fin ? '' : note('The audit is not submitted yet. Reports can be generated now and are marked DRAFT.', 'warn')}
      <div class="card"><div class="sr-t"><span>Compliance score</span><b>${pct(k.score)}</b></div><div class="sr-t"><span>Overall rating</span>${k.score == null ? '<b>Not assessed</b>' : rchip(a.cfg, k.rating)}</div><div class="sr-t"><span>Findings (NC / PC)</span><b>${k.counts.NC + k.counts.PC}</b></div></div>
      <div class="card"><h3>Text for the report</h3>${fld('Executive summary: auditor\'s remarks (added after the calculated summary)', `<textarea data-scope="audit" data-f="summaryNote" rows="4"${dis(!ro)}>${esc(a.summaryNote)}</textarea>`)}${fld('Conclusion: auditor\'s remarks', `<textarea data-scope="audit" data-f="conclusion" rows="4"${dis(!ro)}>${esc(a.conclusion)}</textarea>`)}
      <label class="check"><input type="checkbox" data-scope="opt" data-f="photos"${S.opt.photos ? ' checked' : ''}> Embed photographs in the reports</label></div>
      <div class="card"><h3>Audit report</h3><p class="muted small">Cover, audit details and building profile, executive summary, score and rating, section analysis, risk profile, findings with photographs, question-wise results, N/A and not-verified lists, conclusion.</p><div class="btnrow"><button class="btn pri" data-act="report" data-k="docx">Word (.docx)</button><button class="btn pri" data-act="report" data-k="xlsx">Excel (.xlsx)</button></div></div>
      <div class="card"><h3>Corrective action closure report</h3><p class="muted small">Closure summary, register and finding-wise details with before and after photographs.</p><div class="btnrow"><button class="btn" data-act="report" data-k="cdocx">Word (.docx)</button><button class="btn" data-act="report" data-k="cxlsx">Excel (.xlsx)</button></div></div>`;
  },
  more() {
    const a = S.audit;
    return `<div class="card">${link('Audit details and scope', esc(a.org), 'data-act="nav" data-v="details"')}${link('Building profile', 'Facts that decide which requirements apply', 'data-act="nav" data-v="profile"')}${link('Photographs', S.photos.length + ' stored', 'data-act="nav" data-v="photos"')}${link('Audit trail', (a.trail || []).length + ' entries', 'data-act="nav" data-v="trail"')}</div>
      <div class="card"><h3>Work with several auditors</h3><p class="muted small">Each auditor works on their own device. Export the audit package from one device and merge it on another: for each question the most recent response is kept, and photos are combined.</p><div class="btnrow"><button class="btn" data-act="exportAudit">Export audit package</button><label class="btn"><input type="file" accept=".json,application/json" data-file="package" hidden>Merge a package</label></div></div>
      ${can('settings') && (a.status === 'draft' || a.status === 'inprogress') ? '<div class="card"><h3>Scoring settings</h3><p class="muted small">This audit uses the settings in force when it was created.</p><button class="btn" data-act="applyCfg">Apply current settings</button></div>' : ''}
      ${can('createAudit') ? '<div class="card"><button class="btn danger" data-act="deleteAudit">Delete this audit</button></div>' : ''}`;
  },
  details() {
    const a = S.audit, ed = canDetails(a), aud = S.users.filter(u => u.role === 'auditor'), i = (k, extra) => `<input data-scope="audit" data-f="${k}" value="${esc(a[k])}" ${extra || ''}${dis(ed)}>`;
    const names = [...new Set(aud.map(u => u.name).concat(a.team, [a.lead]))];
    return `<div class="card">${fld('Audit reference', `<input value="${esc(a.ref)}" disabled>`)}${fld('Organisation', i('org'))}${fld('Facility / plant / site name', i('site'))}${fld('Location', i('location'))}${fld('Audit type', i('type'))}<div class="two">${fld('Audit date from', i('dateFrom', 'type="date"'))}${fld('to', i('dateTo', 'type="date"'))}</div>
      ${fld('Lead auditor', `<select data-scope="audit" data-f="lead" data-rr${dis(ed && can('createAudit'))}>${names.map(n => `<option${a.lead === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}
      <div class="fld"><span>Audit team members</span><div class="checks">${names.filter(n => n !== a.lead).map(n => `<label><input type="checkbox" data-scope="team" data-name="${esc(n)}"${a.team.includes(n) ? ' checked' : ''}${dis(ed && can('createAudit'))}> ${esc(n)}</label>`).join('')}</div></div>
      ${fld('Other team members', i('teamOther'))}${fld('Checklist version', `<input value="${esc(S.tpl ? S.tpl.name + ' (' + S.tpl.version + ')' : '')}" disabled>`, 'Fixed for the life of the audit.')}${fld('Audit scope and boundaries', `<textarea data-scope="audit" data-f="scope" rows="4"${dis(ed)}>${esc(a.scope)}</textarea>`)}
      <p class="muted small">Created ${fmtDT(a.createdAt)} by ${esc(a.createdBy)}${a.submittedAt ? '; submitted ' + fmtDT(a.submittedAt) + ' by ' + esc(a.submittedBy) : ''}${a.approvedAt ? '; approved ' + fmtDT(a.approvedAt) + ' by ' + esc(a.approvedBy) : ''}${a.reviewNote ? '. Review comment: ' + esc(a.reviewNote) : ''}</p></div>`;
  },
  profile() {
    const a = S.audit, ed = canDetails(a);
    return `<p class="muted small">From the Building Profile sheet of the checklist. Each entry shows the requirements that depend on it.</p><div class="card">${S.tpl.profile.map(p => fld(esc(p.label), `<input data-scope="profile" data-label="${esc(p.label)}" value="${esc(a.profile[p.label])}" placeholder="${p.example ? 'e.g. ' + esc(p.example) : ''}"${dis(ed)}>`, esc(p.why))).join('')}</div>`;
  },
  photos() {
    const t = S.tpl, by = {}; S.photos.forEach(p => (by[p.qid] || (by[p.qid] = [])).push(p));
    const ids = t.items.filter(it => by[it.id]); if (!ids.length) return '<p class="muted pad">No photographs yet. Add them from each question.</p>';
    return ids.map(it => `<div class="card"><button class="lnk" data-act="nav" data-v="q" data-q="${esc(it.id)}"><b>${esc(it.id)}</b> ${pill((S.audit.resp[it.id] || {}).st)}</button><p class="small">${esc(it.req)}</p><div class="photos">${by[it.id].map(p => `<figure><img src="${p.data}" alt=""><figcaption><span class="pref">${p.kind === 'closure' ? 'After action' : 'Audit'}</span> ${esc(p.caption)}</figcaption></figure>`).join('')}</div></div>`).join('');
  },
  trail() {
    const l = (S.audit.trail || []).slice().reverse();
    return `<p class="muted small">Status changes, bulk actions, reports generated, and every change made after an audit is returned for correction.</p>` + l.map(x => `<div class="trail"><small>${fmtDT(x.at)} · ${esc(x.by)} (${esc(x.role)})</small><b>${esc(x.act)}</b>${x.detail ? `<p>${esc(x.detail)}</p>` : ''}</div>`).join('');
  },
  templates() {
    return `<label class="btn pri wide"><input type="file" accept=".xlsx" data-file="xlsx" hidden>Import checklist from Excel (.xlsx)</label><p class="muted small">The workbook needs a sheet with a header row containing "Audit point", "Requirement" or "Question". Columns named Ref, Standard reference, Requirement type, Applicability, Guidance, Method, Severity and Weight are picked up when present; rows reading "Section X: name" start a section.</p>` +
      S.templates.map(t => { const u = tplUsed(t.id); return `<div class="card"><div class="ac-h"><b>${esc(t.name)}</b><span class="badge ${t.active ? 's-approved' : 's-draft'}">${t.active ? 'Active' : 'Inactive'}</span></div><small>${esc(t.version)} · ${t.items.length} questions · ${t.sections.length} sections · used by ${u} audit(s)</small><small class="muted">Source: ${esc(t.source || '')}</small><div class="btnrow"><button class="btn" data-act="nav" data-v="tpl" data-t="${t.id}">${u ? 'View' : 'Edit'}</button><button class="btn" data-act="tplToggle" data-id="${t.id}">${t.active ? 'Deactivate' : 'Activate'}</button><button class="btn" data-act="tplDup" data-id="${t.id}">New version</button></div></div>`; }).join('');
  },
  tpl(r) {
    const t = S.templates.find(x => x.id === r.t); if (!t) return note('Checklist not found.'); const used = tplUsed(t.id);
    let h = used ? note(`Used by ${used} audit(s), so its questions are locked. Use "New version" to make an editable copy.`, 'lock') : '';
    h += `<div class="card">${fld('Checklist name', `<input data-scope="tpl" data-t="${t.id}" data-f="name" value="${esc(t.name)}"${dis(!used)}>`)}${fld('Version label', `<input data-scope="tpl" data-t="${t.id}" data-f="version" value="${esc(t.version)}"${dis(!used)}>`)}<div class="btnrow"><button class="btn" data-act="tplDup" data-id="${t.id}">New version</button>${used ? '' : `<button class="btn" data-act="secAdd" data-t="${t.id}">Add section</button><button class="btn danger" data-act="tplDel" data-id="${t.id}">Delete</button>`}</div></div>`;
    t.sections.forEach(s => { const its = t.items.filter(i => i.sec === s.id); h += `<details class="card tsec"><summary><span class="sid sm">${esc(s.id)}</span> ${esc(s.name)} <span class="count">${its.length}</span></summary>${used ? '' : fld('Section name', `<input data-scope="tsec" data-t="${t.id}" data-sec="${esc(s.id)}" value="${esc(s.name)}">`)}${its.map(i => `<button class="qrow" data-act="nav" data-v="tq" data-t="${t.id}" data-q="${esc(i.id)}"><div class="qr-h"><b>${esc(i.id)}</b><span class="tag">S${i.sev} · W${i.weight}</span></div><p>${esc(i.req)}</p></button>`).join('')}${used ? '' : `<button class="btn wide" data-act="tqAdd" data-t="${t.id}" data-sec="${esc(s.id)}">＋ Add question to Section ${esc(s.id)}</button>`}</details>`; });
    return h;
  },
  tq(r) {
    const t = S.templates.find(x => x.id === r.t), it = t && t.items.find(x => x.id === r.q); if (!it) return note('Question not found.'); const ed = !tplUsed(t.id);
    const a = (f, extra) => `data-scope="tq" data-t="${t.id}" data-q="${esc(it.id)}" data-f="${f}" ${extra || ''}${dis(ed)}`;
    return `${ed ? '' : note('Locked: this checklist version is used by an audit.', 'lock')}<div class="card"><div class="two">${fld('Question ID (unique)', `<input ${a('id')} value="${esc(it.id)}">`)}${fld('Section / safety domain', `<select ${a('sec')}>${t.sections.map(s => `<option value="${esc(s.id)}"${s.id === it.sec ? ' selected' : ''}>${esc(s.id)}: ${esc(s.name)}</option>`).join('')}</select>`)}</div>
      ${fld('Audit point (requirement)', `<textarea ${a('req')} rows="3">${esc(it.req)}</textarea>`)}${fld('Standard reference', `<input ${a('ref')} value="${esc(it.ref)}">`)}
      ${fld('Requirement type', `<select ${a('type')}>${[...new Set(['Mandatory (shall)', 'Recommended (should)', 'Advisory (may / desirable)', 'Good practice (not an NBC clause)', it.type || ''])].filter(Boolean).map(o => `<option${o === it.type ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`)}
      ${fld('Applicability', `<input ${a('app')} value="${esc(it.app)}">`)}${fld('Guidance for the auditor', `<textarea ${a('guide')} rows="4">${esc(it.guide)}</textarea>`)}
      <div class="two">${fld('Method (D, V, M, T)', `<input ${a('method')} value="${esc(it.method)}">`)}${fld('Default severity (1-5)', `<input type="number" min="1" max="5" step="1" ${a('sev', 'data-num')} value="${it.sev}">`)}</div>
      ${fld('Question weight in the compliance score', `<input type="number" min="0.1" step="0.1" ${a('weight', 'data-num')} value="${it.weight}">`, 'Imported checklists start with weight = default severity, as in the Excel workbook.')}
      ${ed ? `<button class="btn danger" data-act="tqDel" data-t="${t.id}" data-q="${esc(it.id)}">Delete question</button>` : ''}</div>`;
  },
  settings() {
    const s = S.settings, num = (path, v, extra) => `<input type="number" data-scope="set" data-num data-path="${path}" value="${v}" ${extra || 'step="any"'}>`, txt = (path, v) => `<input data-scope="set" data-path="${path}" value="${esc(v)}">`;
    return `${note('Changes apply to audits created from now on. An existing audit keeps its own settings unless "Apply current settings" is used inside it.')}
      <div class="card"><h3>Compliance score</h3><div class="three">${fld('Credit: Compliant', num('credits.C', s.credits.C))}${fld('Partially compliant', num('credits.PC', s.credits.PC))}${fld('Non-compliant', num('credits.NC', s.credits.NC))}</div>
      ${fld('Question weight', `<select data-scope="set" data-path="weightBasis"><option value="question"${s.weightBasis === 'question' ? ' selected' : ''}>Weight set per question in the checklist (default)</option><option value="severity"${s.weightBasis === 'severity' ? ' selected' : ''}>Severity as assessed by the auditor (Excel formula)</option><option value="equal"${s.weightBasis === 'equal' ? ' selected' : ''}>Equal weight</option></select>`, 'Score = Σ(credit × weight) ÷ Σ(weight) over C, PC and NC questions. N/A and Not verified are outside the calculation. The default keeps the compliance score independent of the auditor\'s risk ratings.')}</div>
      <div class="card"><h3>Overall rating bands</h3><p class="muted small">Rating is set by the compliance score alone. A band applies from its minimum score up to the next band.</p>${s.ratings.map((r, i) => `<div class="bandrow">${txt('ratings.' + i + '.name', r.name)}${num('ratings.' + i + '.min', r.min, 'step="any" min="0" max="100"')}<span>%</span><button class="ib del" data-act="delRating" data-i="${i}" aria-label="Remove band">✕</button></div>`).join('')}<button class="btn" data-act="addRating">Add band</button></div>
      <div class="card"><h3>Risk grade bands</h3><p class="muted small">Risk score = Severity × Likelihood (1 to 25).</p>${s.grades.map((g, i) => `<div class="gband"><div class="bandrow">${txt('grades.' + i + '.name', g.name)}${num('grades.' + i + '.min', g.min, 'step="1" min="1" max="25"')}<span>min</span></div>${fld('Timeline for findings', txt('grades.' + i + '.timeline', g.timeline))}${fld('Action required', txt('grades.' + i + '.action', g.action))}</div>`).join('')}
      <label class="check"><input type="checkbox" data-scope="set" data-path="overrideSev5"${s.overrideSev5 ? ' checked' : ''}> A non-compliant question with Severity 5 is graded at least the second-highest band</label></div>
      <div class="card"><h3>Quick answers</h3>${fld('Likelihood set when a question is marked Compliant by quick answer', `<select data-scope="set" data-num data-path="quickLik">${s.lik.map(l => `<option value="${l.n}"${(s.quickLik || 1) === l.n ? ' selected' : ''}>${l.n} ${esc(l.name)}</option>`).join('')}</select>`, 'Shown as a default on the question; the auditor can change it. Reports list the likelihood source.')}</div>
      <div class="card"><h3>Photographs</h3><div class="two">${fld('Photo slots shown per question', num('photoSlots', s.photoSlots, 'step="1" min="3" max="12"'), 'More can always be added.')}${fld('Longest side stored (pixels)', num('photoMaxPx', s.photoMaxPx, 'step="100" min="600" max="4000"'))}</div></div>
      <div class="card"><h3>Reference numbers and reports</h3><div class="two">${fld('Audit reference prefix', txt('refPrefix', s.refPrefix))}${fld('Device / office code', txt('deviceCode', s.deviceCode), 'Keeps references unique across devices.')}</div>${fld('Auditing firm name (report cover)', txt('firm', s.firm))}${fld('Record retention (years)', num('retentionYears', s.retentionYears, 'step="1" min="1"'), 'Recorded as policy. The pilot does not delete records automatically.')}</div>
      <button class="btn wide" data-act="resetSettings">Reset scoring to the Excel checklist values</button>`;
  },
  data() {
    return `<div class="card"><h3>Backup</h3><p class="muted small">Audits and photos are stored in this browser on this device only. Download a backup file regularly and keep it somewhere safe.</p><div class="btnrow"><button class="btn pri" data-act="backup">Download backup</button><label class="btn"><input type="file" accept=".json,application/json" data-file="restore" hidden>Restore backup</label></div></div>
      <div class="card"><h3>Sample audit</h3><p class="muted small">Creates an audit with invented responses, clearly marked as sample data.</p><div class="btnrow">${S.templates.filter(t => t.active).map(t => `<button class="btn sm" data-act="demoProg" data-t="${t.id}">Sample: ${esc(t.client ? t.client.replace(/ \(sample\)/, '') + ' store' : t.name)}</button>`).join('')}</div></div>
      <div class="card"><h3>Erase</h3><button class="btn danger" data-act="wipe">Erase all data on this device</button></div>`;
  },
  help() {
    return `<div class="card prose"><h3>Workflow</h3><ol><li><b>Audit Administrator</b> imports or selects a checklist version and creates the audit, naming the lead auditor and team.</li><li><b>Auditor</b> fills the building profile, then answers each question: response (C, PC, NC, N/A, NV), observation, severity and likelihood, recommendation, photographs.</li><li>The dashboard recalculates compliance, rating and risk profile after every answer.</li><li>Auditor submits. Responses lock. A <b>Reviewer</b> may approve or return the audit; approval is not needed to generate reports.</li><li>Word and Excel audit reports are downloaded from the Reports tab.</li><li>After submission, corrective actions are tracked under Closure and verified; closure reports are downloaded in Word and Excel.</li></ol>
      <h3>Sign-in</h3><p>The audit application is for Audit Administrators, Auditors, Reviewers and Management. The <b>Admin console</b> ("Administrator sign-in" on the sign-in page, or <code>Admin_Console.html</code>) is for the System Administrator and Audit Administrators: dashboard of all audits, users, checklists, scoring settings and backup. Sessions end after ${IDLE_MIN} minutes without activity.</p><h3>Audit programmes and the walk-through</h3><p>Each audit uses a <b>programme</b>: a client's own KPI set (for example the Decathlon sample, which links each KPI to library requirements) or the full requirement library (NBC 2016, IS standards and CEA 2023). After creating an audit, answer the <b>scoping</b> questions about the building; requirements that cannot apply are set aside as N/A with the reason. The <b>walk-through</b> groups questions by site area, so the auditor answers what is in front of them; switch to KPI group or section at any time. Tap C on a card to record compliance in one step; other answers open the full question. <b>Measurement</b> questions take readings and set the status from the benchmark.</p><h3>Two separate measures</h3><p><b>Compliance score</b> = Σ(credit × question weight) ÷ Σ(weight) over questions marked C, PC or NC. N/A and Not verified questions are outside it. The overall rating comes from this score alone.</p><p><b>Risk score</b> = Severity × Likelihood for every applicable question, whatever its compliance response. Severity is pre-filled from the checklist and can be changed; likelihood is the auditor's judgement. A compliant question can carry a high risk rating, and a non-compliant one a low rating. Action timelines apply only to findings (NC or PC).</p>
      <h3>Pilot limits</h3><ul><li>Data stays in this browser on this device. There is no server and no automatic backup; the System Administrator takes backups in the Admin console.</li><li>Sign-in controls who can do what in the application. The stored data is not encrypted, so protect the device itself with a screen lock.</li><li>Several auditors work on separate devices and combine their work with the audit package export and merge.</li></ul></div>`;
  }
};

function topbar() {
  const r = S.route, inA = (AUDIT_VIEWS.includes(r.v) || r.v === 'aaudit') && S.audit, adm = S.mode === 'admin', ini = S.user.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<header class="top"><div class="top-in">${['home', 'completed', 'adash', 'users', 'templates', 'settings', 'data'].includes(r.v) ? `<span class="logo">${adm ? '⚙' : '◆'}</span>` : '<button class="ib" data-act="back" aria-label="Back">‹</button>'}<div class="tt"><b>${inA ? esc(S.audit.ref) : (TITLES[r.v] || '')}</b><small>${inA ? esc(S.audit.site) : adm ? 'Admin Console' : 'Safety Audit Platform'}</small></div><button class="who" data-act="nav" data-v="account" aria-label="My account"><span>${esc(ini)}</span><small>${esc(S.user.name.split(/\s+/)[0])}</small></button></div></header>`;
}
function bottomNav() {
  const r = S.route, ic = { overview: '◔', sections: '☑', closure: '✓', reports: '▤', more: '⋯', home: '⌂', completed: '▤', help: '?', adash: '◔', users: '◉', templates: '☑', settings: '⚙', data: '⇅' };
  let tabs, pre = '';
  if (S.mode === 'admin') tabs = [['adash', 'Dashboard', ['adash', 'aaudit']]].concat(can('users') ? [['users', 'Users', ['users', 'user', 'activity']]] : [], [['templates', 'Programmes', ['templates', 'tpl', 'tq', 'pnew']], ['settings', 'Settings', ['settings']]], can('data') ? [['data', 'Data', ['data']]] : [['help', 'Help', ['help']]]);
  else if (AUDIT_VIEWS.includes(r.v) && S.audit) { pre = '<button data-act="home"><i>⌂</i>Audits</button>'; tabs = [['overview', 'Overview', ['overview']], ['sections', 'Walk-through', ['sections', 'section', 'q', 'scope']], ['closure', 'Closure', ['closure', 'clo']], ['reports', 'Reports', ['reports']], ['more', 'More', ['more', 'details', 'profile', 'photos', 'trail']]]; }
  else tabs = [['home', 'Audits', ['home', 'newAudit']], ['completed', 'Reports', ['completed']], ['help', 'Help', ['help']]];
  return `<nav class="bot"><div class="bot-in">${pre}${tabs.map(t => `<button class="${t[2].includes(r.v) ? 'on' : ''}" data-act="nav" data-v="${t[0]}"><i>${ic[t[0]]}</i>${t[1]}</button>`).join('')}</div></nav>`;
}
function modalHtml() {
  const m = S.modal; if (!m) return '';
  return `<div class="modal"><div class="mbox"><h3>${esc(m.title)}</h3>${m.msg ? `<p>${esc(m.msg).replace(/\n/g, '<br>')}</p>` : ''}${m.input ? `<textarea id="modal-in" rows="3" placeholder="${esc(m.placeholder || '')}"></textarea>` : ''}<div class="btnrow end"><button class="btn" data-act="modalCancel">Cancel</button><button class="btn ${m.danger ? 'danger' : 'pri'}" data-act="modalOk">${esc(m.okLabel || 'OK')}</button></div></div></div>`;
}
const LOGIN_VIEWS = ['login', 'alogin', 'setup'];
const ADMIN_VIEWS = ['pnew', 'adash', 'aaudit', 'users', 'user', 'activity', 'templates', 'tpl', 'tq', 'settings', 'data', 'account', 'pwchange', 'help'];
const USER_VIEWS = ['home', 'newAudit', 'completed', 'account', 'pwchange', 'help'].concat(AUDIT_VIEWS);
function guardRoute() {
  const r = S.route;
  if (!S.user) { if (r.v !== loginView()) S.route = { v: loginView() }; return; }
  if (S.user.mustChange && r.v !== 'pwchange') { S.route = { v: 'pwchange' }; return; }
  const allowed = S.mode === 'admin' ? ADMIN_VIEWS : USER_VIEWS;
  if (!allowed.includes(r.v) || (r.v === 'users' || r.v === 'user' || r.v === 'activity') && !can('users') || r.v === 'data' && !can('data')) S.route = { v: homeView() };
}
function viewHtml() { const r = S.route; return (V[r.v] || V.home)(r); }
function render() {
  if (typeof document === 'undefined') return;
  guardRoute(); document.body.className = S.mode === 'admin' ? 'adm' : '';
  const y = window.scrollY; let body;
  try { body = viewHtml(); } catch (e) { console.error(e); body = note('This screen could not be displayed: ' + esc(e.message), 'warn'); }
  const chrome = !!S.user && !LOGIN_VIEWS.includes(S.route.v);
  document.getElementById('app').innerHTML = (chrome ? topbar() : '') + `<main class="v-${S.route.v}">${body}</main>` + (chrome ? bottomNav() : '') + modalHtml();
  window.scrollTo(0, S.keepScroll ? y : 0); S.keepScroll = false;
}
