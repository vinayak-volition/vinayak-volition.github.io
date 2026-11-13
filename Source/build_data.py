import openpyxl, re, json, sys, collections
FM = '/sessions/relaxed-vigilant-ride/mnt/FORMATS/'
wb = openpyxl.load_workbook(FM + 'Fire_Life_Safety_Audit_Checklist_NBC2016_Ver3.xlsx')
ws = wb['Checklist']
secs, items = [], []
for r in ws.iter_rows(min_row=3, values_only=True):
    a = r[0]
    if a is None: continue
    m = re.match(r'Section ([A-Z]+): (.*)', str(a))
    if m and r[1] is None: secs.append({'id': m.group(1), 'name': m.group(2)}); continue
    if not r[1]: continue
    items.append({'id': a, 'sec': r[17], 'req': r[1], 'ref': r[2] or '', 'type': r[3] or '', 'app': r[4] or 'All', 'guide': r[5] or '', 'method': r[6] or '', 'sev': int(r[9] or 3)})
assert len(items) == 381, len(items)

# ---------- scoping rules from the Applicability column ----------
def rule(t):
    s = t.lower()
    if s.startswith('all'): return []
    R = [
        (r'^residential above 120 m; other occupancies above 60 m', ['h60']),
        (r'high rise \(15 m and above\) with transformers', ['h15', 'tin']),
        (r'^high rise( \(15 m and above\))?( \(annex d guidelines\))?( \(other buildings.*\))?$', ['h15']),
        (r'^height more than 15 m', ['h15']), (r'^height more than 24 m', ['h24']), (r'^height greater than 60 m', ['h60']),
        (r'^height exceeding 150', ['h150']), (r'^height above 200', ['h200']),
        (r'buildings above 100 m using lpg', ['h100', 'gas']),
    ]
    if ';' in s:
        for rx, keys in R:
            if re.search(rx, s): return keys
        return []
    R += [
        (r'diesel fire pump', ['dpump']), (r'fire pumps are provided|electric fire pumps', ['pump']),
        (r'^sprinklered', ['spk']),
        (r'fire alarm system is provided|automatic detection is provided|detection is provided|automatic fire alarm|fire alarm panel is provided', ['fa']),
        (r'^centrally air conditioned', ['cac']), (r'air conditioned buildings with pressurization|pressurization is provided', ['prs']),
        (r'^buildings with car parking', ['park']), (r'^enclosed car parking', ['bpark/epark']), (r'basement car parking', ['bpark']),
        (r'stilt and open car parking', ['opark']), (r'car lifts', ['clift']),
        (r'kitchens? .*gas', ['kit', 'gas']), (r'kitchen', ['kit']),
        (r'piped gas|lpg cylinders|gas is used|gas is supplied|gas installations|gas meters', ['gas']),
        (r'oil storage for boilers', ['boil', 'bas']), (r'boilers are installed', ['boil']),
        (r'atrium', ['atr']), (r'escalators', ['esc']), (r"fireman's lift", ['lift']),
        (r'glass facade', ['glass']), (r'fire command centre', ['fcc']),
        (r'^buildings with basements|mechanically ventilated basements|basement area exceeding', ['bas']),
        (r'yard hydrant', ['yard']),
        (r'internal hydrants|wet risers|hose reels|hydrant systems|more than one wet riser', ['hyd']),
        (r'static tank|fire tanks', ['tank']),
        (r'standby generator|dg sets are provided|separate dg fuel tank', ['dg']),
        (r'^generating stations \(including captive dg', ['dg/sub']), (r'own transformers or generators', ['hv/dg']),
        (r'substation or switching station is located in a basement', ['sub', 'bas']), (r'substation is provided|outdoor substation', ['sub']),
        (r'transformers are inside|transformers inside the building', ['tin']), (r'oil.filled', ['oil']),
        (r'own hv|hv \(above 650 v\)', ['hv']), (r'battery banks|ups rooms', ['ups']), (r'solar pv', ['solar']), (r'ev charging', ['ev']),
        (r'connected load above 250 kw', ['kw250']),
    ]
    for rx, keys in R:
        if re.search(rx, s): return keys
    return []

