/* ---------- sign-in, user accounts, audit register and admin console ---------- */
const IDLE_MIN = 30, USER_ROLES = ['auditadmin', 'auditor', 'reviewer', 'management'], ADMIN_ROLES = ['sysadmin', 'auditadmin'], COMPLETED = ['submitted', 'approved', 'closed'];
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* SHA-256 (pure JS, works on file:// and without a secure context) */
const SHA = (() => { const K = [], H = [], f = x => ((x - Math.floor(x)) * 4294967296) >>> 0; for (let c = 2, n = 0; n < 64; c++) { let p = true; for (let d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; } if (p) { if (n < 8) H.push(f(Math.sqrt(c))); K.push(f(Math.cbrt(c))); n++; } } return { K, H }; })();
function sha256(msg) {
  const K = SHA.K, H = SHA.H.slice(), l = msg.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb), w = new Uint32Array(64);
  m.set(msg); m[l] = 0x80; const bits = l * 8, dv = new DataView(m.buffer); dv.setUint32(nb - 8, Math.floor(bits / 4294967296)); dv.setUint32(nb - 4, bits >>> 0);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < nb; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) { const a = w[t - 15], b = w[t - 2]; w[t] = (w[t - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[t - 7] + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
}
const hexOf = u8 => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
function hashPw(pw, salt) { let h = sha256(_te.encode(salt + ':' + pw)); for (let i = 0; i < 5000; i++) h = sha256(h); return hexOf(h); }
function newSalt() { const a = new Uint8Array(16); if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < 16; i++) a[i] = Math.random() * 256 | 0; return hexOf(a); }
function setPassword(u, pw) { u.salt = newSalt(); u.hash = hashPw(pw, u.salt); u.pwSetAt = new Date().toISOString(); }
function checkPw(u, pw) { return !!(u && u.hash) && hashPw(pw, u.salt) === u.hash; }
function pwProblem(p) { return !p || p.length < 8 ? 'The password must have at least 8 characters.' : ''; }

/* users and session */
function slug(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'user'; }
function migrateUsers(list) { const seen = new Set(); list.forEach(u => { if (u.active === undefined) u.active = true; const b = u.username || slug(u.name); let x = b, i = 2; while (seen.has(x.toLowerCase())) x = b + i++; u.username = x; seen.add(x.toLowerCase()); }); return list; }
function activeAdmins() { return S.users.filter(u => u.role === 'sysadmin' && u.active !== false && u.hash).length; }
function needsSetup() { return activeAdmins() === 0; }
function homeView() { return S.mode === 'admin' ? 'adash' : 'home'; }
function loginView() { return S.mode === 'admin' ? (needsSetup() ? 'setup' : 'alogin') : 'login'; }
function roleAllowed(u, mode) { return (mode === 'admin' ? ADMIN_ROLES : USER_ROLES).includes(u.role); }
function actLog(act, detail) { (S.activity || (S.activity = [])).push({ at: new Date().toISOString(), by: S.user ? S.user.name + ' (' + S.user.username + ')' : '–', act, detail: detail || '' }); if (S.activity.length > 1000) S.activity.splice(0, S.activity.length - 1000); return DB.put('kv', S.activity, 'activity'); }
function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { } return null; }
function restoreSession() { try { const s = JSON.parse(ss('sap-session') || 'null'); if (!s || s.mode !== S.mode) return; const u = S.users.find(x => x.id === s.uid); if (u && u.active !== false && u.hash && roleAllowed(u, S.mode)) S.user = u; } catch (e) { } }
function signIn(u) {
  S.user = u; S.loginErr = ''; S.loginUser = ''; S.fails = 0; u.lastLogin = new Date().toISOString(); saveUsers();
  ss('sap-session', JSON.stringify({ uid: u.id, mode: S.mode })); actLog('Signed in', S.mode === 'admin' ? 'Admin console' : 'Audit application'); S.lastAct = Date.now();
  go({ v: u.mustChange ? 'pwchange' : homeView() }, true);
}
function signOut(quiet) {
  if (S.user && !quiet) actLog('Signed out');
  S.user = null; S.audit = null; S.tpl = null; S.photos = []; S.form = null; S.modal = null; S.loginErr = ''; ss('sap-session', null);
  S.route = { v: loginView() }; try { history.replaceState(S.route, ''); } catch (e) { } render();
}
const $v = id => { const el = typeof document !== 'undefined' && document.getElementById(id); return el ? el.value : ''; };

