import json,sys,io
src='./'
js=''.join(open(src+f+'.js',encoding='utf-8').read()+'\n' for f in ['core','ooxml','reports','app1','app2','admin','v3','v3admin'])
css=open(src+'style.css',encoding='utf-8').read()
tpl=json.load(open(src+'data.json',encoding='utf-8'))
tj=json.dumps(tpl,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
assert '</script' not in js.lower()
html=f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f3864">
<title>Safety Audit Platform - Pilot v0.3</title>
<style>
{css}</style>
</head>
<body>
<div id="app"><p style="padding:24px;font-family:sans-serif">Loading…</p></div>
<noscript><p style="padding:24px">This application needs JavaScript.</p></noscript>
<script id="tpl-data" type="application/json">{tj}</script>
<script>
"use strict";
{js}
boot(JSON.parse(document.getElementById('tpl-data').textContent)).catch(function(e){{console.error(e);document.getElementById('app').innerHTML='<p style="padding:24px">The application could not start: '+String(e&&e.message||e)+'</p>';}});
</script>
</body>
</html>
'''
open(sys.argv[1],'w',encoding='utf-8').write(html)
print(len(html))