# ---------- site areas ----------
AREAS = [
    ('DOC', 'Documents, records & management (desk review)'), ('EXT', 'Site, access, external areas & earth pits'),
    ('FAB', 'Building fabric & compartmentation'), ('EGR', 'Escape routes, staircases & exits'), ('LGT', 'Emergency lighting & exit signage'),
    ('FAA', 'Fire alarm & detection'), ('FFS', 'Hydrants, sprinklers & extinguishers'), ('PMP', 'Pump room & fire water tanks'),
    ('FCC', 'Fire command centre'), ('ELR', 'Electrical panel rooms & distribution'), ('SUB', 'Substation, transformer & HV'),
    ('DGS', 'DG set & fuel'), ('HVC', 'HVAC, AHU & smoke control'), ('LFT', 'Lifts, escalators & refuge areas'),
    ('KIT', 'Kitchen, gas & boilers'), ('CAR', 'Car park & basements'), ('ROF', 'Roof, solar PV & EV charging'), ('HSK', 'General floor walk & housekeeping')]
SEC_AREA = dict(A='DOC', B='FAB', C='FAB', D='EGR', E='LGT', F='HVC', G='ELR', H='FAA', I='FFS', J='FCC', K='LFT', L='KIT', M='CAR', N='FAB', O='HSK', P='ELR')
def area(it):
    t = it['req']; s = it['sec']
    if it['method'].strip() == 'D': return 'DOC'
    if s == 'B' and re.search(r'access|approach|road|driveway|setback|open space|gate', t, re.I): return 'EXT'
    if s in 'GP':
        if re.search(r'\bDG\b|diesel generat|generator set', t): return 'DGS'
        if re.search(r'substation|transformer|\bHV\b|switching station|RMU|earth mat|capacitor', t, re.I): return 'SUB'
        if re.search(r'solar|\bEV\b|charging', t): return 'ROF'
        if re.search(r'earth electrode|earth pit|lightning', t, re.I): return 'EXT'
    if s == 'I' and re.search(r'pump|tank|jockey|suction|diesel engine', t, re.I): return 'PMP'
    if s in 'FCI' and re.search(r'basement|car park', t, re.I): return 'CAR'
    if s in 'CDH' and re.search(r'\blift|escalator', t, re.I): return 'LFT'
    return SEC_AREA.get(s, 'HSK')
for it in items:
    it['rule'] = rule(it['app']); it['area'] = area(it); it['weight'] = it['sev']

# ---------- risk grading & profile ----------
rg = wb['Risk Grading']
SEVSCALE = [{'n': rg.cell(i, 1).value, 'name': rg.cell(i, 2).value, 'desc': rg.cell(i, 3).value} for i in range(6, 11)]
lik = [{'n': rg.cell(i, 1).value, 'name': rg.cell(i, 2).value, 'desc': rg.cell(i, 3).value} for i in range(15, 20)]
grades = [{'name': rg.cell(i, 1).value, 'min': rg.cell(i, 2).value, 'action': rg.cell(i, 3).value, 'timeline': rg.cell(i, 4).value} for i in range(23, 27)]
ratings = [{'name': rg.cell(i, 1).value, 'min': round(rg.cell(i, 2).value * 100, 2)} for i in range(44, 48)]
profile = [{'label': r[0], 'example': '' if r[2] is None else str(r[2]), 'why': r[3] or ''} for r in wb['Building Profile'].iter_rows(min_row=5, values_only=True) if r[0]]
lib = {'name': 'Requirement library - NBC 2016 + IS + CEA 2023', 'version': 'Ver3', 'source': 'Fire_Life_Safety_Audit_Checklist_NBC2016_Ver3.xlsx', 'sections': secs, 'items': items, 'profile': profile}
byid = {it['id']: it for it in items}

# ---------- Decathlon programme ----------
gw = openpyxl.load_workbook(FM + 'KPI_Gap_Decathlon_Reports_vs_Checklist_Ver2.xlsx')
GROUPS = [('DE', 'Electrical installation & testing'), ('DH', 'HVAC & indoor environment'), ('DL', 'Lifts'), ('DS', 'Escalators'),
          ('DA', 'Documentation, training & emergency preparedness'), ('DM', 'Means of egress & signage'), ('DF', 'Fire detection & alarm'),
          ('DX', 'Firefighting & extinguishers'), ('DO', 'Security & general')]
