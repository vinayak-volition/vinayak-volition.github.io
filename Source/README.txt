Safety Audit Platform - Pilot v0.3 : source

Plain JavaScript, no external libraries.
  core.js     constants, scoring (compliance and risk), helpers
  ooxml.js    ZIP writer, XLSX reader/writer, DOCX writer
  reports.js  Word / Excel audit and closure reports; Excel checklist import
  app1.js     storage (IndexedDB), actions, audit lifecycle
  app2.js     screens (views) and rendering
  admin.js    sign-in, password hashing, users, audit register, admin console
  style.css   mobile-first styles
  v3.js       scoping, site walk-through, quick answers, measurements, programme builder
  v3admin.js  programme admin screens
  data.json   library (Ver3, 381 items, site areas, scoping rules) + Decathlon KPI rows, made by build_data.py

Build the single-file app (Python 3):
  python build.py Safety_Audit_Platform_Pilot.html
