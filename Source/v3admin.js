/* ---------- v0.3 admin: requirement library and audit programmes ---------- */
V.templates = function () {
  const lib = libTpl(), progs = S.templates.filter(t => t !== lib);
  const card = t => { const u = tplUsed(t.id), nc = t.items.filter(i => i.client).length, nm = t.items.filter(i => i.meas).length;
    return `<div class="card"><div class="ac-h"><b>${esc(t.name)}</b><span class="badge ${t.active ? 's-approved' : 's-draft'}">${t.active ? 'Active' : 'Inactive'}</span></div>${t.client ? `<small>Client: ${esc(t.client)}</small>` : ''}<small>${esc(t.version)} · ${t.items.length} questions in ${t.sections.length} ${t.client ? 'KPI groups' : 'sections'}${nc ? ' · ' + nc + ' client KPIs' : ''}${nm ? ' · ' + nm + ' measurements' : ''} · used by ${u} audit(s)</small><small class="muted">Source: ${esc(t.source || '')}</small>
      <div class="btnrow"><button class="btn sm" data-act="nav" data-v="tpl" data-t="${t.id}">${u ? 'View' : 'Edit'}</button><button class="btn sm" data-act="tplToggle" data-id="${t.id}">${t.active ? 'Deactivate' : 'Activate'}</button><button class="btn sm" data-act="tplDup" data-id="${t.id}">New version</button></div></div>`; };
  return `<div class="card"><h3>Audit programmes</h3><p class="muted small">A programme is the question set used for an audit: chosen sections of the library, a client's own KPIs, or both. Auditors pick a programme when the audit is created.</p><button class="btn pri wide" data-act="newProg">＋ New programme</button><div class="btnrow"><button class="btn sm" data-act="kpiTemplate">Download client KPI file template</button></div></div>
    ${progs.map(card).join('') || '<p class="muted small">No programmes yet.</p>'}
    <h2 class="mt">Requirement library</h2>${lib ? card(lib) : ''}
    <div class="card"><h3>Import a checklist as a programme</h3><p class="muted small">A plain checklist workbook (as in v0.1/v0.2): a sheet with an "Audit point", "Requirement" or "Question" column.</p><label class="btn"><input type="file" accept=".xlsx" data-file="xlsx" hidden>Import checklist (.xlsx)</label></div>`;
};
V.pnew = function () {
  const f = S.form; if (!f || f.kind !== 'prog') return note('Start from Programmes.');
  const lib = libTpl(), i = (k, ph) => `<input data-scope="pform" data-f="${k}" value="${esc(f[k])}" placeholder="${ph || ''}">`;
  const n = f.secs.reduce((s, id) => s + lib.items.filter(it => it.sec === id).length, 0);
  return `<div class="card">${errNote()}${fld('Programme name *', i('name', 'e.g. Decathlon EFSA 2027'))}<div class="two">${fld('Client', i('client', 'e.g. Decathlon Sports India'))}${fld('Version', i('version'))}</div></div>
    <div class="card"><h3>1. Client KPIs (optional)</h3><p class="muted small">An Excel file in the client KPI format (download the template from Programmes). Each KPI becomes a question, a measurement, or a link to library requirements.</p>
      <label class="btn"><input type="file" accept=".xlsx" data-file="kpis" hidden>${f.rows ? 'Replace KPI file' : 'Choose KPI file (.xlsx)'}</label>${f.rows ? `<p class="small mt"><b>${esc(f.fileName)}</b>: ${f.rows.length} rows (${f.rows.filter(r => /^meas/i.test(r.type)).length} measurements, ${f.rows.filter(r => /^lib/i.test(r.type)).length} library links)</p>` : ''}</div>
    <div class="card"><h3>2. Library sections to include in full (optional)</h3><p class="muted small">${esc(lib.name)} (${esc(lib.version)}). Requirements linked from the KPI file are added anyway.</p><div class="checks">${lib.sections.map(s => `<label><input type="checkbox" data-scope="pform" data-f="sec" data-s="${esc(s.id)}"${f.secs.includes(s.id) ? ' checked' : ''} data-rr> ${esc(s.id)}: ${esc(s.name)} <small class="muted">(${lib.items.filter(it => it.sec === s.id).length})</small></label>`).join('')}</div><p class="small">${n} library question(s) selected in full.</p></div>
    <button class="btn pri wide" data-act="createProg">Create programme</button>`;
};
const _tqView = V.tq;
V.tq = function (r) {
  const base = _tqView(r), t = S.templates.find(x => x.id === r.t), it = t && t.items.find(x => x.id === r.q); if (!it) return base;
  const ed = !tplUsed(t.id), m = it.meas, a = (s, f, extra) => `data-scope="${s}" data-t="${t.id}" data-q="${esc(it.id)}" data-f="${f}" ${extra || ''}${dis(ed)}`;
  const extra = `<div class="card"><h3>Walk-through and scoping</h3>${it.libRef ? `<p class="small">Library requirement: <b>${esc(it.libRef)}</b></p>` : ''}${it.kpi ? `<p class="small">Client KPI: ${esc(it.kpi)}</p>` : ''}
    ${fld('Site area', `<select ${a('tq', 'area')}>${AREAS.map(x => `<option value="${x.id}"${it.area === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
    ${fld('Applies when (scoping codes, joined with +)', `<input ${a('tqr', 'rule')} value="${esc((it.rule || []).join(' + '))}">`, 'Blank = always applies. Codes: h15, h24, h60, bas, kw250, ' + Object.values(FACT).filter(f => !f.num).map(f => f.k).join(', ') + '.')}
    <label class="check"><input type="checkbox" ${a('tqm', 'on', 'data-rr')}${m ? ' checked' : ''}> Measurement question (numeric reading)</label>
    ${m ? `<div class="two">${fld('Unit', `<input ${a('tqm', 'unit')} value="${esc(m.unit)}">`)}<label class="check"><input type="checkbox" ${a('tqm', 'multi')}${m.multi ? ' checked' : ''}> Several readings</label></div><div class="two">${fld('Compliant min', `<input type="number" step="any" ${a('tqm', 'lo')} value="${m.lo ?? ''}">`)}${fld('Compliant max', `<input type="number" step="any" ${a('tqm', 'hi')} value="${m.hi ?? ''}">`)}</div><div class="two">${fld('Partially compliant min', `<input type="number" step="any" ${a('tqm', 'pcLo')} value="${m.pcLo ?? ''}">`)}${fld('Partially compliant max', `<input type="number" step="any" ${a('tqm', 'pcHi')} value="${m.pcHi ?? ''}">`)}</div>${fld('Benchmark text', `<input ${a('tqm', 'bench')} value="${esc(m.bench)}">`)}` : ''}</div>`;
  return base.replace(/(<button class="btn danger" data-act="tqDel"[^>]*>Delete question<\/button>)?<\/div>$/, (mm, del) => '</div>' + extra + (del ? `<button class="btn danger wide" data-act="tqDel" data-t="${t.id}" data-q="${esc(it.id)}">Delete question</button>` : ''));
};
Object.assign(ACT, {
  newProg() { S.form = { kind: 'prog', name: '', client: '', version: 'P1', secs: [], rows: null, fileName: '' }; go({ v: 'pnew' }); },
  kpiTemplate() { download(kpiTemplateXlsx(), 'Client_KPI_Template.xlsx', MIME_XLSX); },
  async createProg() {
    const f = S.form, lib = libTpl(); if (!f.name.trim()) { S.loginErr = 'Enter a programme name.'; return rerender(); }
    if (!(f.rows && f.rows.length) && !f.secs.length) { S.loginErr = 'Choose a client KPI file, library sections, or both.'; return rerender(); }
    const { tpl, warn } = buildProgramme(lib, f.rows || [], { name: f.name.trim(), client: f.client.trim(), version: f.version.trim() || 'P1', source: (f.fileName ? f.fileName + ' + ' : '') + 'library ' + lib.version }, f.secs);
    tpl.active = false; S.templates.push(tpl); await DB.put('templates', tpl); await actLog('Programme created', tpl.name + ': ' + tpl.items.length + ' questions');
    S.form = null; go({ v: 'tpl', t: tpl.id }, true); toast(tpl.items.length + ' questions in ' + tpl.sections.length + ' groups' + (warn.length ? '. Unknown library refs ignored: ' + warn.join(', ') : '') + '. Review, then activate.');
  }
});
async function onKpiFile(file) {
  const rows = kpiRowsFromSheets(await readXlsx(new Uint8Array(await readFile(file))));
  S.form.rows = rows; S.form.fileName = file.name; if (!S.form.name) S.form.name = file.name.replace(/\.xlsx$/i, '').replace(/_/g, ' '); rerender();
}