/* register of audits */
function auditRow(a) { const t = S.templates.find(x => x.id === a.tplId); if (!t) return { a, t: null }; const k = computeAudit(a, t); return { a, t, k, cs: closureStats(a, t, k) }; }
function regList() {
  const f = S.reg.f, q = S.reg.q.trim().toLowerCase();
  let l = S.mode === 'admin' ? S.audits.slice() : visibleAudits();
  l = l.filter(a => f === 'all' || (f === 'done' ? COMPLETED.includes(a.status) : !COMPLETED.includes(a.status)));
  if (q) l = l.filter(a => [a.ref, a.site, a.org, a.location, a.lead, a.type].join(' ').toLowerCase().includes(q));
  return l.sort((x, y) => (y.submittedAt || y.createdAt || '').localeCompare(x.submittedAt || x.createdAt || '')).map(auditRow);
}
async function reportFor(a, kind) {
  const tpl = S.templates.find(t => t.id === a.tplId); if (!tpl) throw new Error('The checklist version of this audit is not on this device.');
  const photos = S.audit && S.audit.id === a.id ? S.photos : await DB.byAudit(a.id);
  const c = reportCtx(a, tpl, photos), base = a.ref + '_' + (a.site || '').replace(/[^\w]+/g, '_').slice(0, 30);
  const m = { docx: [buildAuditDocx, '_Audit_Report.docx', MIME_DOCX, 'Audit report (Word)'], xlsx: [buildAuditXlsx, '_Audit_Report.xlsx', MIME_XLSX, 'Audit report (Excel)'], cdocx: [buildClosureDocx, '_Closure_Report.docx', MIME_DOCX, 'Closure report (Word)'], cxlsx: [buildClosureXlsx, '_Closure_Report.xlsx', MIME_XLSX, 'Closure report (Excel)'] }[kind];
  download(m[0](c, S.opt), base + m[1], m[2]);
  (a.trail || (a.trail = [])).push({ at: new Date().toISOString(), by: S.user.name, role: ROLES[S.user.role], act: 'Report generated', detail: m[3] });
  a.updatedAt = new Date().toISOString(); await DB.put('audits', a);
}
function registerXlsx(rows) {
  const b = new XlsxBook(), St = xlsxStyles(b), gn = sortedGrades(S.settings).map(g => g.name).reverse();
  const H = ['Audit reference', 'Organisation', 'Facility / site', 'Location', 'Audit type', 'Audit date(s)', 'Lead auditor', 'Audit team', 'Status', 'Submitted on', 'Approved by', 'Checklist', 'Compliance %', 'Overall rating', 'Questions', 'Answered', 'C', 'PC', 'NC', 'NA', 'NV', 'Findings (NC / PC)'].concat(gn.map(g => g + ' findings'), ['Findings verified closed', 'Overdue actions']);
  const out = [[{ v: 'Audit register', s: St.t }], [{ v: 'Generated ' + fmtDT(new Date().toISOString()) + ' by ' + S.user.name + '. "Completed" = submitted, approved or closed.', s: St.sub }], H.map(v => ({ v, s: St.h }))];
  rows.forEach(x => {
    const a = x.a, k = x.k, n = k ? k.counts : {};
    out.push([{ v: a.ref, s: St.b }, a.org, a.site, a.location, a.type, auditDates(a), a.lead, (a.team || []).concat(a.teamOther ? [a.teamOther] : []).join(', '), AUDIT_STATUS[a.status], fmtDate(a.submittedAt), a.approvedBy || '', x.t ? x.t.name + ' (' + x.t.version + ')' : 'missing',
      { v: k && k.score != null ? k.score / 100 : '', s: St.p }, k ? k.rating : '', k ? k.total : '', k ? k.answered : '', n.C, n.PC, n.NC, n.NA, n.NV, k ? n.NC + n.PC : ''].map(v => (v && typeof v === 'object') ? v : { v: v == null ? '' : v, s: St.n })
      .concat(gn.map(g => ({ v: k ? (k.find[g] || 0) : '', s: St.c })), [{ v: x.cs ? x.cs.verified : '', s: St.c }, { v: x.cs ? x.cs.overdue : '', s: St.c }]));
  });
  b.addSheet({ name: 'Audit register', cols: [16, 26, 30, 22, 22, 20, 18, 24, 12, 13, 16, 30, 12, 18, 10, 10, 6, 6, 6, 6, 6, 12].concat(gn.map(() => 11), [12, 10]), rows: out, freeze: { row: 3, col: 1 }, filter: 'A3:' + colL(H.length - 1) + (rows.length + 3) });
  return b.build();
}