PROP = {'P': 'DE', 'Q': 'DH', 'R': 'DL', 'S': 'DS', 'A': 'DA', 'D': 'DM', 'E': 'DM', 'H': 'DF', 'I': 'DX', 'O': 'DO'}
LIBGRP = dict(A='DA', B='DM', C='DM', D='DM', E='DM', F='DH', G='DE', P='DE', H='DF', J='DF', I='DX', O='DO', K='DL', L='DO', M='DO', N='DM')
M = {
 (1, 1): dict(unit='%', hi=10, bench='Phase current imbalance not more than 10% (auditor benchmark, to be confirmed)'),
 (1, 2): dict(unit='V', lo=216.2, hi=243.8, bench='230 V +/-6% (216.2 to 243.8 V), as used in the Decathlon reports (to be confirmed)'),
 (1, 3): dict(unit='', lo=0.95, pcLo=0.9, bench='Not less than 0.95; 0.90 to 0.95 partially compliant (energy KPI, to be confirmed)'),
 (1, 4): dict(unit='%', hi=15, bench='Not more than 15% (Decathlon report benchmark, to be confirmed; IEEE 519 TDD limit depends on Isc/IL)'),
 (1, 5): dict(unit='%', hi=8, bench='Not more than 8% (IEEE 519, up to 1 kV)'),
 (1, 6): dict(unit='V', hi=1, bench='Less than 1.0 V (Decathlon report benchmark, to be confirmed)', multi=1),
 (1, 7): dict(unit='ohm', hi=2, pcHi=5, bench='LV equipment earth not more than 2 ohm; above 2 up to 5 ohm partially compliant; above 5 ohm non-compliant (Ver3 auditor benchmark, IS 3043 practice)', multi=1),
 (1, 14): dict(unit='deg C', bench='Record hotspot temperature and the difference from similar components; acceptance limit to be agreed with the client', multi=1),
 (1, 15): dict(unit='deg C', bench='Record room temperature; acceptance limit to be agreed with the client'),
 (1, 16): dict(unit='lux', lo=450, bench='Not less than 450 lux (Decathlon report benchmark, to be confirmed; IS 3646 range 350 to 500 lux)', multi=1),
 (1, 22): dict(unit='ACH', lo=8, hi=15, bench='8 to 15 air changes per hour (Decathlon report benchmark, to be confirmed)', multi=1),
 (1, 23): dict(unit='deg C', bench='Record supply and return air temperatures per AHU / IDU; acceptance per design data', multi=1),
 (1, 24): dict(unit='deg C', lo=23, hi=25, bench='23 to 25 deg C (Decathlon report benchmark, to be confirmed)', multi=1),
 (1, 27): dict(unit='lux', bench='Record illuminance per area; compare with IS 3646 recommended values for the area type', multi=1),
 (1, 29): dict(unit='V', bench='Record battery voltage; acceptance per lift manufacturer data'),
 (2, 1): dict(unit='V', lo=373.5, hi=456.5, bench='415 V +/-10% (373.5 to 456.5 V), as used in the Decathlon reports (to be confirmed)'),
 (2, 2): dict(unit='A', bench='Record neutral current; investigate if it exceeds the lowest phase current'),
}
REPLACE = {(1, 17): ['P-17'], (1, 18): ['P-16'], (2, 12): ['P-15'], (2, 6): ['P-12'], (2, 7): ['P-08'], (2, 15): ['P-19']}
EXTRA = {(1, 11): ['P-37'], (1, 7): ['P-40'], (2, 11): ['P-33'], (2, 4): ['P-38']}
SEV4 = {(1, 6), (1, 7), (1, 8), (1, 11), (1, 12), (2, 3), (2, 4), (2, 5), (2, 10), (2, 14), (1, 28), (1, 30), (1, 33), (1, 34), (1, 36), (2, 20), (2, 21), (2, 22)}
SEV2 = {(1, 3), (1, 4), (1, 5), (1, 22), (1, 23), (1, 24), (1, 26), (1, 27), (1, 37), (1, 39), (1, 40), (2, 17), (2, 18), (1, 49), (1, 19)}
AREA_OVR = {(1, 7): 'EXT', (1, 8): 'EXT', (1, 9): 'EXT', (1, 10): 'EXT', (2, 4): 'EXT', (1, 27): 'HSK', (2, 29): 'PMP', (1, 49): 'HSK'}
GAREA = dict(DE='ELR', DH='HVC', DL='LFT', DS='LFT', DA='DOC', DM='EGR', DF='FAA', DX='FFS', DO='HSK')
GRULE = dict(DH=['ac'], DL=['lift'], DS=['esc'])
APPTXT = {'lift': 'Where lifts are provided', 'esc': 'Where escalators are provided', 'ac': 'Air-conditioned premises', 'ups': 'Where UPS / IT loads are provided'}
pitems, kpis, cnt, lib_in = [], [], {}, {}
def add_lib(i, grp=None, kpi=''):
    if i not in byid: return
    if i not in lib_in: lib_in[i] = [grp or LIBGRP.get(byid[i]['sec'], 'DO'), kpi]
    elif kpi and not lib_in[i][1]: lib_in[i][1] = kpi
