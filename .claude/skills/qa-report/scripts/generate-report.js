#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * qa-report — generador de informe HTML de evidencias de QA (optimizado para PDF).
 *
 * Toma un manifiesto JSON (qué se probó, resultados, hallazgos, recomendaciones,
 * evidencias) y emite UN solo HTML autocontenido, tipo documento A4, fácil de leer
 * y de exportar a PDF (sin JS). Las capturas se muestran a TAMAÑO GRANDE una sola
 * vez en la sección "Evidencias" (numeradas); los tests/hallazgos las referencian
 * como "Evidencia N" -> sin duplicar base64 (PDF más liviano). Sin dependencias.
 *
 * Uso:
 *   node generate-report.js <manifest.json> [opciones]
 * Opciones:
 *   --out <archivo.html>     Salida (default: informe.html junto al manifiesto).
 *   --no-embed               Enlaza las imágenes en vez de embeberlas (base64).
 *   --playwright <res.json>  Fusiona resultados del reporter JSON de Playwright.
 *   --css <archivo.css>      Hoja de estilos (default: ../templates/report.css).
 *
 * Rutas de evidencia: RELATIVAS al manifiesto. Esquema: ver manifest.example.json.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const a = { _: [], embed: true };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--no-embed') a.embed = false;
    else if (t === '--playwright') a.playwright = argv[++i];
    else if (t === '--css') a.css = argv[++i];
    else if (t === '-h' || t === '--help') a.help = true;
    else a._.push(t);
  }
  return a;
}