/* ---------- views ---------- */
function brand(adm) { return `<div class="lbrand"><span class="logo">${adm ? '⚙' : '◆'}</span><h1>${adm ? 'Admin Console' : 'Safety Audit Platform'}</h1><p>${adm ? 'Users, checklists, scoring and all audits' : 'Fire and life safety audits'}</p></div>`; }
const errNote = () => S.loginErr ? note(esc(S.loginErr), 'warn') : '';
function loginCard(adm) {
  const noUsers = !adm && !S.users.some(u => u.hash && u.active !== false && roleAllowed(u, 'user'));
  return `<div class="login${adm ? ' adm' : ''}">${brand(adm)}${S.memOnly ? note('This browser is not allowing the page to store data. Open the file in Chrome or Edge.', 'warn') : ''}
    <form class="card lcard" data-form="login" autocomplete="on"><h2>${adm ? 'Administrator sign-in' : 'Sign in'}</h2>${errNote()}${noUsers ? note('No user accounts exist on this device yet. The System Administrator creates them in the Admin console.') : ''}
    ${fld('Username', `<input id="li-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(S.loginUser || '')}" required>`)}
    ${fld('Password', `<input id="li-pw" name="password" type="password" autocomplete="current-password" required>`)}
    <button class="btn pri wide" type="submit">Sign in</button></form>
    <p class="lswitch">${adm ? '<a href="#">← Audit application sign-in</a>' : '<a href="#admin">Administrator sign-in →</a>'}</p><p class="lfoot muted small">Pilot v0.2 · data is stored on this device</p></div>`;
}
Object.assign(V, {
  login() { return loginCard(false); },
  alogin() { return loginCard(true); },
  setup() {
    const u0 = S.users.find(x => x.role === 'sysadmin') || {}, d = S.setupDraft || { name: u0.name || '', un: u0.username || '' };
    return `<div class="login adm">${brand(true)}<form class="card lcard" data-form="setup"><h2>First-time setup</h2><p class="muted small">Create the System Administrator account for this device. The System Administrator then creates the accounts of all other users.</p>${errNote()}
      ${fld('Full name', `<input id="su-name" value="${esc(d.name)}" required>`)}${fld('Username', `<input id="su-user" value="${esc(d.un)}" autocapitalize="none" spellcheck="false" autocomplete="username" required>`)}
      ${fld('Password', '<input id="su-pw" type="password" autocomplete="new-password" required>', 'At least 8 characters.')}${fld('Confirm password', '<input id="su-pw2" type="password" autocomplete="new-password" required>')}
      <button class="btn pri wide" type="submit">Create account and sign in</button></form><p class="lswitch"><a href="#">← Audit application sign-in</a></p></div>`;
  },
  pwchange() {
    return `${S.user.mustChange ? note('Please choose your own password before continuing.', 'warn') : ''}<form class="card" data-form="changePw">${errNote()}
      ${fld('Current password', '<input id="pc-cur" type="password" autocomplete="current-password" required>')}${fld('New password', '<input id="pc-new" type="password" autocomplete="new-password" required>', 'At least 8 characters.')}${fld('Confirm new password', '<input id="pc-new2" type="password" autocomplete="new-password" required>')}
      <button class="btn pri wide" type="submit">Change password</button></form>${S.user.mustChange ? '<button class="btn wide" data-act="signOut">Sign out</button>' : ''}`;
  },
  account() {
    const u = S.user, ini = u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(), both = ADMIN_ROLES.includes(u.role) && USER_ROLES.includes(u.role);
    return `<div class="card"><div class="acct"><span class="av">${esc(ini)}</span><div><b>${esc(u.name)}</b><small>${esc(u.username)} · ${ROLES[u.role]}</small><small>Signed in to the ${S.mode === 'admin' ? 'Admin console' : 'audit application'}</small></div></div></div>
      <div class="card">${link('Change password', '', 'data-act="nav" data-v="pwchange"')}${link('Help', 'How the platform works', 'data-act="nav" data-v="help"')}${both ? link(S.mode === 'admin' ? 'Go to the audit application' : 'Go to the Admin console', 'You will be asked to sign in again', 'data-act="switchMode"') : ''}</div>
      <button class="btn danger wide" data-act="signOut">Sign out</button>`;
  },
  completed() {
    return `<p class="muted small">Completed audits are those submitted, approved or closed. Reports can be downloaded straight from this list.</p>${regControls()}<div id="reglist" class="reggrid">${regListHtml()}</div><button class="btn wide" data-act="regExport">Export this list to Excel</button>`;
  },
  adash() {
    const all = S.audits.map(auditRow).filter(x => x.k), done = all.filter(x => COMPLETED.includes(x.a.status)), scores = done.filter(x => x.k.score != null).map(x => x.k.score);
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null, gn = sortedGrades(S.settings).map(g => g.name).reverse(); let top = 0, sec = 0, overdue = 0;
    done.forEach(x => { const gs = x.k.grades.slice().reverse(); findingsOf(x.a, x.t, x.k).forEach(f => { if (((f.r.clo && f.r.clo.status) || 'open') === 'verified' || !f.risk) return; if (f.risk.grade === gs[0]) top++; else if (f.risk.grade === gs[1]) sec++; }); overdue += x.cs.overdue; });
    const tile = (v, l, c) => `<div class="tile" style="${c ? 'border-top-color:' + c : ''}"><b>${v}</b><span>${l}</span></div>`;
    const bands = S.settings.ratings.slice().sort((a, b) => b.min - a.min), dist = {}; done.forEach(x => { if (x.k.score != null) dist[x.k.rating] = (dist[x.k.rating] || 0) + 1; });
    const names = bands.map(b => b.name).concat(Object.keys(dist).filter(n => !bands.some(b => b.name === n))), mx = Math.max(1, ...Object.values(dist));
    return `<div class="hello"><p>${esc(S.user.name)} · ${ROLES[S.user.role]} · ${fmtDate(new Date().toISOString())}</p></div>
      <div class="tiles">${tile(S.audits.length, 'Total audits')}${tile(done.length, 'Completed', ST.C.color)}${tile(S.audits.length - done.length, 'In progress / draft', '#1d4fa3')}${tile(pct(avg), 'Average compliance (completed)', '#1f3864')}${tile(top, 'Open ' + esc(gn[0] || '') + ' findings', '#c5221f')}${tile(sec, 'Open ' + esc(gn[1] || '') + ' findings', '#b45309')}${tile(overdue, 'Overdue actions', ST.NC.color)}${tile(S.users.filter(u => u.active !== false && u.hash).length, 'Active users')}</div>
      <div class="dgrid"><div class="card"><h2>Overall rating of completed audits</h2>${done.length ? names.map(nm => { const s = ratingStyle(S.settings, nm), v = dist[nm] || 0; return `<div class="dist"><span class="chip" style="background:${s.bg};color:${s.color}">${esc(nm)}</span><div class="bar"><i style="width:${v / mx * 100}%;background:${s.color === '#ffffff' ? s.bg : s.color}"></i></div><b>${v}</b></div>`; }).join('') : '<p class="muted small">No completed audits yet.</p>'}<p class="muted small">Ratings come from each audit's compliance score alone.</p></div>
      <div class="card"><h2>Lowest compliance (completed)</h2>${done.filter(x => x.k.score != null).sort((p, q) => p.k.score - q.k.score).slice(0, 5).map(x => `<button class="srow" data-act="nav" data-v="aaudit" data-a="${x.a.id}"><div class="grow"><div class="sr-t"><span>${esc(x.a.ref)} · ${esc(x.a.site)}</span><b>${pct(x.k.score)}</b></div>${bar(x.k.score, ratingColor(x.a.cfg, x.k.rating))}</div></button>`).join('') || '<p class="muted small">No completed audits yet.</p>'}</div></div>
      <h2 class="mt">Audits</h2>${regControls()}<div id="reglist" class="reggrid">${regListHtml()}</div><button class="btn wide" data-act="regExport">Export this list to Excel</button>`;
  },
  aaudit() {
    const a = S.audit, t = S.tpl; if (!t) return note('The checklist version used by this audit is not on this device.', 'warn');
    const k = computeAudit(a, t), cfg = a.cfg, n = k.counts, cs = closureStats(a, t, k), gs = k.grades.slice().reverse();
    const tile = (v, l, c) => `<div class="tile" style="${c ? 'border-top-color:' + c : ''}"><b>${v}</b><span>${l}</span></div>`, dd = (l, v) => `<dt>${l}</dt><dd>${esc(v) || '–'}</dd>`;
    return `<div class="statusrow">${badge(a)}<small>${esc(t.name)} (${esc(t.version)})</small></div>
      <div class="card hero">${ring(k.score, k.score == null ? '#9aa3af' : ratingColor(cfg, k.rating), pct(k.score))}<div class="hero-r"><small>Overall rating</small>${k.score == null ? '<b>Not assessed</b>' : rchip(cfg, k.rating)}<small class="mt">Audit completion ${pct(k.completion, 0)}</small>${bar(k.completion)}<small>${k.answered} of ${k.total} questions answered</small></div></div>
      <div class="tiles">${tile(k.total, 'Total questions')}${tile(k.applicable, 'Applicable')}${tile(n.NA, 'Not applicable', ST.NA.color)}${tile(n.C, 'Compliant', ST.C.color)}${tile(n.PC, 'Partially compliant', ST.PC.color)}${tile(n.NC, 'Non-compliant', ST.NC.color)}${tile(n.NV, 'Not verified', ST.NV.color)}${tile(n.none, 'Not yet assessed')}</div>
      <div class="card"><h3>Reports</h3>${COMPLETED.includes(a.status) ? '' : '<p class="muted small">Not submitted yet: reports are marked DRAFT.</p>'}<label class="check"><input type="checkbox" data-scope="opt" data-f="photos"${S.opt.photos ? ' checked' : ''}> Embed photographs</label>
        <div class="btnrow"><button class="btn pri" data-act="report" data-k="docx">Audit report – Word</button><button class="btn pri" data-act="report" data-k="xlsx">Audit report – Excel</button></div>${cs.total ? '<div class="btnrow"><button class="btn" data-act="report" data-k="cdocx">Closure report – Word</button><button class="btn" data-act="report" data-k="cxlsx">Closure report – Excel</button></div>' : ''}</div>
      <div class="dgrid"><div class="card"><h3>Audit details</h3><dl>${dd('Organisation', a.org)}${dd('Facility / site', a.site)}${dd('Location', a.location)}${dd('Audit type', a.type)}${dd('Audit date(s)', auditDates(a))}${dd('Lead auditor', a.lead)}${dd('Audit team', (a.team || []).concat(a.teamOther ? [a.teamOther] : []).join(', '))}${dd('Scope', a.scope)}${dd('Submitted', a.submittedAt ? fmtDT(a.submittedAt) + ' by ' + a.submittedBy : '')}${dd('Approved', a.approvedAt ? fmtDT(a.approvedAt) + ' by ' + a.approvedBy : '')}</dl></div>
      <div class="card"><h3>Risk profile</h3><div class="gtable"><div class="gh"><span></span><span>Findings<br>(NC / PC)</span><span>All applicable</span></div>${gs.map(g => { const s = gradeStyle(cfg, g); return `<div><span class="chip" style="background:${s.bg};color:${s.color}">${esc(g)}</span><b>${k.find[g]}</b><span>${k.all[g]}</span></div>`; }).join('')}</div>
        <h3 class="mt">Corrective action closure</h3><p class="small">${cs.total} finding(s): ${cs.verified} verified closed, ${cs.done} awaiting verification, ${cs.progress} in progress, ${cs.open} open${cs.overdue ? ', <b class="red">' + cs.overdue + ' overdue</b>' : ''}.</p></div></div>
      <div class="card"><h3>Section-wise compliance</h3>${k.sections.map(s => `<div class="srow"><span class="sid sm">${esc(s.id)}</span><div class="grow"><div class="sr-t"><span>${esc(s.name)}</span><b>${pct(s.score)}</b></div>${bar(s.score, s.score == null ? '' : ratingColor(cfg, rateScore(s.score, cfg)))}<small>${s.counts.C} C · ${s.counts.PC} PC · ${s.counts.NC} NC · ${s.counts.NA} NA · ${s.counts.NV} NV${s.counts.none ? ' · ' + s.counts.none + ' open' : ''}</small></div></div>`).join('')}</div>
      ${can('data') ? '<div class="card"><div class="btnrow"><button class="btn" data-act="exportAudit">Export audit package</button><button class="btn danger" data-act="deleteAudit">Delete audit</button></div></div>' : ''}`;
  },
  users() {
    const st = u => u.active === false ? '<b class="red">Deactivated</b>' : !u.hash ? '<b class="red">No password set – cannot sign in</b>' : u.mustChange ? 'Must change password at next sign-in' : 'Last sign-in: ' + (u.lastLogin ? fmtDT(u.lastLogin) : 'never');
    return `<button class="btn pri wide" data-act="newUser">＋ Create user</button><div class="card">${S.users.slice().sort((a, b) => a.name.localeCompare(b.name)).map(u => `<button class="row" data-act="editUser" data-id="${u.id}"><div><b>${esc(u.name)}${u.id === S.user.id ? ' (you)' : ''}</b><small>${esc(u.username)} · ${ROLES[u.role]} · signs in to ${u.role === 'sysadmin' ? 'Admin console' : u.role === 'auditadmin' ? 'both' : 'audit application'}</small><small>${st(u)}</small></div><span class="chev">›</span></button>`).join('') || '<p class="muted small">No users.</p>'}</div>
      <div class="card">${link('Activity log', 'Sign-ins and changes to user accounts', 'data-act="nav" data-v="activity"')}</div>`;
  },
  user() {
    const f = S.form; if (!f || f.kind !== 'user') return note('Open a user from the Users list.');
    const self = f.id === S.user.id, isNew = !f.id, i = (k, extra) => `data-scope="uform" data-f="${k}" ${extra || ''}`;
    return `<form class="card" data-form="saveUser">${errNote()}
      ${fld('Full name *', `<input ${i('name')} value="${esc(f.name)}" required>`, isNew ? 'Audits are assigned to auditors by this name.' : 'Audits are assigned by name. Renaming does not change existing assignments.')}
      ${fld('Username (for sign-in) *', `<input ${i('username')} value="${esc(f.username)}" autocapitalize="none" spellcheck="false" autocomplete="off" required>`)}
      ${fld('Role', `<select ${i('role')}${dis(!self)}>${Object.keys(ROLES).map(r => `<option value="${r}"${f.role === r ? ' selected' : ''}>${ROLES[r]}</option>`).join('')}</select>`, 'System Administrator signs in to the Admin console only; Audit Administrator to both; the other roles to the audit application only.' + (self ? ' You cannot change your own role.' : ''))}
      ${fld(isNew ? 'Temporary password *' : 'Reset password', `<input type="password" ${i('pw')} value="${esc(f.pw)}" autocomplete="new-password" placeholder="${isNew ? 'At least 8 characters' : 'Leave blank to keep the current password'}">`, 'Give it to the user in person.')}
      <label class="check"><input type="checkbox" ${i('mustChange')}${f.mustChange ? ' checked' : ''}> User must change the password at next sign-in</label>
      <label class="check"><input type="checkbox" ${i('active')}${f.active ? ' checked' : ''}${dis(!self)}> Account active (can sign in)</label>
      <button class="btn pri wide" type="submit">${isNew ? 'Create user' : 'Save changes'}</button></form>${!isNew && !self ? `<button class="btn danger wide" data-act="delUser" data-id="${f.id}">Delete user</button>` : ''}`;
  },
  activity() {
    const l = (S.activity || []).slice().reverse().slice(0, 300);
    return `<p class="muted small">Sign-ins, sign-outs and changes to user accounts on this device (latest first). Changes to audits are in each audit's own trail.</p>` + (l.map(x => `<div class="trail"><small>${fmtDT(x.at)} · ${esc(x.by)}</small><b>${esc(x.act)}</b>${x.detail ? `<p>${esc(x.detail)}</p>` : ''}</div>`).join('') || '<p class="muted pad">No activity yet.</p>');
  }
});
function regControls() { return `<input class="search" type="search" data-scope="regq" value="${esc(S.reg.q)}" placeholder="Search reference, site, organisation, auditor"><div class="chips">${[['done', 'Completed'], ['open', 'In progress'], ['all', 'All']].map(f => `<button class="fchip${S.reg.f === f[0] ? ' on' : ''}" data-act="regFilter" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>`; }
function regListHtml() { const l = regList(); return `<p class="muted small">${l.length} audit(s)</p>` + (l.length ? l.map(regCard).join('') : '<p class="muted pad">No audits match.</p>'); }
function regCard(x) {
  const a = x.a, k = x.k, adm = S.mode === 'admin';
  if (!k) return `<div class="card rcard"><div class="ac-h"><span class="ref">${esc(a.ref)}</span>${badge(a)}</div><b class="site">${esc(a.site)}</b>${note('Checklist version missing on this device.', 'warn')}</div>`;
  const gs = k.grades.slice().reverse(), done = COMPLETED.includes(a.status);
  return `<div class="card rcard"><div class="ac-h"><span class="ref">${esc(a.ref)}</span>${badge(a)}</div><b class="site">${esc(a.site)}</b><small class="muted">${esc(a.org)}${a.location ? ' · ' + esc(a.location) : ''}</small><small class="muted">${esc(auditDates(a))} · Lead: ${esc(a.lead)}${a.submittedAt ? ' · Submitted ' + fmtDate(a.submittedAt) : ''}</small>
    <div class="rstats"><div class="rscore"><b>${pct(k.score)}</b>${k.score != null ? rchip(a.cfg, k.rating) : ''}</div><div class="rmini"><span><b>${k.counts.NC + k.counts.PC}</b> findings</span><span><b>${k.find[gs[0]] || 0}</b> ${esc(gs[0] || '')}</span><span><b>${k.find[gs[1]] || 0}</b> ${esc(gs[1] || '')}</span><span><b>${x.cs.verified}/${x.cs.total}</b> closed</span>${done ? '' : `<span><b>${pct(k.completion, 0)}</b> answered</span>`}</div></div>
    <div class="btnrow rbtns"><button class="btn sm" data-act="regReport" data-id="${a.id}" data-k="docx">Word report</button><button class="btn sm" data-act="regReport" data-id="${a.id}" data-k="xlsx">Excel report</button>${x.cs.total && done ? `<button class="btn sm" data-act="regReport" data-id="${a.id}" data-k="cdocx">Closure – Word</button><button class="btn sm" data-act="regReport" data-id="${a.id}" data-k="cxlsx">Closure – Excel</button>` : ''}<button class="btn sm pri" data-act="nav" data-v="${adm ? 'aaudit' : 'overview'}" data-a="${a.id}">${adm ? 'View summary' : 'Open audit'}</button></div></div>`;
}

/* ---------- actions ---------- */
Object.assign(ACT, {
  login() {
    if (S.lockUntil && Date.now() < S.lockUntil) { S.loginErr = 'Too many failed attempts. Try again in ' + Math.ceil((S.lockUntil - Date.now()) / 1000) + ' seconds.'; return rerender(); }
    S.loginUser = $v('li-user').trim(); const un = S.loginUser.toLowerCase(), pw = $v('li-pw'), u = S.users.find(x => (x.username || '').toLowerCase() === un), ok = checkPw(u, pw);
    if (!ok || u.active === false) {
      if (!ok) { S.fails = (S.fails || 0) + 1; if (S.fails >= 5) { S.fails = 0; S.lockUntil = Date.now() + 60000; } }
      S.loginErr = ok ? 'This account is deactivated. Contact the System Administrator.' : 'Incorrect username or password.'; return rerender();
    }
    if (!roleAllowed(u, S.mode)) { S.loginErr = S.mode === 'admin' ? 'Your role (' + ROLES[u.role] + ') signs in to the audit application, not the Admin console.' : 'System Administrators sign in to the Admin console. Use "Administrator sign-in" below.'; return rerender(); }
    signIn(u);
  },
  async setup() {
    if (!needsSetup()) return signOut(true);
    const name = $v('su-name').trim(), un = $v('su-user').trim(), p1 = $v('su-pw'), p2 = $v('su-pw2');
    let u = S.users.find(x => x.role === 'sysadmin' && !x.hash);
    const err = !name || !un ? 'Enter your full name and a username.' : /\s/.test(un) ? 'The username cannot contain spaces.' : S.users.some(x => x !== u && x.username.toLowerCase() === un.toLowerCase()) ? 'That username is already in use.' : pwProblem(p1) || (p1 !== p2 ? 'The two passwords do not match.' : '');
    if (err) { S.loginErr = err; S.setupDraft = { name, un }; return rerender(); }
    if (!u) { u = { id: uid(), role: 'sysadmin', createdAt: new Date().toISOString() }; S.users.push(u); }
    Object.assign(u, { name, username: un, active: true, mustChange: false }); setPassword(u, p1); S.setupDraft = null;
    await saveUsers(); S.user = u; await actLog('System Administrator account created', un); signIn(u);
  },
  async changePw() {
    const u = S.user, cur = $v('pc-cur'), p1 = $v('pc-new'), p2 = $v('pc-new2');
    const err = !checkPw(u, cur) ? 'The current password is not correct.' : pwProblem(p1) || (p1 !== p2 ? 'The two new passwords do not match.' : '') || (p1 === cur ? 'Choose a password different from the current one.' : '');
    if (err) { S.loginErr = err; return rerender(); }
    setPassword(u, p1); u.mustChange = false; await saveUsers(); await actLog('Password changed'); toast('Password changed'); go({ v: homeView() }, true);
  },
  signOut() { signOut(); },
  switchMode() { const target = S.mode === 'admin' ? '' : 'admin'; signOut(); location.hash = target; },
  newUser() { S.form = { kind: 'user', id: null, name: '', username: '', role: 'auditor', active: true, pw: '', mustChange: true }; go({ v: 'user' }); },
  editUser(d) { const u = S.users.find(x => x.id === d.id); if (!u) return; S.form = { kind: 'user', id: u.id, name: u.name, username: u.username, role: u.role, active: u.active !== false, pw: '', mustChange: !!u.mustChange }; go({ v: 'user', id: u.id }); },
  async saveUser() {
    if (!can('users')) return;
    const f = S.form, isNew = !f.id, un = String(f.username || '').trim(), name = String(f.name || '').trim(), old = isNew ? null : S.users.find(x => x.id === f.id);
    let err = !name || !un ? 'Enter the full name and a username.' : /\s/.test(un) ? 'The username cannot contain spaces.'
      : S.users.some(u => u.id !== f.id && u.username.toLowerCase() === un.toLowerCase()) ? 'That username is already in use.'
        : S.users.some(u => u.id !== f.id && u.name.trim().toLowerCase() === name.toLowerCase()) ? 'Another user already has this name. Names must be unique because audits are assigned by name.'
          : (isNew || f.pw) ? pwProblem(f.pw) : '';
    if (!err && old && old.role === 'sysadmin' && old.hash && old.active !== false && (f.role !== 'sysadmin' || !f.active) && activeAdmins() <= 1) err = 'At least one active System Administrator is needed.';
    if (err) { S.loginErr = err; return rerender(); }
    const u = old || { id: uid(), createdAt: new Date().toISOString(), createdBy: S.user.name }, renamed = old && old.name !== name;
    Object.assign(u, { name, username: un, role: f.role, active: !!f.active, mustChange: !!f.mustChange }); if (f.pw) setPassword(u, f.pw);
    if (isNew) S.users.push(u);
    await saveUsers(); await actLog(isNew ? 'User created' : 'User updated', name + ' (' + un + '), ' + ROLES[u.role] + (f.pw && !isNew ? '; password reset' : '') + (u.active ? '' : '; deactivated') + (renamed ? '; renamed from ' + old.name : ''));
    S.form = null; toast(isNew ? 'User created' : 'Changes saved'); go({ v: 'users' }, true);
  },
  delUser(d) {
    const u = S.users.find(x => x.id === d.id); if (!u || u.id === S.user.id) return;
    const n = S.audits.filter(a => a.lead === u.name || (a.team || []).includes(u.name)).length;
    if (n) return toast(u.name + ' is named on ' + n + ' audit(s). Deactivate the account instead of deleting it.');
    if (u.role === 'sysadmin' && u.hash && u.active !== false && activeAdmins() <= 1) return toast('At least one active System Administrator is needed.');
    ask({ title: 'Delete user ' + u.name + '?', msg: 'The account is removed. This cannot be undone.', okLabel: 'Delete', danger: 1, ok: async () => { S.users = S.users.filter(x => x.id !== u.id); await saveUsers(); await actLog('User deleted', u.name + ' (' + u.username + ')'); S.form = null; go({ v: 'users' }, true); } });
  },
  regFilter(d) { S.reg.f = d.f; rerender(); },
  async regReport(d) { const a = S.audits.find(x => x.id === d.id); if (!a) return; try { await reportFor(a, d.k); toast('Report downloaded'); } catch (e) { console.error(e); toast('Report failed: ' + e.message); } },
  regExport() { download(registerXlsx(regList()), 'Audit_Register_' + todayISO() + '.xlsx', MIME_XLSX); }
});