for b, name in ((1, 'KPI Gaps'), (2, 'Batch 2 (19 reports)')):
    for r in gw[name].iter_rows(min_row=3, values_only=True):
        if not str(r[0] or '').strip().isdigit(): continue
        n = int(r[0]); key = (b, n); grp = PROP[str(r[1]).strip()[0]]
        kpi, bench, cov, close, sref = r[2], r[3] or '', r[6], r[7] or '', r[8] or ''
        closest = re.findall(r'\b[A-P]-\d\d\b', close)
        row = {'src': 'Decathlon reports, batch %d row %d' % (b, n), 'group': dict(GROUPS)[grp], 'kpi': kpi, 'bench': bench, 'coverage_ver2': cov}
        if key in REPLACE:
            for i in REPLACE[key]: add_lib(i, grp, kpi)
            row.update(type='Library item', qid='', maps=', '.join(REPLACE[key]), sev='', unit='', lo=None, hi=None, pcLo=None, pcHi=None, mbench='', ref='Covered by Ver3 Section P (CEA 2023)')
            kpis.append(row); continue
        cnt[grp] = cnt.get(grp, 0) + 1; qid = '%s-%02d' % (grp, cnt[grp])
        meas = M.get(key); sev = 4 if key in SEV4 else 2 if key in SEV2 else 3
        rl = ['ups'] if key == (1, 8) else list(GRULE.get(grp, []))
        rel = closest + EXTRA.get(key, [])
        it = {'id': qid, 'sec': grp, 'req': kpi, 'ref': 'Decathlon EFSA KPI' + ('; ' + sref if sref and sref != '—' else ''), 'type': 'Client KPI',
              'app': APPTXT.get(rl[0], 'All') if rl else 'All',
              'guide': ('Benchmark used in the Decathlon reports: ' + bench + '. ' if bench else '') + ('Related library requirement(s): ' + ', '.join(rel) + '.' if rel else ''),
              'method': 'M' if meas else 'V', 'sev': sev, 'weight': sev, 'rule': rl, 'area': AREA_OVR.get(key, GAREA[grp]), 'kpi': kpi, 'client': 1}
        if meas: it['meas'] = meas
        pitems.append(it)
        for i in rel: add_lib(i, grp, '')
        row.update(type='Measurement' if meas else 'Check', qid=qid, maps=', '.join(rel), sev=sev, unit=(meas or {}).get('unit', ''), lo=(meas or {}).get('lo'), hi=(meas or {}).get('hi'),
                   pcLo=(meas or {}).get('pcLo'), pcHi=(meas or {}).get('pcHi'), mbench=(meas or {}).get('bench', ''), ref=it['ref'])
        kpis.append(row)
for r in gw['Already covered'].iter_rows(min_row=2, values_only=True):
    if not r[0] or not r[1]: continue
    for i in re.findall(r'\b[A-P]-\d\d\b', str(r[1])): add_lib(i, None, str(r[0]).split(' (')[0])
