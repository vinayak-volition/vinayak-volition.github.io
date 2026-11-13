/* ---------- core: constants, helpers, scoring (no DOM) ---------- */
const ST = {
  C:  { label: 'Compliant', color: '#1b873f', bg: '#e3f4e8' },
  PC: { label: 'Partially compliant', color: '#b86e00', bg: '#fdf0d5' },
  NC: { label: 'Non-compliant', color: '#c5221f', bg: '#fbe3e1' },
  NA: { label: 'Not applicable', color: '#5f6670', bg: '#e6e8eb' },
  NV: { label: 'Not verified', color: '#5b3fb5', bg: '#ebe5fa' }
};
const ST_KEYS = ['C', 'PC', 'NC', 'NA', 'NV'];
const GRADE_PALETTE = [
  { color: '#1b873f', bg: '#d9f0df' }, { color: '#8a6d00', bg: '#fbefb5' },
  { color: '#b45309', bg: '#fddcb5' }, { color: '#ffffff', bg: '#c5221f' }
];
const CLO = { open: 'Open', progress: 'Action in progress', done: 'Action completed - awaiting verification', verified: 'Verified closed' };
const ROLES = { sysadmin: 'System Administrator', auditadmin: 'Audit Administrator', auditor: 'Safety Auditor', reviewer: 'Audit Reviewer', management: 'Management' };
const AUDIT_STATUS = { draft: 'Draft', inprogress: 'In progress', submitted: 'Submitted', approved: 'Approved', closed: 'Closed' };

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(v) { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return String(v); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtDT(v) { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return String(v); return fmtDate(v) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function pct(x, dp) { return x == null ? '–' : x.toFixed(dp == null ? 1 : dp) + '%'; }
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function defaultSettings(tpl) {
  return {
    credits: { C: 1, PC: 0.5, NC: 0 },
    weightBasis: 'question',            // 'question' | 'severity' | 'equal'
    grades: tpl.grades.map(g => Object.assign({}, g)),
    overrideSev5: true,
    ratings: tpl.ratings.map(r => Object.assign({}, r)),
    sev: tpl.sev, lik: tpl.lik,
    photoSlots: 3, photoMaxPx: 1600, quickLik: 1,
    refPrefix: 'FSA', deviceCode: '', firm: '', retentionYears: 7
  };
}
function sortedGrades(cfg) { return cfg.grades.slice().sort((a, b) => a.min - b.min); }
function gradeStyle(cfg, name) {
  const gs = sortedGrades(cfg), i = gs.findIndex(g => g.name === name), n = gs.length;
  if (i < 0) return { color: '#333', bg: '#eee' };
  return GRADE_PALETTE[n <= 1 ? 0 : Math.round(i * 3 / (n - 1))];
}
function effSev(item, r) { return (r && r.sev) || item.sev || null; }
/* Risk: Severity x Likelihood for every applicable (non-N/A) item, whatever its compliance status. */
function itemRisk(item, r, cfg) {
  if (!r || !r.st || r.st === 'NA') return null;
  const s = effSev(item, r), l = r.lik;
  if (!s || !l) return null;
  const score = s * l, gs = sortedGrades(cfg);
  let gi = 0; gs.forEach((g, i) => { if (score >= g.min) gi = i; });
  if (cfg.overrideSev5 && r.st === 'NC' && s === 5 && gs.length >= 2) gi = Math.max(gi, gs.length - 2);
  const finding = r.st === 'NC' || r.st === 'PC';
  return { score, sev: s, lik: l, grade: gs[gi].name, gi, top: gi >= gs.length - 2, finding, timeline: finding ? gs[gi].timeline : '', action: finding ? gs[gi].action : '' };
}
function itemWeight(item, r, cfg) {
  if (cfg.weightBasis === 'equal') return 1;
  if (cfg.weightBasis === 'severity') return effSev(item, r) || 1;
  return item.weight || item.sev || 1;
}
function rateScore(score, cfg) {
  if (score == null) return 'Not assessed';
  const bands = cfg.ratings.slice().sort((a, b) => b.min - a.min);
  for (const b of bands) if (score >= b.min - 1e-9) return b.name;
  return bands.length ? bands[bands.length - 1].name : '';
}
function ratingStyle(cfg, name) {
  const bands = cfg.ratings.slice().sort((a, b) => a.min - b.min), i = bands.findIndex(b => b.name === name), n = bands.length;
  if (i < 0) return { color: '#333', bg: '#e6e8eb' };
  return GRADE_PALETTE[3 - (n <= 1 ? 3 : Math.round(i * 3 / (n - 1)))];
}
/* Compliance: sum(credit x weight) / sum(weight) over items marked C, PC or NC. N/A and NV are outside the denominator. */
function computeAudit(audit, tpl) {
  const cfg = audit.cfg, gs = sortedGrades(cfg);
  const blankG = () => { const o = {}; gs.forEach(g => o[g.name] = 0); return o; };
  const mk = () => ({ items: 0, counts: { C: 0, PC: 0, NC: 0, NA: 0, NV: 0, none: 0 }, num: 0, den: 0, score: null, find: blankG(), all: blankG(), mandNC: 0 });
  const tot = mk(), secs = {}, per = {};
  tpl.sections.forEach(s => { secs[s.id] = Object.assign(mk(), { id: s.id, name: s.name }); });
  const mFind = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]), mAll = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]);
  const miss = { status: [], naJust: [], risk: [] };
  let compliantTop = 0, riskAssessed = 0;
  for (const it of tpl.items) {
    const r = audit.resp[it.id] || {}, sec = secs[it.sec] || (secs[it.sec] = Object.assign(mk(), { id: it.sec, name: it.sec }));
    const st = r.st || 'none', risk = itemRisk(it, r, cfg), w = itemWeight(it, r, cfg);
    let credit = null;
    for (const a of [tot, sec]) {
      a.items++; a.counts[st]++;
      if (st === 'C' || st === 'PC' || st === 'NC') { a.num += cfg.credits[st] * w; a.den += w; }
      if (risk) { a.all[risk.grade]++; if (risk.finding) a.find[risk.grade]++; }
      if (st === 'NC' && /^Mandatory/i.test(it.type || '')) a.mandNC++;
    }
    if (st === 'C' || st === 'PC' || st === 'NC') credit = cfg.credits[st];
    if (risk) { riskAssessed++; mAll[risk.sev - 1][risk.lik - 1]++; if (risk.finding) mFind[risk.sev - 1][risk.lik - 1]++; if (r.st === 'C' && risk.top) compliantTop++; }
    if (st === 'none') miss.status.push(it.id);
    if (st === 'NA' && !(r.naJust || '').trim()) miss.naJust.push(it.id);
    if ((st === 'C' || st === 'PC' || st === 'NC') && !risk) miss.risk.push(it.id);
    per[it.id] = { st: r.st || '', risk, weight: w, credit, weighted: credit == null ? null : credit * w };
  }
  const fin = a => { a.score = a.den > 0 ? a.num / a.den * 100 : null; a.answered = a.items - a.counts.none; a.applicable = a.items - a.counts.NA; };
  fin(tot); Object.values(secs).forEach(fin);
  const sections = tpl.sections.map(s => secs[s.id]);
  Object.values(secs).forEach(s => { if (!sections.includes(s)) sections.push(s); });
  return {
    total: tot.items, counts: tot.counts, applicable: tot.applicable, answered: tot.answered,
    completion: tot.items ? tot.answered / tot.items * 100 : 0,
    score: tot.score, rating: rateScore(tot.score, cfg), find: tot.find, all: tot.all, mandNC: tot.mandNC,
    sections, per, mFind, mAll, miss, compliantTop, riskAssessed, grades: gs.map(g => g.name)
  };
}
/* findings (NC / PC) sorted by risk, highest first */
function findingsOf(audit, tpl, comp) {
  return tpl.items.filter(it => { const s = (audit.resp[it.id] || {}).st; return s === 'NC' || s === 'PC'; })
    .map(it => ({ it, r: audit.resp[it.id], risk: comp.per[it.id].risk }))
    .sort((a, b) => ((b.risk ? b.risk.gi * 100 + b.risk.score : -1) - (a.risk ? a.risk.gi * 100 + a.risk.score : -1)));
}
function closureStats(audit, tpl, comp) {
  const f = findingsOf(audit, tpl, comp), o = { total: f.length, open: 0, progress: 0, done: 0, verified: 0, overdue: 0 };
  const today = todayISO();
  f.forEach(x => { const c = (x.r.clo && x.r.clo.status) || 'open'; o[c]++; if (c !== 'verified' && x.r.target && x.r.target < today) o.overdue++; });
  return o;
}
