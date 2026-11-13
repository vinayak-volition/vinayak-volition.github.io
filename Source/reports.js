/* ---------- report builders (Word + Excel, audit + closure) ---------- */
const hx = c => c.replace('#', '').toUpperCase();
function gradeForScore(cfg, score) { const gs = sortedGrades(cfg); let g = gs[0]; gs.forEach(x => { if (score >= x.min) g = x; }); return g.name; }
function reportCtx(audit, tpl, photos) {
  const comp = computeAudit(audit, tpl), byQ = {}, cloQ = {};
  photos.slice().sort((a, b) => (a.at || '').localeCompare(b.at || '')).forEach(p => {
    const m = p.kind === 'closure' ? cloQ : byQ, arr = m[p.qid] || (m[p.qid] = []);
    arr.push(Object.assign({}, p, { ref: p.qid + (p.kind === 'closure' ? '-C' : '-P') + (arr.length + 1) }));
  });
  const final = ['submitted', 'approved', 'closed'].includes(audit.status);
  return { audit, tpl, comp, cfg: audit.cfg, byQ, cloQ, findings: findingsOf(audit, tpl, comp), final, clo: closureStats(audit, tpl, comp),
    statusText: final ? AUDIT_STATUS[audit.status] : 'DRAFT - audit not yet submitted' };
}
function auditDates(a) { return fmtDate(a.dateFrom) + (a.dateTo && a.dateTo !== a.dateFrom ? ' to ' + fmtDate(a.dateTo) : ''); }
function auditDetailRows(c) {
  const a = c.audit;
  return [['Audit reference', a.ref], ['Organisation', a.org], ['Facility / plant / site', a.site], ['Location', a.location], ['Audit type', a.type],
    ['Audit date(s)', auditDates(a)], ['Lead auditor', a.lead],
    ['Audit team', (a.team || []).concat(a.teamOther ? [a.teamOther] : []).join(', ')], ['Checklist', c.tpl.name + ' (' + c.tpl.version + '), ' + c.tpl.items.length + ' audit points'],
    ['Audit status', c.statusText + (a.submittedAt ? '; submitted ' + fmtDate(a.submittedAt) + ' by ' + a.submittedBy : '') + (a.approvedAt ? '; approved ' + fmtDate(a.approvedAt) + ' by ' + a.approvedBy : '')]];
}
function methodText(cfg) {
  const wb = { question: 'the weight assigned to each question in the checklist (set from its default severity)', severity: 'the severity assessed by the auditor for each question', equal: 'an equal weight of 1 for every question' }[cfg.weightBasis];
  return `Compliance score = sum of (status credit x question weight) divided by the sum of question weights, over the questions marked Compliant, Partially compliant or Non-compliant. Credits: Compliant ${cfg.credits.C}, Partially compliant ${cfg.credits.PC}, Non-compliant ${cfg.credits.NC}. The question weight is ${wb}. Not applicable and Not verified questions are outside the calculation.`;
}
function execText(c) {
  const k = c.comp, n = k.counts, f = c.findings.length, gs = k.grades.slice().reverse();
  let t = `The audit covered ${k.total} checklist requirements in ${c.tpl.sections.length} sections of the ${c.tpl.name} (${c.tpl.version}). ${n.NA} were not applicable to the premises, ${n.NV} could not be verified and ${n.none} were not assessed. Of the ${n.C + n.PC + n.NC} requirements scored, ${n.C} were compliant, ${n.PC} partially compliant and ${n.NC} non-compliant`;
  t += k.score == null ? '.' : `, giving a weighted compliance score of ${pct(k.score)} and an overall rating of "${k.rating}".`;
  let r = `Risk was assessed separately from compliance, as Severity x Likelihood, for every applicable requirement. The ${f} findings (non-compliant or partially compliant) are graded: ` + gs.map(g => `${g} ${k.find[g]}`).join(', ') + '.';
  if (k.compliantTop) r += ` In addition, ${k.compliantTop} requirement(s) found compliant still carry a ${gs[1] || ''} or ${gs[0]} risk rating; these depend on controls that must be kept in place.`;
  return [t, r];
}
function photoGridXml(d, list, CW) {
  const rows = [], half = Math.floor(CW / 2);
  for (let i = 0; i < list.length; i += 2) {
    rows.push([0, 1].map(j => {
      const p = list[i + j]; if (!p) return { t: '' };
      const sc = Math.min(290 / p.w, 230 / p.h, 1), w = Math.max(1, Math.round(p.w * sc)), h = Math.max(1, Math.round(p.h * sc));
      return { xml: DX.p(d.image(p.data, w, h), { after: 40, align: 'center' }) + DX.p([DX.run(p.ref + (p.caption ? ': ' : ''), { b: 1, sz: 8 }), DX.run(p.caption || '', { sz: 8 })], { after: 60, align: 'center' }) };
    }));
  }
  return DX.table(rows, { widths: [half, CW - half], noBorder: 1 });
}
function kv(d, rows, CW, w1) { w1 = w1 || 2700; d.add(DX.table(rows.map(r => [{ t: r[0], b: 1, fill: 'EEF2F8' }, { t: r[1] == null || r[1] === '' ? '–' : r[1] }]), { widths: [w1, CW - w1] })); }
function coverXml(d, c, title, CW) {
  const a = c.audit;
  d.add(DX.p('', { before: 1400 }));
  if (c.cfg.firm) d.add(DX.p(DX.run(c.cfg.firm, { sz: 13, b: 1, color: '2F5597' }), { align: 'center' }));
  d.add(DX.p(DX.run(title), { style: 'Title', align: 'center' }));
  d.add(DX.p(DX.run(c.tpl.name, { sz: 12, color: '444B55' }), { align: 'center', after: 400 }));
  d.add(DX.p(DX.run(a.site || '', { sz: 16, b: 1 }), { align: 'center', after: 60 }));
  d.add(DX.p(DX.run([a.org, a.location].filter(Boolean).join(' | '), { sz: 11 }), { align: 'center', after: 500 }));
  kv(d, [['Audit reference', a.ref], ['Audit date(s)', auditDates(a)], ['Lead auditor', a.lead], ['Audit status', c.statusText], ['Report generated', fmtDT(new Date().toISOString())]], CW, 3000);
}
function buildAuditDocx(c, opt) {
  opt = opt || {}; const { audit: a, tpl, comp: k, cfg } = c, d = new Docx(), CW = 9864, gsDesc = k.grades.slice().reverse();
  const stCell = s => s ? { t: s, fill: hx(ST[s].bg), color: hx(ST[s].color), b: 1, align: 'center' } : { t: '–', align: 'center' };
  const gCell = (risk, withScore) => { if (!risk) return { t: '–', align: 'center' }; const g = gradeStyle(cfg, risk.grade); return { t: (withScore ? risk.score + ' ' : '') + risk.grade, fill: hx(g.bg), color: hx(g.color), b: 1, align: 'center' }; };
  coverXml(d, c, 'Safety Audit Report', CW);
  if (k.score != null) { const rs = ratingStyle(cfg, k.rating); d.add(DX.p('', { before: 300 })); d.add(DX.table([[{ t: 'Overall compliance score', b: 1, fill: 'EEF2F8', sz: 11 }, { t: pct(k.score), b: 1, sz: 14, align: 'center' }, { t: 'Overall rating', b: 1, fill: 'EEF2F8', sz: 11 }, { t: k.rating, b: 1, sz: 13, align: 'center', fill: hx(rs.bg), color: hx(rs.color) }]], { widths: [3000, 1932, 2000, 2932] })); }
  // 1
  d.add(DX.h('1. Audit details and scope', 1, { pb: 1 })); d.add(DX.h('1.1 Audit details', 2)); kv(d, auditDetailRows(c), CW);
  d.add(DX.h('1.2 Scope and boundaries', 2)); d.add(DX.p(a.scope || 'Not recorded.'));
  d.add(DX.h('1.3 Building profile', 2));
  d.add(DX.table([['Item', 'Entry', 'Relevance to the audit']].concat(tpl.profile.map(p => [{ t: p.label, b: 1 }, (a.profile || {})[p.label] || '–', { t: p.why || '', sz: 8, color: '5F6670' }])), { widths: [3000, 3564, 3300], head: 1 }));
  // 2
  d.add(DX.h('2. Executive summary', 1)); execText(c).forEach(t => d.add(DX.p(t)));
  if (a.summaryNote) d.add(DX.p(a.summaryNote));
  const n = k.counts;
  d.add(DX.table([['Total questions', 'Applicable', 'Not applicable', 'Compliant', 'Partially compliant', 'Non-compliant', 'Not verified', 'Not assessed'],
    [k.total, k.applicable, n.NA, n.C, n.PC, n.NC, n.NV, n.none].map(v => ({ t: v, align: 'center', b: 1, sz: 11 }))], { widths: [1233, 1233, 1233, 1233, 1233, 1233, 1233, 1233], head: 1, sz: 8 }));
  const topF = c.findings.filter(f => f.risk && f.risk.top).slice(0, 10);
  if (topF.length) {
    d.add(DX.h('Priority findings', 3));
    d.add(DX.table([['Ref', 'Finding', 'Risk', 'Action timeline']].concat(topF.map(f => [f.it.id, (f.r.obs || f.it.req), gCell(f.risk, 1), f.risk.timeline])), { widths: [900, 5564, 1400, 2000], head: 1 }));
  }
  // 3
  d.add(DX.h('3. Overall compliance score and rating', 1));
  d.add(DX.p([DX.run('Overall compliance score: ', { b: 1 }), DX.run(pct(k.score) + '     '), DX.run('Overall rating: ', { b: 1 }), DX.run(k.rating)]));
  d.add(DX.p(methodText(cfg)));
  d.add(DX.p('The overall rating is set by the compliance score alone. The risk profile in Section 5 is a separate measure and does not change the rating.'));
  const bands = cfg.ratings.slice().sort((x, y) => y.min - x.min);
  d.add(DX.table([['Overall rating', 'Compliance score', 'This audit']].concat(bands.map((b, i) => { const cur = b.name === k.rating && k.score != null, rs = ratingStyle(cfg, b.name); return [{ t: b.name, b: 1, fill: hx(rs.bg), color: hx(rs.color) }, i === 0 ? b.min + '% and above' : b.min + '% to below ' + bands[i - 1].min + '%', { t: cur ? pct(k.score) : '', b: 1, align: 'center' }]; })), { widths: [3300, 3564, 3000], head: 1 }));
  // 4
  d.add(DX.h(tpl.client ? '4. Compliance by client KPI group' : '4. Section-wise compliance analysis', 1));
  const bold = x => (x != null && typeof x === 'object') ? x : { t: x, b: 1, fill: 'EEF2F8' };
  d.add(DX.table([['Sec', 'Section', 'Items', 'C', 'PC', 'NC', 'NA', 'NV', 'Not assessed', 'Compliance %', gsDesc[0] || '', gsDesc[1] || '']].concat(
    k.sections.map(s => [s.id, s.name, s.items, s.counts.C, s.counts.PC, s.counts.NC, s.counts.NA, s.counts.NV, s.counts.none, { t: pct(s.score), b: 1, align: 'right' }, s.find[gsDesc[0]] || 0, s.find[gsDesc[1]] || 0]),
    [[{ t: 'Overall', span: 2, b: 1, fill: 'EEF2F8' }, k.total, n.C, n.PC, n.NC, n.NA, n.NV, n.none, { t: pct(k.score), b: 1, align: 'right', fill: 'EEF2F8' }, k.find[gsDesc[0]] || 0, k.find[gsDesc[1]] || 0].map(bold)]),
    { widths: [520, 3144, 600, 520, 520, 520, 520, 520, 800, 1000, 700, 700], head: 1, sz: 8 }));
  d.add(DX.p(DX.run('C = Compliant, PC = Partially compliant, NC = Non-compliant, NA = Not applicable, NV = Not verified. The last two columns count findings (NC or PC) by risk grade.', { sz: 8, color: '5F6670' })));
  { const ga = groupStats(a, tpl, k, 'area'); d.add(DX.h('Compliance by site area', 3));
    d.add(DX.table([['Site area', 'Questions', 'Out of scope', 'C', 'PC', 'NC', 'NV', 'Compliance %']].concat(ga.map(g => [g.name, g.items, g.scoped, g.counts.C, g.counts.PC, g.counts.NC, g.counts.NV, { t: pct(g.score), b: 1, align: 'right' }])), { widths: [3864, 900, 1000, 700, 700, 700, 700, 1300], head: 1, sz: 8 })); }
  { const sc = scopedCount(a, tpl); if (a.facts) { d.add(DX.h('Scoping from the building profile', 3)); d.add(DX.p(sc + ' of ' + tpl.items.length + ' requirements were set out of scope from the building facts below, each with its reason recorded in Section 8. Facts answered "unknown" kept the requirement in the audit.'));
    d.add(DX.table([['Building fact', 'Answer']].concat(FACTS.flatMap(g => g[1]).filter(f => a.facts[f[0]] !== undefined && a.facts[f[0]] !== '').map(f => [f[1], { Y: 'Yes', N: 'No' }[a.facts[f[0]]] || String(a.facts[f[0]])])), { widths: [6864, 3000], head: 1, sz: 8 })); } }
  // 5
  d.add(DX.h('5. Risk profile (severity and likelihood)', 1));
  d.add(DX.p('Risk score = Severity (1 to 5) x Likelihood (1 to 5), recorded for every applicable requirement independently of its compliance status. A requirement can therefore be compliant and still carry a high risk rating (the consequence of failure is severe and the control must be maintained), or non-compliant with a low one. Action timelines apply to findings only.' + (cfg.overrideSev5 ? ' A non-compliant requirement with Severity 5 is graded at least ' + (gsDesc[1] || gsDesc[0]) + ', whatever its likelihood.' : '')));
  const gsObj = sortedGrades(cfg).reverse();
  d.add(DX.table([['Risk grade', 'Score', 'Findings (NC / PC)', 'All applicable items', 'Action required for findings', 'Timeline']].concat(gsObj.map((g, i) => { const s = gradeStyle(cfg, g.name); return [{ t: g.name, b: 1, fill: hx(s.bg), color: hx(s.color) }, g.min + (i === 0 ? ' to 25' : ' to ' + (gsObj[i - 1].min - 1)), { t: k.find[g.name], align: 'center', b: 1 }, { t: k.all[g.name], align: 'center' }, { t: g.action, sz: 8 }, g.timeline]; })), { widths: [1100, 900, 1200, 1200, 3664, 1800], head: 1 }));
  d.add(DX.h('Risk matrix: number of findings (all applicable items in brackets)', 3));
  const mrows = [[{ t: 'Severity / Likelihood' }].concat(cfg.lik.map(l => ({ t: l.n + ' ' + l.name, align: 'center' })))];
  for (let s = 5; s >= 1; s--) mrows.push([{ t: s + ' ' + cfg.sev[s - 1].name, b: 1, fill: 'EEF2F8' }].concat([1, 2, 3, 4, 5].map(l => { const g = gradeStyle(cfg, gradeForScore(cfg, s * l)); return { t: k.mFind[s - 1][l - 1] + ' (' + k.mAll[s - 1][l - 1] + ')', fill: hx(g.bg), color: hx(g.color), align: 'center', b: 1 }; })));
  d.add(DX.table(mrows, { widths: [2364, 1500, 1500, 1500, 1500, 1500], head: 1 }));
  // 6
  d.add(DX.h('6. Findings, recommendations and corrective actions', 1, { pb: 1 }));
  if (!c.findings.length) d.add(DX.p('No non-compliant or partially compliant requirements were recorded.'));
  c.findings.forEach((f, i) => {
    const r = f.r, it = f.it, risk = f.risk;
    d.add(DX.table([
      [{ t: 'Finding ' + (i + 1) + '   |   ' + it.id, b: 1, fill: '2F5597', color: 'FFFFFF', span: 2 }, stCell(r.st), gCell(risk, 1)],
      [{ t: 'Requirement', b: 1, fill: 'EEF2F8' }, { t: it.req, span: 3 }],
      [{ t: 'Reference', b: 1, fill: 'EEF2F8' }, { t: (it.ref || '') + (it.type ? '   |   ' + it.type : ''), span: 3 }],
      [{ t: 'Observation', b: 1, fill: 'EEF2F8' }, { t: (valsText(it, r) ? 'Readings: ' + valsText(it, r) + (it.meas.bench ? ' (benchmark: ' + it.meas.bench + ')' : '') + '\n' : '') + (r.obs || '–'), span: 3 }],
      [{ t: 'Risk assessment', b: 1, fill: 'EEF2F8' }, { t: risk ? `Severity ${risk.sev} (${cfg.sev[risk.sev - 1].name}) x Likelihood ${risk.lik} (${cfg.lik[risk.lik - 1].name}) = ${risk.score}, ${risk.grade}. ${risk.timeline}.` : 'Not rated', span: 3 }],
      [{ t: 'Recommended corrective action', b: 1, fill: 'EEF2F8' }, { t: r.rec || '–', span: 3 }],
      [{ t: 'Responsible / target date', b: 1, fill: 'EEF2F8' }, { t: (r.respb || '–') + '   /   ' + (fmtDate(r.target) || '–'), span: 3 }]
    ], { widths: [2300, 4564, 1500, 1500] }));
    const ph = c.byQ[it.id]; if (ph && opt.photos !== false) d.add(photoGridXml(d, ph, CW));
  });
  // 7
  d.add(DX.h('7. Question-wise assessment results', 1, { pb: 1 }));
  { const ms = tpl.items.filter(it => it.meas && (a.resp[it.id] || {}).vals && valsText(it, a.resp[it.id]));
    if (ms.length) { d.add(DX.h('Measured parameters', 2)); d.add(DX.table([['Ref', 'Parameter', 'Readings', 'Benchmark', 'Result']].concat(ms.map(it => { const r = a.resp[it.id]; return [{ t: it.id, b: 1 }, { t: it.req, sz: 8 }, { t: valsText(it, r), sz: 8 }, { t: it.meas.bench || '', sz: 7, color: '5F6670' }, r.st ? stCell(r.st) : '–']; })), { widths: [800, 2900, 2600, 2764, 800], head: 1, sz: 8 })); } }
  d.add(DX.p(DX.run('S = Severity, L = Likelihood. Rows shaded grey are Not applicable; their justification is in Section 8.', { sz: 8, color: '5F6670' })));
  tpl.sections.forEach(s => {
    d.add(DX.h((tpl.client ? s.id + ': ' : 'Section ' + s.id + ': ') + s.name, 3));
    const rows = [['Ref', 'Requirement and reference', 'Status', 'S', 'L', 'Risk', 'Observation']];
    tpl.items.filter(it => it.sec === s.id).forEach(it => {
      const r = a.resp[it.id] || {}, risk = k.per[it.id].risk, na = r.st === 'NA', F = na ? 'E6E8EB' : '';
      const reqXml = DX.p(DX.run(it.req, { sz: 8 }), { after: 20 }) + DX.p(DX.run(it.ref || '', { sz: 7, color: '5F6670' }), { after: 0 });
      rows.push([{ t: it.id, b: 1, sz: 8, fill: F }, { xml: reqXml, fill: F }, r.st ? stCell(r.st) : { t: 'Not assessed', sz: 7, align: 'center' },
        { t: na || !r.st ? '' : (effSev(it, r) || ''), align: 'center', fill: F }, { t: na ? '' : (r.lik || ''), align: 'center', fill: F }, na ? { t: '', fill: F } : gCell(risk, 1),
        { t: (na ? 'N/A: ' + (r.naJust || '') : (valsText(it, r) ? 'Readings: ' + valsText(it, r) + '\n' : '') + (r.obs || '')) + ((c.byQ[it.id] || []).length ? '\n[Photos: ' + c.byQ[it.id].map(p => p.ref).join(', ') + ']' : ''), sz: 8, fill: F }]);
    });
    d.add(DX.table(rows, { widths: [700, 3864, 700, 400, 400, 1000, 2800], head: 1, sz: 8 }));
  });
  // 8, 9
  const na = tpl.items.filter(it => (a.resp[it.id] || {}).st === 'NA'), nv = tpl.items.filter(it => (a.resp[it.id] || {}).st === 'NV');
  d.add(DX.h('8. Requirements not applicable', 1, { pb: 1 }));
  d.add(DX.p(`${na.length} requirement(s) were classified Not applicable. They are excluded from the compliance score and carry no risk rating. Not applicable does not mean compliant.`));
  if (na.length) d.add(DX.table([['Ref', 'Requirement', 'Justification', 'Recorded by']].concat(na.map(it => { const r = a.resp[it.id]; return [{ t: it.id, b: 1, fill: 'E6E8EB' }, { t: it.req, fill: 'E6E8EB', sz: 8 }, { t: r.naJust || '–', fill: 'E6E8EB' }, { t: (r.by || '') + (r.at ? '\n' + fmtDT(r.at) : ''), sz: 8, fill: 'E6E8EB' }]; })), { widths: [800, 4000, 3464, 1600], head: 1 }));
  d.add(DX.h('9. Requirements not verified (audit limitations)', 1));
  d.add(DX.p(`${nv.length} requirement(s) could not be verified. They are excluded from the compliance score and are not counted as compliant.`));
  if (nv.length) d.add(DX.table([['Ref', 'Requirement', 'Reason / observation']].concat(nv.map(it => [{ t: it.id, b: 1 }, { t: it.req, sz: 8 }, (a.resp[it.id].obs || '–')])), { widths: [800, 4800, 4264], head: 1 }));
  // 10
  const other = tpl.items.filter(it => c.byQ[it.id] && !['NC', 'PC'].includes((a.resp[it.id] || {}).st));
  const hasOther = other.length && opt.photos !== false;
  if (hasOther) {
    d.add(DX.h('10. Other photographic evidence', 1, { pb: 1 }));
    other.forEach(it => { d.add(DX.p([DX.run(it.id + '  ', { b: 1 }), DX.run(it.req, { sz: 9 }), DX.run('   [' + (ST[(a.resp[it.id] || {}).st] || { label: 'Not assessed' }).label + ']', { sz: 9, color: '5F6670' })], { keep: 1, after: 60 })); d.add(photoGridXml(d, c.byQ[it.id], CW)); });
  }
  // conclusion
  d.add(DX.h((hasOther ? '11' : '10') + '. Conclusion', 1));
  d.add(DX.p(k.score == null ? 'No requirement has been scored yet.' : `On the basis of the requirements assessed, the premises achieved a compliance score of ${pct(k.score)} and are rated "${k.rating}". ${c.findings.length} finding(s) require corrective action within the timelines given in Section 6` + (gsDesc.length ? `, of which ${k.find[gsDesc[0]]} are ${gsDesc[0]}${gsDesc[1] ? ' and ' + k.find[gsDesc[1]] + ' ' + gsDesc[1] : ''}.` : '.')));
  if (a.conclusion) d.add(DX.p(a.conclusion));
  d.add(DX.p(DX.run('This report reflects conditions observed on the audit date(s) and the records made available. The risk grading and compliance scoring follow the audit methodology in Annex A; they are not prescribed by NBC 2016.', { sz: 8, color: '5F6670' })));
  d.add(DX.table([[{ t: 'Prepared by', b: 1, fill: 'EEF2F8' }, { t: 'Reviewed / approved by', b: 1, fill: 'EEF2F8' }], [{ t: (a.lead || '') + '\nLead auditor\n\nSignature: ____________________' }, { t: (a.approvedBy || '') + (a.approvedAt ? '\nApproved ' + fmtDate(a.approvedAt) : '\n') + '\n\nSignature: ____________________' }]], { widths: [4932, 4932] }));
  // annex
  d.add(DX.h('Annex A: Risk grading and scoring methodology', 1, { pb: 1 }));
  d.add(DX.table([['Severity', 'Descriptor', 'Meaning']].concat(cfg.sev.map(s => [s.n, s.name, s.desc])), { widths: [900, 1700, 7264], head: 1 }));
  d.add(DX.table([['Likelihood', 'Descriptor', 'Meaning']].concat(cfg.lik.map(s => [s.n, s.name, s.desc])), { widths: [900, 1700, 7264], head: 1 }));
  d.add(DX.p(methodText(cfg)));
  return d.build({ header: a.ref + ' | ' + (a.site || '') + (c.final ? '' : ' | DRAFT'), footer: 'Safety Audit Report' });
}