for i in ['P-04', 'P-24', 'P-25', 'P-36', 'P-41', 'P-11', 'P-10', 'I-43', 'E-10', 'H-10', 'A-10', 'A-08', 'A-18']: add_lib(i)
grp_items = {g: [] for g, _ in GROUPS}
for it in pitems: grp_items[it['sec']].append(it)
for i, (g, k) in sorted(lib_in.items()):
    c = dict(byid[i]); c['libRef'] = i; c['sec'] = g
    if k: c['kpi'] = k
    grp_items[g].append(c)
prog_items = [it for g, _ in GROUPS for it in sorted(grp_items[g], key=lambda x: (0 if x.get('client') else 1, x['id']))]
dec = {'name': 'Decathlon - Electrical & Fire Safety Audit (sample)', 'client': 'Decathlon Sports India (sample)', 'version': 'P1', 'source': 'KPI_Gap_Decathlon_Reports_vs_Checklist_Ver2.xlsx + library Ver3',
       'sections': [{'id': g, 'name': n} for g, n in GROUPS if grp_items[g]], 'items': prog_items, 'profile': profile}
# ---------- client KPI set rows in the import format (same data, one path in the app) ----------
GN = dict(GROUPS); KR = []
WHEN = {'ac': 'ac', 'lift': 'lift', 'esc': 'esc', 'ups': 'ups'}
for it in pitems:
    m = it.get('meas') or {}
    rel = re.findall(r'\b[A-P]-\d\d\b', it['guide'].split('Related library requirement(s):')[-1]) if 'Related library' in it['guide'] else []
    KR.append({'code': it['sec'], 'group': GN[it['sec']], 'kpi': it['kpi'], 'type': 'Measurement' if m else 'Check', 'qid': it['id'], 'refs': ', '.join(rel),
               'unit': m.get('unit', ''), 'lo': m.get('lo'), 'hi': m.get('hi'), 'pcLo': m.get('pcLo'), 'pcHi': m.get('pcHi'), 'multi': 'Yes' if m.get('multi') else '',
               'bench': m.get('bench', ''), 'sev': it['sev'], 'area': it['area'], 'when': ' + '.join(it['rule']), 'ref': it['ref'], 'guide': it['guide']})
for k in kpis:
    if k['type'] == 'Library item':
        code = [c for c, n in GROUPS if n == k['group']][0]
        KR.append({'code': code, 'group': k['group'], 'kpi': k['kpi'], 'type': 'Library item', 'refs': k['maps']})
for r in gw['Already covered'].iter_rows(min_row=2, values_only=True):
    if not r[0] or not r[1]: continue
    for i in re.findall(r'\b[A-P]-\d\d\b', str(r[1])):
        c = LIBGRP.get(byid[i]['sec'], 'DO'); KR.append({'code': c, 'group': GN[c], 'kpi': str(r[0]).split(' (')[0], 'type': 'Library item', 'refs': i})
for i in ['P-04', 'P-24', 'P-25', 'P-36', 'P-41', 'P-11', 'P-10', 'I-43', 'E-10', 'H-10', 'A-10', 'A-08', 'A-18']:
    c = LIBGRP.get(byid[i]['sec'], 'DO'); KR.append({'code': c, 'group': GN[c], 'kpi': '', 'type': 'Library item', 'refs': i})
# order rows: client items first per group order of appearance is irrelevant (importer sorts); but group order must follow GROUPS
KR.sort(key=lambda r: [c for c, _ in GROUPS].index(r['code']))
out = {'lib': lib, 'areas': [{'id': a, 'name': n} for a, n in AREAS], 'decRows': KR, 'decMeta': {'name': dec['name'], 'client': dec['client'], 'version': 'P1', 'source': dec['source']},
       'expect': {'items': len(prog_items), 'client': len(pitems), 'library': len(lib_in), 'bysec': dict(collections.Counter(i['sec'] for i in prog_items))},
       'sev': SEVSCALE, 'lik': lik, 'grades': grades, 'ratings': ratings}
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False)
# sample client KPI file
from openpyxl.styles import Font, PatternFill, Alignment
H = [('code', 'Group code', 8), ('group', 'KPI group', 30), ('kpi', 'KPI / audit point', 60), ('type', 'Type', 13), ('qid', 'Question ID', 10), ('refs', 'Library refs', 18),
     ('unit', 'Unit', 8), ('lo', 'Compliant min', 10), ('hi', 'Compliant max', 10), ('pcLo', 'Partial min', 10), ('pcHi', 'Partial max', 10), ('multi', 'Multiple readings', 10),
     ('bench', 'Benchmark', 50), ('sev', 'Severity', 8), ('area', 'Site area code', 10), ('when', 'Applies when', 12), ('ref', 'Reference', 36), ('guide', 'Guidance', 60)]