function die(msg) {
  console.error(`qa-report: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- helpers
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Markdown-lite seguro: escapa, luego **negrita**, `code`, [txt](url) y saltos de línea. */
function mdLite(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/** Devuelve un src usable en <img>: data-URI (embed) o ruta relativa. '' si falta. */
function imgSrc(file, baseDir, embed, outDir) {
  if (!file) return '';
  const abs = path.resolve(baseDir, file);
  if (!embed) return path.relative(outDir, abs).split(path.sep).join('/');
  try {
    const buf = fs.readFileSync(abs);
    const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

const STATUS_LABEL = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', xfail: 'Rojo esperado' };
function normStatus(s) {
  const v = String(s || '').toLowerCase();
  if (['passed', 'pass', 'ok', 'green', 'verde'].includes(v)) return 'passed';
  if (['failed', 'fail', 'red', 'rojo', 'timedout', 'interrupted'].includes(v)) return 'failed';
  if (['skipped', 'skip', 'omitido'].includes(v)) return 'skipped';
  if (['xfail', 'expected-fail', 'expected_failure', 'rojo-esperado', 'known-bug', 'live-bug'].includes(v)) return 'xfail';
  return 'skipped';
}
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
function normSeverity(s) {
  const v = String(s || 'info').toLowerCase();
  return SEVERITIES.includes(v) ? v : 'info';
}

// ---------------------------------------------------------------- playwright merge
function flattenPwSpecs(node, acc) {
  if (!node) return acc;
  if (Array.isArray(node.suites)) node.suites.forEach((s) => flattenPwSpecs(s, acc));
  if (Array.isArray(node.specs)) {
    node.specs.forEach((spec) => {
      const tests = spec.tests || [];
      const projects = [...new Set(tests.map((t) => t.projectName).filter(Boolean))];
      if (projects.length === 1 && projects[0] === 'setup') return; // excluir login setup
      // Estado real desde test.status: unexpected=falla real; expected+result fallido=
      // test.fail vivo (rojo esperado); skipped; resto passed.
      const tstat = tests.map((t) => t.status);
      let status;
      if (tstat.length && tstat.every((s) => s === 'skipped')) status = 'skipped';
      else if (tstat.some((s) => s === 'unexpected')) status = 'failed';
      else if (tests.some((t) => t.status === 'expected' && (t.results || []).some((r) => r.status === 'failed' || r.status === 'timedOut'))) status = 'xfail';
      else status = 'passed';
      const idMatch = (spec.title || '').match(/@([A-Z]+-TC-\d+)/);
      const layerMatch = (spec.title || '').match(/@(api|smoke|regression|e2e)/i);
      acc.push({
        id: idMatch ? idMatch[1] : '',
        title: (spec.title || '(sin título)').replace(/\s*@[\w-]+/g, '').trim(),
        layer: layerMatch ? layerMatch[1].toLowerCase() : projects[0] || '',
        status,
      });
    });
  }
  return acc;
}

function mergePlaywright(tests, pwPath) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(pwPath, 'utf8'));
  } catch (e) {
    die(`no se pudo leer el reporte de Playwright: ${pwPath} (${e.message})`);
  }
  const pwSpecs = flattenPwSpecs(json, []);
  const byId = new Map(tests.filter((t) => t.id).map((t) => [t.id, t]));
  for (const sp of pwSpecs) {
    if (sp.id && byId.has(sp.id)) {
      byId.get(sp.id).status = sp.status;
      if (!byId.get(sp.id).layer) byId.get(sp.id).layer = sp.layer;
    } else {
      tests.push(sp);
    }
  }
  return tests;
}

// ---------------------------------------------------------------- render
function renderSummary(counts, total, summaryTxt) {
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const seg = (k) => (counts[k] ? `<span class="b-${k}" style="width:${pct(counts[k])}%"></span>` : '');
  return `
  <div class="stats">
    <div class="stat total"><div class="n">${total}</div><div class="l">Tests</div></div>
    <div class="stat pass"><div class="n">${counts.passed}</div><div class="l">Passed</div></div>
    <div class="stat fail"><div class="n">${counts.failed}</div><div class="l">Failed</div></div>
    <div class="stat xfail"><div class="n">${counts.xfail}</div><div class="l">Rojo esperado</div></div>
    <div class="stat skip"><div class="n">${counts.skipped}</div><div class="l">Skipped</div></div>
  </div>
  <div class="bar">${seg('passed')}${seg('xfail')}${seg('skipped')}${seg('failed')}</div>
  ${summaryTxt ? `<p class="summary-txt">${mdLite(summaryTxt)}</p>` : ''}`;
}

/** Tags "Evidencia N" que enlazan al ancla #ev-N. `evNum` mapea file -> número. */
function evRefs(files, evNum) {
  return (files || [])
    .map((f) => (evNum.has(f) ? `<a class="evref" href="#ev-${evNum.get(f)}">Evidencia ${evNum.get(f)}</a>` : ''))
    .join('');
}

function renderTests(tests, evNum) {
  if (!tests.length) return '';
  const rows = tests
    .map((t) => {
      const st = normStatus(t.status);
      const refs = evRefs(t.evidence, evNum);
      return `<tr>
        <td><span class="tid">${esc(t.id || '—')}</span></td>
        <td>${esc(t.title || '')}
            ${t.notes ? `<div class="tnotes">${mdLite(t.notes)}</div>` : ''}
            ${refs ? `<div>${refs}</div>` : ''}</td>
        <td>${t.layer ? `<span class="chip">@${esc(t.layer)}</span>` : ''}</td>
        <td><span class="badge b-${st}">${STATUS_LABEL[st]}</span></td>
      </tr>`;
    })
    .join('');
  return `<table class="tests">
    <thead><tr><th>ID</th><th>Caso</th><th>Capa</th><th>Resultado</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderFindings(findings, evNum) {
  if (!findings.length) return '';
  return findings
    .map((f) => {
      const sev = normSeverity(f.severity);
      const refs = evRefs(f.evidence, evNum);
      const titleLink = f.url
        ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.id || 'hallazgo')}</a>`
        : esc(f.id || 'hallazgo');
      return `<div class="finding s-${sev}">
        <h3><span class="pill s-${sev}">${esc(sev)}</span>
          ${f.type ? `<span class="chip">${esc(f.type)}</span>` : ''}
          <span>${titleLink}${f.title ? ` — ${esc(f.title)}` : ''}</span></h3>
        ${f.description ? `<div class="desc">${mdLite(f.description)}</div>` : ''}
        ${refs ? `<div>${refs}</div>` : ''}
        ${f.recommendation ? `<div class="rec"><b>Recomendación:</b> ${mdLite(f.recommendation)}</div>` : ''}
      </div>`;
    })
    .join('');
}

/** Galería grande y numerada (cada evidencia una vez). `registry` = [{file,caption}]. */
function renderGallery(registry, baseDir, embed, outDir) {
  if (!registry.length) return '';
  return registry
    .map((e, i) => {
      const src = imgSrc(e.file, baseDir, embed, outDir);
      const body = src
        ? `<div class="frame"><img src="${src}" alt="${esc(e.caption)}"></div>`
        : `<div class="frame" style="padding:24px;text-align:center;color:#999">⚠ imagen no encontrada: ${esc(e.file)}</div>`;
      return `<figure class="shot" id="ev-${i + 1}">
        ${body}
        <figcaption><span class="num">Evidencia ${i + 1}.</span>${esc(e.caption)}</figcaption>
      </figure>`;
    })
    .join('');
}

function renderLogs(logs, baseDir) {
  if (!logs.length) return '';
  return logs
    .map((l) => {
      const content = l.file
        ? (() => {
            try {
              return fs.readFileSync(path.resolve(baseDir, l.file), 'utf8');
            } catch {
              return `(no se pudo leer ${l.file})`;
            }
          })()
        : l.content || '';
      return `<div class="log"><div class="lh">${esc(l.label || 'Log')}</div><pre>${esc(content)}</pre></div>`;
    })
    .join('');
}

/** Construye el registro de evidencias (orden: galería declarada -> referencias nuevas). */
function buildEvidenceRegistry(m) {
  const registry = [];
  const num = new Map(); // file -> número (1-based)
  const add = (file, caption) => {
    if (!file || num.has(file)) return;
    registry.push({ file, caption: caption || path.basename(file) });
    num.set(file, registry.length);
  };
  (m.evidence || []).forEach((e) => {
    const file = typeof e === 'string' ? e : e.file;
    const cap = typeof e === 'string' ? path.basename(file) : e.caption || path.basename(file);
    add(file, cap);
  });
  (m.findings || []).forEach((f) => (f.evidence || []).forEach((file) => add(file, f.title || path.basename(file))));
  (m.tests || []).forEach((t) => (t.evidence || []).forEach((file) => add(file, t.title || path.basename(file))));
  return { registry, num };
}

function buildHtml(m, opts) {
  const { baseDir, embed, outDir, css } = opts;
  const meta = m.meta || {};
  const tests = Array.isArray(m.tests) ? m.tests.slice() : [];
  const counts = { passed: 0, failed: 0, skipped: 0, xfail: 0 };
  tests.forEach((t) => { counts[normStatus(t.status)] += 1; });
  const total = tests.length;
  const findings = Array.isArray(m.findings) ? m.findings : [];
  const recs = Array.isArray(m.recommendations) ? m.recommendations : [];
  const scope = Array.isArray(m.scope) ? m.scope : [];
  const logs = Array.isArray(m.logs) ? m.logs : [];
  const { registry, num } = buildEvidenceRegistry(m);

  const metaRows = [
    ['Módulo', meta.module],
    ['Entorno', meta.environment],
    ['Fecha', meta.date],
    ['Responsable', meta.tester],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');

  const sec = (title, body, count) =>
    body ? `<section><h2>${esc(title)}${count != null ? ` <span class="count">(${count})</span>` : ''}</h2>${body}</section>` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'Informe de QA')}</title>
<style>${css}</style></head>
<body><div class="page">
  <header class="doc-head">
    <div class="kicker">Informe de QA · Evidencias</div>
    <h1>${esc(meta.title || 'Informe de QA')}</h1>
    ${meta.subtitle ? `<div class="sub">${esc(meta.subtitle)}</div>` : ''}
    ${metaRows ? `<table class="meta-table"><tbody>${metaRows}</tbody></table>` : ''}
  </header>

  ${sec('Resumen', renderSummary(counts, total, m.summary))}
  ${sec('Qué se probó', scope.length ? `<ul class="scope">${scope.map((s) => `<li>${mdLite(s)}</li>`).join('')}</ul>` : '')}
  ${sec('Resultados de los tests', renderTests(tests, num), total || null)}
  ${sec('Hallazgos', renderFindings(findings, num), findings.length || null)}
  ${sec('Recomendaciones', recs.length ? `<ol class="recs">${recs.map((r) => `<li>${mdLite(r)}</li>`).join('')}</ol>` : '')}
  ${sec('Evidencias', renderGallery(registry, baseDir, embed, outDir), registry.length || null)}
  ${sec('Logs', renderLogs(logs, baseDir))}

  <div class="foot">Generado por la skill <code>qa-report</code> · ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC</div>
</div></body></html>`;
}

// ---------------------------------------------------------------- main
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._.length) {
    console.log('Uso: node generate-report.js <manifest.json> [--out f.html] [--no-embed] [--playwright res.json] [--css f.css]');
    process.exit(args.help ? 0 : 1);
  }
  const manifestPath = path.resolve(args._[0]);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    die(`no se pudo leer/parsear el manifiesto: ${manifestPath} (${e.message})`);
  }
  const baseDir = path.dirname(manifestPath);
  if (!Array.isArray(manifest.tests)) manifest.tests = [];
  if (args.playwright) manifest.tests = mergePlaywright(manifest.tests, path.resolve(args.playwright));

  const outPath = path.resolve(args.out || path.join(baseDir, 'informe.html'));
  const outDir = path.dirname(outPath);
  const cssPath = args.css ? path.resolve(args.css) : path.join(__dirname, '..', 'templates', 'report.css');
  let css = '';
  try {
    css = fs.readFileSync(cssPath, 'utf8');
  } catch {
    die(`no se encontró la hoja de estilos: ${cssPath}`);
  }

  const html = buildHtml(manifest, { baseDir, embed: args.embed, outDir, css });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  const n = manifest.tests.length;
  const c = { passed: 0, failed: 0, skipped: 0, xfail: 0 };
  manifest.tests.forEach((t) => { c[normStatus(t.status)] += 1; });
  console.log(`qa-report: ${outPath}`);
  console.log(`  ${n} tests — ${c.passed} passed, ${c.failed} failed, ${c.xfail} rojo-esperado, ${c.skipped} skipped · ${(manifest.findings || []).length} hallazgos`);
}

main();