function xlsxStyles(b) {
  const S = { n: b.style({}), b: b.style({ b: 1 }), h: b.style({ b: 1, color: 'FFFFFF', fill: '2F5597', h: 'center', v: 'center' }), t: b.style({ b: 1, sz: 14, color: '1F3864', border: 0, wrap: 0 }),
    sub: b.style({ i: 1, color: '5F6670', border: 0, wrap: 0 }), lab: b.style({ b: 1, fill: 'EEF2F8' }), c: b.style({ h: 'center' }), cb: b.style({ h: 'center', b: 1 }), p: b.style({ fmt: '0.0%', h: 'right', b: 1 }),
    na: b.style({ fill: 'E6E8EB' }), nac: b.style({ fill: 'E6E8EB', h: 'center' }), st: {}, g: {} };
  ST_KEYS.forEach(k => S.st[k] = b.style({ b: 1, h: 'center', fill: hx(ST[k].bg), color: hx(ST[k].color) }));
  return S;
}
function gSty(b, S, cfg, name) { if (!name) return S.c; if (!S.g[name]) { const g = gradeStyle(cfg, name); S.g[name] = b.style({ b: 1, h: 'center', fill: hx(g.bg), color: hx(g.color) }); } return S.g[name]; }
function summarySheet(b, S, c, title) {
  const k = c.comp, n = k.counts, cfg = c.cfg, gsDesc = k.grades.slice().reverse(), rows = [];
  rows.push([{ v: title, s: S.t }]); rows.push([{ v: c.tpl.name + ' (' + c.tpl.version + ')  |  ' + c.statusText + '  |  generated ' + fmtDT(new Date().toISOString()), s: S.sub }]); rows.push([]);
  auditDetailRows(c).forEach(r => rows.push([{ v: r[0], s: S.lab }, { v: r[1] || '', s: S.n }]));
  rows.push([{ v: 'Scope and boundaries', s: S.lab }, { v: c.audit.scope || '', s: S.n }]); rows.push([]);
  rows.push([{ v: 'Overall compliance score', s: S.lab }, { v: k.score == null ? '' : k.score / 100, s: S.p }]);
  rows.push([{ v: 'Overall rating', s: S.lab }, { v: k.rating, s: S.b }]);
  rows.push([{ v: 'Audit completion', s: S.lab }, { v: k.completion / 100, s: S.p }]);
  [['Total questions', k.total], ['Applicable questions', k.applicable], ['Not applicable', n.NA], ['Compliant', n.C], ['Partially compliant', n.PC], ['Non-compliant', n.NC], ['Not verified', n.NV], ['Not assessed', n.none], ['Mandatory requirements non-compliant', k.mandNC], ['Compliant items with ' + (gsDesc[1] || '') + ' / ' + gsDesc[0] + ' risk rating', k.compliantTop]].forEach(r => rows.push([{ v: r[0], s: S.lab }, { v: r[1], s: S.n }]));
  rows.push([]); rows.push([{ v: 'Risk profile', s: S.h }, { v: 'Findings (NC / PC)', s: S.h }, { v: 'All applicable items', s: S.h }, { v: 'Timeline for findings', s: S.h }]);
  sortedGrades(cfg).reverse().forEach(g => rows.push([{ v: g.name, s: gSty(b, S, cfg, g.name) }, { v: k.find[g.name], s: S.c }, { v: k.all[g.name], s: S.c }, { v: g.timeline, s: S.n }]));
  rows.push([]);
  rows.push(['Sec', 'Section', 'Items', 'C', 'PC', 'NC', 'NA', 'NV', 'Not assessed', 'Compliance %'].concat(gsDesc, ['Mandatory NC']).map(v => ({ v, s: S.h })));
  k.sections.forEach(s => rows.push([{ v: s.id, s: S.cb }, { v: s.name, s: S.n }].concat([s.items, s.counts.C, s.counts.PC, s.counts.NC, s.counts.NA, s.counts.NV, s.counts.none].map(v => ({ v, s: S.c })), [{ v: s.score == null ? '' : s.score / 100, s: S.p }], gsDesc.map(g => ({ v: s.find[g], s: S.c })), [{ v: s.mandNC, s: S.c }])));
  rows.push([{ v: '', s: S.lab }, { v: 'Overall', s: S.lab }].concat([k.total, n.C, n.PC, n.NC, n.NA, n.NV, n.none].map(v => ({ v, s: S.cb })), [{ v: k.score == null ? '' : k.score / 100, s: S.p }], gsDesc.map(g => ({ v: k.find[g], s: S.cb })), [{ v: k.mandNC, s: S.cb }]));
  rows.push([]); rows.push([{ v: methodText(cfg), s: S.sub }]);
  rows.push([{ v: 'Section table: grade columns count findings (NC / PC). Overall rating is set by the compliance score alone; the risk profile is a separate measure.', s: S.sub }]);
  b.addSheet({ name: 'Summary', cols: [34, 52, 12, 22, 8, 8, 8, 8, 13, 14, 10, 10, 10, 10, 14], rows });
}
function buildAuditXlsx(c, opt) {
  opt = opt || {}; const { audit: a, tpl, comp: k, cfg } = c, b = new XlsxBook(), S = xlsxStyles(b);
  summarySheet(b, S, c, 'Safety Audit Report - ' + (a.site || a.ref));
  const secName = {}; tpl.sections.forEach(s => secName[s.id] = s.name);
  const H = ['Ref', 'Section', 'Audit point (requirement)', 'Standard reference', 'Requirement type', 'Applicability', 'Method', 'Status', 'Observation / evidence', 'N/A justification', 'Severity', 'Likelihood', 'Risk score', 'Risk grade', 'Action timeline', 'Question weight', 'Status credit', 'Weighted score', 'Recommended corrective action', 'Responsible', 'Target date', 'Photo references', 'Assessed by', 'Assessed on', 'Site area', 'Library ref', 'Client KPI', 'Readings', 'Benchmark', 'Likelihood source', 'Scoped out'];
  const line = (it, r, p) => { const na = r.st === 'NA', N = na ? S.na : S.n, C = na ? S.nac : S.c, risk = p.risk;
    return [{ v: it.id, s: na ? S.na : S.b }, { v: it.sec + ': ' + (secName[it.sec] || ''), s: N }, { v: it.req, s: N }, { v: it.ref, s: N }, { v: it.type, s: N }, { v: it.app, s: N }, { v: it.method, s: C },
      { v: r.st || 'Not assessed', s: r.st ? S.st[r.st] : S.c }, { v: r.obs || '', s: N }, { v: na ? (r.naJust || '') : '', s: N }, { v: na || !r.st ? '' : (effSev(it, r) || ''), s: C }, { v: na ? '' : (r.lik || ''), s: C },
      { v: risk ? risk.score : '', s: C }, { v: risk ? risk.grade : '', s: risk ? gSty(b, S, cfg, risk.grade) : C }, { v: risk ? risk.timeline : '', s: N }, { v: p.credit == null ? '' : p.weight, s: C }, { v: p.credit == null ? '' : p.credit, s: C }, { v: p.weighted == null ? '' : p.weighted, s: C },
      { v: r.rec || '', s: N }, { v: r.respb || '', s: N }, { v: fmtDate(r.target), s: N }, { v: (c.byQ[it.id] || []).map(x => x.ref).join('; '), s: N }, { v: r.by || '', s: N }, { v: fmtDT(r.at), s: N }, { v: AREA_NAME[areaOf(it)] || '', s: N }, { v: it.libRef || '', s: N }, { v: it.kpi || '', s: N }, { v: valsText(it, r), s: N }, { v: it.meas ? it.meas.bench || '' : '', s: N }, { v: r.lik ? (r.likAuto ? 'Default (quick answer)' : 'Auditor') : '', s: N }, { v: r.scoped ? 'Yes' : '', s: N }]; };
  const W = [9, 26, 50, 28, 16, 18, 9, 11, 44, 30, 9, 10, 9, 11, 18, 9, 9, 10, 44, 16, 13, 20, 16, 18, 28, 10, 40, 30, 40, 16, 9];
  const rows = [H.map(v => ({ v, s: S.h }))]; tpl.items.forEach(it => rows.push(line(it, a.resp[it.id] || {}, k.per[it.id])));
  b.addSheet({ name: 'Assessment', cols: W, rows, freeze: { row: 1, col: 1 }, filter: 'A1:' + colL(H.length - 1) + rows.length });
  const fr = [H.map(v => ({ v, s: S.h }))]; c.findings.forEach(f => fr.push(line(f.it, f.r, k.per[f.it.id])));
  b.addSheet({ name: 'Findings', cols: W, rows: fr, freeze: { row: 1, col: 1 }, filter: 'A1:' + colL(H.length - 1) + fr.length });
  const nar = [['Ref', 'Section', 'Audit point (requirement)', 'N/A justification', 'Recorded by', 'Recorded on'].map(v => ({ v, s: S.h }))];
  tpl.items.forEach(it => { const r = a.resp[it.id] || {}; if (r.st === 'NA') nar.push([it.id, it.sec + ': ' + (secName[it.sec] || ''), it.req, r.naJust || '', r.by || '', fmtDT(r.at)].map(v => ({ v, s: S.na }))); });
  b.addSheet({ name: 'Not applicable', cols: [9, 30, 60, 50, 18, 18], rows: nar, freeze: { row: 1 } });
  const nvr = [['Ref', 'Section', 'Audit point (requirement)', 'Reason / observation', 'Recorded by', 'Recorded on'].map(v => ({ v, s: S.h }))];
  tpl.items.forEach(it => { const r = a.resp[it.id] || {}; if (r.st === 'NV') nvr.push([it.id, it.sec + ': ' + (secName[it.sec] || ''), it.req, r.obs || '', r.by || '', fmtDT(r.at)].map(v => ({ v, s: S.n }))); });
  b.addSheet({ name: 'Not verified', cols: [9, 30, 60, 50, 18, 18], rows: nvr, freeze: { row: 1 } });
  { const ga = groupStats(a, tpl, k, 'area'); b.addSheet({ name: 'By site area', cols: [44, 11, 12, 8, 8, 8, 8, 8, 13], rows: [['Site area', 'Questions', 'Out of scope', 'C', 'PC', 'NC', 'NA', 'NV', 'Compliance %'].map(v => ({ v, s: S.h }))].concat(ga.map(g => [{ v: g.name, s: S.b }, { v: g.items, s: S.c }, { v: g.scoped, s: S.c }, { v: g.counts.C, s: S.c }, { v: g.counts.PC, s: S.c }, { v: g.counts.NC, s: S.c }, { v: g.counts.NA, s: S.c }, { v: g.counts.NV, s: S.c }, { v: g.score == null ? '' : g.score / 100, s: S.p }])) }); }
  { const ms = tpl.items.filter(it => it.meas); if (ms.length) { const mr = [['Ref', 'Parameter', 'Point / location', 'Reading', 'Unit', 'Compliant min', 'Compliant max', 'Partial min', 'Partial max', 'Point result', 'Question status', 'Benchmark'].map(v => ({ v, s: S.h }))];
    ms.forEach(it => { const r = a.resp[it.id] || {}, m = it.meas, vs = (r.vals || []).filter(x => x.v !== '' && x.v != null); (vs.length ? vs : [{ l: '', v: '' }]).forEach(x => { const ps = measOne(m, x.v); mr.push([{ v: it.id, s: S.b }, { v: it.req, s: S.n }, { v: x.l || '', s: S.n }, { v: x.v === '' ? '' : +x.v, s: S.c }, { v: m.unit || '', s: S.c }, { v: m.lo ?? '', s: S.c }, { v: m.hi ?? '', s: S.c }, { v: m.pcLo ?? '', s: S.c }, { v: m.pcHi ?? '', s: S.c }, { v: ps || '', s: ps ? S.st[ps] : S.c }, { v: r.st || '', s: r.st ? S.st[r.st] : S.c }, { v: m.bench || '', s: S.n }]); }); });
    b.addSheet({ name: 'Measurements', cols: [9, 44, 18, 10, 8, 10, 10, 10, 10, 10, 10, 50], rows: mr, freeze: { row: 1, col: 1 } }); } }
  { if (a.facts) b.addSheet({ name: 'Scoping', cols: [50, 14], rows: [['Building fact', 'Answer'].map(v => ({ v, s: S.h }))].concat(FACTS.flatMap(g => g[1]).map(f => [{ v: f[1], s: S.n }, { v: a.facts[f[0]] === undefined || a.facts[f[0]] === '' ? 'Unknown' : ({ Y: 'Yes', N: 'No' }[a.facts[f[0]]] || String(a.facts[f[0]])), s: S.c }])) }); }
  photoSheet(b, S, c, 'Photos', c.byQ, opt.photos !== false);
  b.addSheet({ name: 'Building profile', cols: [42, 50, 70], rows: [['Item', 'Entry', 'Why it matters'].map(v => ({ v, s: S.h }))].concat(tpl.profile.map(p => [{ v: p.label, s: S.lab }, { v: (a.profile || {})[p.label] || '', s: S.n }, { v: p.why || '', s: S.n }])) });
  const m = [[{ v: 'Risk grading and scoring methodology', s: S.t }], [], ['Severity', 'Descriptor', 'Meaning'].map(v => ({ v, s: S.h }))];
  cfg.sev.forEach(s => m.push([{ v: s.n, s: S.c }, { v: s.name, s: S.b }, { v: s.desc, s: S.n }])); m.push([]); m.push(['Likelihood', 'Descriptor', 'Meaning'].map(v => ({ v, s: S.h })));
  cfg.lik.forEach(s => m.push([{ v: s.n, s: S.c }, { v: s.name, s: S.b }, { v: s.desc, s: S.n }])); m.push([]); m.push(['Risk grade', 'Minimum score', 'Action required', 'Timeline'].map(v => ({ v, s: S.h })));
  sortedGrades(cfg).forEach(g => m.push([{ v: g.name, s: gSty(b, S, cfg, g.name) }, { v: g.min, s: S.c }, { v: g.action, s: S.n }, { v: g.timeline, s: S.n }])); m.push([]); m.push(['Overall rating', 'Minimum compliance %'].map(v => ({ v, s: S.h })));
  cfg.ratings.slice().sort((x, y) => y.min - x.min).forEach(r => m.push([{ v: r.name, s: S.b }, { v: r.min, s: S.c }])); m.push([]);
  m.push([{ v: 'Status credit', s: S.h }, { v: 'Credit', s: S.h }]); ['C', 'PC', 'NC'].forEach(s => m.push([{ v: ST[s].label, s: S.n }, { v: cfg.credits[s], s: S.c }])); m.push([]); m.push([{ v: methodText(cfg), s: S.sub }]);
  b.addSheet({ name: 'Methodology', cols: [18, 20, 90, 28], rows: m });
  b.addSheet({ name: 'Audit trail', cols: [20, 22, 22, 28, 90], rows: [['When', 'Who', 'Role', 'Action', 'Detail'].map(v => ({ v, s: S.h }))].concat((a.trail || []).map(t => [fmtDT(t.at), t.by, t.role, t.act, t.detail || ''].map(v => ({ v, s: S.n })))), freeze: { row: 1 } });
  return b.build();
}
function photoSheet(b, S, c, name, map, embed) {
  const rows = [['Photo ref', 'Question', 'Requirement', 'Caption', 'Taken by / on', 'Photograph'].map(v => ({ v, s: S.h }))], images = [];
  c.tpl.items.forEach(it => (map[it.id] || []).forEach(p => {
    const sc = Math.min(250 / p.w, 180 / p.h, 1), w = Math.round(p.w * sc), h = Math.round(p.h * sc);
    if (embed) images.push({ bytes: dataUrlBytes(p.data), ext: dataUrlExt(p.data), row: rows.length, col: 5, w, h });
    rows.push({ h: embed ? Math.max(30, Math.round(h * 0.75) + 8) : null, cells: [{ v: p.ref, s: S.b }, { v: it.id, s: S.c }, { v: it.req, s: S.n }, { v: p.caption || '', s: S.n }, { v: (p.by || '') + ' ' + fmtDT(p.at), s: S.n }, { v: embed ? '' : '(not embedded)', s: S.n }] });
  }));
  b.addSheet({ name, cols: [14, 10, 50, 40, 22, 38], rows, images, freeze: { row: 1 } });
}
/* ---------- closure reports ---------- */
function closureRows(c) {
  return c.findings.map((f, i) => { const cl = f.r.clo || {}; return { n: i + 1, f, cl, status: cl.status || 'open', overdue: !!(cl.status !== 'verified' && f.r.target && f.r.target < todayISO()) }; });
}
const CLO_FILL = { open: 'FBE3E1', progress: 'FDF0D5', done: 'DDEBFA', verified: 'E3F4E8' };
function buildClosureDocx(c, opt) {
  opt = opt || {}; const { audit: a, cfg } = c, d = new Docx(), CW = 9864, s = c.clo, rows = closureRows(c);
  coverXml(d, c, 'Corrective Action Verification and Closure Report', CW);
  d.add(DX.h('1. Closure summary', 1, { pb: 1 }));
  d.add(DX.p(`The audit recorded ${s.total} finding(s) (non-compliant or partially compliant). As on ${fmtDate(todayISO())}: ${s.verified} verified closed, ${s.done} completed and awaiting verification, ${s.progress} in progress and ${s.open} open. ${s.overdue} finding(s) are past their target date without verified closure.`));
  d.add(DX.table([['Findings', 'Verified closed', 'Awaiting verification', 'In progress', 'Open', 'Overdue', 'Closure %'], [s.total, s.verified, s.done, s.progress, s.open, s.overdue, s.total ? pct(s.verified / s.total * 100, 0) : '–'].map(v => ({ t: v, b: 1, sz: 11, align: 'center' }))], { widths: [1409, 1409, 1409, 1409, 1409, 1409, 1410], head: 1, sz: 8 }));
  d.add(DX.p(`Compliance score at audit: ${pct(c.comp.score)} (${c.comp.rating}). The audit score is not changed by closure; a follow-up audit is needed to re-score the premises.`));
  if (a.closureNote) d.add(DX.p(a.closureNote));
  d.add(DX.h('2. Closure register', 1));
  d.add(DX.table([['No.', 'Ref', 'Finding', 'Risk', 'Target date', 'Closure status', 'Verified by / on']].concat(rows.map(x => { const g = x.f.risk ? gradeStyle(cfg, x.f.risk.grade) : null; return [x.n, { t: x.f.it.id, b: 1 }, { t: x.f.r.obs || x.f.it.req, sz: 8 }, x.f.risk ? { t: x.f.risk.score + ' ' + x.f.risk.grade, fill: hx(g.bg), color: hx(g.color), b: 1, align: 'center' } : '–', (fmtDate(x.f.r.target) || '–') + (x.overdue ? '\nOVERDUE' : ''), { t: CLO[x.status], fill: CLO_FILL[x.status], b: 1, sz: 8 }, { t: x.status === 'verified' ? (x.cl.verBy || '') + '\n' + fmtDate(x.cl.verDate) : '', sz: 8 }]; })), { widths: [500, 800, 3664, 1100, 1200, 1400, 1200], head: 1 }));
  d.add(DX.h('3. Finding-wise closure details', 1, { pb: 1 }));
  rows.forEach(x => {
    const r = x.f.r, it = x.f.it, cl = x.cl;
    d.add(DX.table([
      [{ t: 'Finding ' + x.n + '   |   ' + it.id, b: 1, fill: '2F5597', color: 'FFFFFF' }, { t: CLO[x.status], b: 1, fill: CLO_FILL[x.status] }],
      [{ t: 'Requirement', b: 1, fill: 'EEF2F8' }, it.req + '\n' + (it.ref || '')], [{ t: 'Audit observation', b: 1, fill: 'EEF2F8' }, (ST[r.st].label + '. ' + (r.obs || ''))],
      [{ t: 'Recommended corrective action', b: 1, fill: 'EEF2F8' }, r.rec || '–'], [{ t: 'Responsible / target date', b: 1, fill: 'EEF2F8' }, (r.respb || '–') + '   /   ' + (fmtDate(r.target) || '–') + (x.overdue ? '   (overdue)' : '')],
      [{ t: 'Action taken', b: 1, fill: 'EEF2F8' }, cl.action || '–'], [{ t: 'Action completed on', b: 1, fill: 'EEF2F8' }, fmtDate(cl.doneDate) || '–'],
      [{ t: 'Verification', b: 1, fill: 'EEF2F8' }, x.status === 'verified' ? 'Verified closed by ' + (cl.verBy || '–') + ' on ' + (fmtDate(cl.verDate) || '–') : 'Not yet verified'], [{ t: 'Verifier remarks', b: 1, fill: 'EEF2F8' }, cl.remarks || '–']
    ], { widths: [2600, 7264] }));
    if (opt.photos !== false) {
      const before = c.byQ[it.id] || [], after = c.cloQ[it.id] || [];
      if (before.length) { d.add(DX.p(DX.run('At audit', { b: 1, sz: 9 }), { after: 40, keep: 1 })); d.add(photoGridXml(d, before, CW)); }
      if (after.length) { d.add(DX.p(DX.run('After corrective action', { b: 1, sz: 9 }), { after: 40, keep: 1 })); d.add(photoGridXml(d, after, CW)); }
    }
  });
  if (!rows.length) d.add(DX.p('No findings were recorded in this audit.'));
  return d.build({ header: a.ref + ' | ' + (a.site || '') + ' | Closure report', footer: 'Corrective Action Closure Report' });
}
function buildClosureXlsx(c, opt) {
  opt = opt || {}; const { audit: a, cfg } = c, b = new XlsxBook(), S = xlsxStyles(b), s = c.clo, rows = closureRows(c);
  const cs = {}; Object.keys(CLO).forEach(k => cs[k] = b.style({ b: 1, fill: CLO_FILL[k] }));
  const sm = [[{ v: 'Corrective Action Closure Report - ' + (a.site || a.ref), s: S.t }], [{ v: 'Generated ' + fmtDT(new Date().toISOString()), s: S.sub }], []];
  auditDetailRows(c).forEach(r => sm.push([{ v: r[0], s: S.lab }, { v: r[1] || '', s: S.n }])); sm.push([]);
  [['Compliance score at audit', c.comp.score == null ? '' : pct(c.comp.score) + ' (' + c.comp.rating + ')'], ['Findings (NC / PC)', s.total], ['Verified closed', s.verified], ['Completed - awaiting verification', s.done], ['Action in progress', s.progress], ['Open', s.open], ['Overdue (past target date, not verified)', s.overdue], ['Closure %', s.total ? pct(s.verified / s.total * 100, 0) : '']].forEach(r => sm.push([{ v: r[0], s: S.lab }, { v: r[1], s: S.b }]));
  if (a.closureNote) { sm.push([]); sm.push([{ v: 'Closure remarks', s: S.lab }, { v: a.closureNote, s: S.n }]); }
  b.addSheet({ name: 'Closure summary', cols: [40, 70], rows: sm });
  const H = ['No.', 'Ref', 'Audit point (requirement)', 'Standard reference', 'Status at audit', 'Observation', 'Severity', 'Likelihood', 'Risk score', 'Risk grade', 'Recommended corrective action', 'Responsible', 'Target date', 'Overdue', 'Closure status', 'Action taken', 'Action completed on', 'Verified by', 'Verified on', 'Verifier remarks', 'Audit photos', 'Closure photos'];
  const reg = [H.map(v => ({ v, s: S.h }))];
  rows.forEach(x => { const r = x.f.r, it = x.f.it, risk = x.f.risk, cl = x.cl;
    reg.push([{ v: x.n, s: S.c }, { v: it.id, s: S.b }, { v: it.req, s: S.n }, { v: it.ref, s: S.n }, { v: r.st, s: S.st[r.st] }, { v: r.obs || '', s: S.n }, { v: risk ? risk.sev : '', s: S.c }, { v: risk ? risk.lik : '', s: S.c }, { v: risk ? risk.score : '', s: S.c }, { v: risk ? risk.grade : '', s: risk ? gSty(b, S, cfg, risk.grade) : S.c },
      { v: r.rec || '', s: S.n }, { v: r.respb || '', s: S.n }, { v: fmtDate(r.target), s: S.n }, { v: x.overdue ? 'Yes' : '', s: S.cb }, { v: CLO[x.status], s: cs[x.status] }, { v: cl.action || '', s: S.n }, { v: fmtDate(cl.doneDate), s: S.n }, { v: cl.verBy || '', s: S.n }, { v: fmtDate(cl.verDate), s: S.n }, { v: cl.remarks || '', s: S.n },
      { v: (c.byQ[it.id] || []).map(p => p.ref).join('; '), s: S.n }, { v: (c.cloQ[it.id] || []).map(p => p.ref).join('; '), s: S.n }]); });
  b.addSheet({ name: 'Closure register', cols: [6, 9, 46, 26, 10, 40, 9, 10, 9, 11, 40, 16, 13, 9, 22, 40, 14, 16, 13, 30, 18, 18], rows: reg, freeze: { row: 1, col: 2 }, filter: 'A1:' + colL(H.length - 1) + reg.length });
  photoSheet(b, S, c, 'Audit photos', c.byQ, opt.photos !== false); photoSheet(b, S, c, 'Closure photos', c.cloQ, opt.photos !== false);
  return b.build();
}
/* ---------- checklist import from Excel rows ---------- */
function templateFromSheets(sheets, fileName) {
  const names = Object.keys(sheets), norm = v => String(v == null ? '' : v).trim().toLowerCase();
  let best = null;
  for (const nm of names) {
    const rows = sheets[nm];
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const hdr = Array.from(rows[i] || [], norm), find = (...keys) => hdr.findIndex(h => h && keys.some(k => h === k || h.startsWith(k)));
      const cReq = find('audit point', 'requirement', 'question', 'checklist item', 'check point', 'checkpoint', 'description');
      if (cReq < 0) continue;
      const col = { req: cReq, id: find('ref', 'id', 'q id', 'question id', 'sr', 's.no', 'sl', 'no'), ref: find('standard reference', 'reference', 'clause', 'standard'), type: find('requirement type', 'type'), app: find('applicability'), guide: find('guidance', 'how to verify', 'auditor guidance'), method: find('method', 'verification'), sev: find('severity', 'default severity'), weight: find('weight'), sec: find('sec', 'section', 'domain', 'category') };
      if (col.id === cReq) col.id = -1;
      if (col.ref === col.id) col.ref = hdr.findIndex((h, j) => j !== col.id && h && ['standard reference', 'reference', 'clause', 'standard'].some(k => h.startsWith(k)));
      const score = Object.values(col).filter(x => x >= 0).length + (norm(nm) === 'checklist' ? 5 : 0);
      if (!best || score > best.score) best = { nm, i, col, score };
      break;
    }
  }
  if (!best) throw new Error('No checklist sheet found. The sheet needs a header row with a column named "Audit point", "Requirement" or "Question".');
  const rows = sheets[best.nm], c = best.col, sections = [], items = [], seen = new Set(); let cur = null, auto = 0;
  const get = (r, k) => c[k] >= 0 && r[c[k]] != null ? String(r[c[k]]).trim() : '';
  for (let i = best.i + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const filled = r.filter(v => v != null && v !== '');
    const first = String(r.find(v => v != null && v !== '') || '').trim();
    const sm = /^Section\s+([A-Za-z0-9]+)\s*[:\-.]\s*(.+)$/i.exec(first);
    if (sm && (filled.length === 1 || !get(r, 'req'))) { cur = sections.find(s => s.id === sm[1].toUpperCase()) || { id: sm[1].toUpperCase(), name: sm[2].trim() }; if (!sections.includes(cur)) sections.push(cur); continue; }
    if (filled.length === 1) { cur = { id: String.fromCharCode(65 + sections.length), name: first }; sections.push(cur); continue; }
    const req = get(r, 'req'); if (!req) continue;
    let id = get(r, 'id'); if (/^example$/i.test(id)) continue;
    let sec = '';
    if (cur) sec = cur.id; else if (c.sec >= 0 && get(r, 'sec')) { const sv = get(r, 'sec'); let s = sections.find(x => x.id === sv || x.name === sv); if (!s) { s = sv.length <= 3 ? { id: sv, name: 'Section ' + sv } : { id: String.fromCharCode(65 + sections.length), name: sv }; sections.push(s); } sec = s.id; }
    if (!sec) { if (!sections.length) sections.push({ id: 'A', name: 'General' }); sec = sections[0].id; }
    auto++; if (!id || seen.has(id)) id = sec + '-' + String(auto).padStart(3, '0'); seen.add(id);
    let sev = parseInt(get(r, 'sev'), 10); if (!(sev >= 1 && sev <= 5)) sev = 3;
    let w = parseFloat(get(r, 'weight')); if (!(w > 0)) w = sev;
    items.push({ id, sec, req, ref: get(r, 'ref'), type: get(r, 'type'), app: get(r, 'app') || 'All', guide: get(r, 'guide'), method: get(r, 'method'), sev, weight: w });
  }
  if (!items.length) throw new Error('No checklist questions found below the header row of sheet "' + best.nm + '".');
  let profile = null; const bpName = names.find(n => norm(n) === 'building profile');
  if (bpName) { profile = []; sheets[bpName].forEach((r, i) => { if (r && r[0] && i >= 3 && norm(r[0]) !== 'item') profile.push({ label: String(r[0]), example: r[2] == null ? '' : String(r[2]), why: r[3] == null ? '' : String(r[3]) }); }); }
  return { name: fileName.replace(/\.xlsx$/i, '').replace(/_/g, ' '), version: 'Ver1', source: fileName, sections: sections.filter(s => items.some(it => it.sec === s.id)), items, profile };
}