xw = openpyxl.Workbook(); s1 = xw.active; s1.title = 'Client KPIs'
s1.append([h[1] for h in H])
for c, h in zip(s1[1], H): c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='2F5597'); c.alignment = Alignment(wrap_text=True, vertical='top'); s1.column_dimensions[c.column_letter].width = h[2]
for r in KR: s1.append([r.get(h[0]) for h in H])
for row in s1.iter_rows(min_row=2):
    for c in row: c.alignment = Alignment(wrap_text=True, vertical='top')
s1.freeze_panes = 'D2'; s1.auto_filter.ref = s1.dimensions
s2 = xw.create_sheet('Codes')
s2.append(['How to use']); s2['A1'].font = Font(bold=True, size=12)
for t in ['One row per client KPI. Type = Check (yes/no requirement), Measurement (numeric reading) or Library item (the KPI is fully covered by existing library requirement(s) listed in Library refs).',
          'Library refs on Check / Measurement rows are related library requirements that are added to the same KPI group.',
          'Measurement: a reading inside Compliant min-max is Compliant; inside Partial min-max is Partially compliant; otherwise Non-compliant. Leave all limits blank to record the reading only (auditor sets the status).',
          'Applies when: scoping codes below, joined with + (all must apply). Leave blank if the KPI applies to every site.', 'Severity 1 to 5 (default 3). Site area code: see list below.']:
    s2.append([t])
s2.append([]); s2.append(['Site area code', 'Site area']); s2.cell(s2.max_row, 1).font = Font(bold=True)
for a, n in AREAS: s2.append([a, n])
s2.append([]); s2.append(['Applies-when code', 'Meaning']); s2.cell(s2.max_row, 1).font = Font(bold=True)
for k, n in [('h15 / h24 / h60', 'Building height at least 15 / 24 / 60 m'), ('bas', 'Basement(s)'), ('spk', 'Sprinklers'), ('fa', 'Automatic fire alarm'), ('hyd', 'Internal hydrants / hose reels'), ('pump', 'Fire pumps'),
             ('ac', 'Air-conditioned premises'), ('cac', 'Central air conditioning'), ('lift', 'Lifts'), ('esc', 'Escalators / moving walks'), ('dg', 'DG set'), ('sub', 'Substation'), ('hv', 'HV installation owned'),
             ('ups', 'UPS / battery / IT loads'), ('kit', 'Commercial kitchen'), ('gas', 'Piped gas / LPG'), ('park', 'Car parking'), ('solar', 'Solar PV'), ('ev', 'EV charging'), ('kw250', 'Connected load above 250 kW')]:
    s2.append([k, n])
s2.column_dimensions['A'].width = 22; s2.column_dimensions['B'].width = 110
xw.save(sys.argv[1].replace('data.json', 'Decathlon_KPI_Set_SAMPLE.xlsx'))
print('library', len(items), 'with rule', sum(1 for i in items if i['rule']), dict(collections.Counter(i['area'] for i in items)))
print('decathlon items', len(prog_items), 'client', len(pitems), 'measure', sum(1 for i in pitems if 'meas' in i), 'library', len(lib_in), 'kpi rows', len(kpis))
print(dict(collections.Counter(i['sec'] for i in prog_items)))
print(sorted(set(k for i in items for k in i['rule'])))
print('unruled conditional:', collections.Counter(i['app'] for i in items if not i['rule'] and not i['app'].lower().startswith('all')).most_common(60))
