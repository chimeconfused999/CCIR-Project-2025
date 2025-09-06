// make-html-gallery.mjs
// Convert formated-questions/*.tex -> gallery/html/*.html using KaTeX,
// then build gallery/index.html that lists them all.
// Usage: node make-html-gallery.mjs
// Requires: pandoc (on PATH). Optional env vars: SRC_DIR, OUT_DIR, PANDOC_EXE, KATEX_CDN.

import { execFile } from "child_process";
import fsp from "fs/promises";
import path from "path";

const SRC_DIR   = process.env.SRC_DIR   || "formated-questions";
const OUT_DIR   = process.env.OUT_DIR   || "gallery";
const HTML_DIR  = path.join(OUT_DIR, "html");
const PANDOC    = process.env.PANDOC_EXE || "pandoc";
const KATEX_CDN = process.env.KATEX_CDN  || ""; // e.g., "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist"

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout.trim());
    });
  });
}

async function* walk(dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && p.toLowerCase().endsWith(".tex")) yield p;
  }
}

async function main() {
  await fsp.mkdir(HTML_DIR, { recursive: true });

  // sanity-check pandoc
  try { await run(PANDOC, ["-v"]); }
  catch (e) {
    console.error("Pandoc not found. Install it or set PANDOC_EXE.");
    console.error('Windows example:  setx PANDOC_EXE "C:\\\\Program Files\\\\Pandoc\\\\pandoc.exe"');
    throw e;
  }

  const items = [];

  for await (const texPath of walk(SRC_DIR)) {
    const rel      = path.relative(SRC_DIR, texPath);
    const baseHtml = rel.replace(/\.tex$/i, ".html");
    const outPath  = path.join(HTML_DIR, baseHtml);
    await fsp.mkdir(path.dirname(outPath), { recursive: true });

    const katexFlag = KATEX_CDN ? `--katex=${KATEX_CDN}` : "--katex";

    try {
      await run(PANDOC, [texPath, "-s", katexFlag, "-o", outPath]);

      // Build a forward-slash href for browsers (Windows-safe)
      const href = "html/" + baseHtml.replace(/\\/g, "/");
      const display = href.startsWith("html/") ? href.slice(5) : href;

      items.push({
        title: path.basename(rel, ".tex"),
        href,
        display,
      });

      console.log("✓", baseHtml);
    } catch (e) {
      console.warn("✗", baseHtml, "-", e.message);
      // continue; we'll still write index.html
    }
  }

  const index = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LaTeX Gallery (KaTeX)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- KaTeX for the index page (each generated HTML already includes KaTeX via Pandoc) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
          onload="renderMathInElement(document.body,{delimiters:[
            {left:'$$',right:'$$',display:true},
            {left:'$',right:'$',display:false},
            {left:'\\\\(',right:'\\\\)',display:false},
            {left:'\\\\[',right:'\\\\]',display:true}
          ]});"></script>
  <style>
    :root { --gap:16px; --bg:#0b0f19; --fg:#e7eaf3; --card:#131a2a; --muted:#9aa4b2; }
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--fg);font:16px system-ui,-apple-system,Segoe UI,Roboto,Arial}
    header.top{display:flex;align-items:center;gap:12px;padding:14px 16px}
    h1{font-size:18px;margin:0}
    input#q{flex:1;max-width:520px;padding:10px 12px;border-radius:10px;border:1px solid #2a3550;background:#0f1524;color:var(--fg)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:var(--gap);padding:var(--gap)}
    .card{background:var(--card);border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.25);padding:10px;display:flex;flex-direction:column}
    .card h2{font-size:15px;margin:4px 6px 6px}
    .card .path{color:var(--muted);font-size:12px;margin:0 6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .card iframe{width:100%;height:420px;border:0;background:#fff;border-radius:10px}
    .open{display:inline-block;margin:8px 6px 4px;color:#9cd1ff;text-decoration:none}
    .open:hover{text-decoration:underline}
    .hidden{display:none!important}
  </style>
</head>
<body>
  <header class="top">
    <h1>LaTeX Gallery (KaTeX) — ${items.length} files</h1>
    <input id="q" placeholder="Filter by name… (e.g., fractions, parabola, angles)" />
  </header>
  <div class="grid" id="grid">
    ${items.map(it => `
      <section class="card" data-title="${it.title.toLowerCase()}">
        <h2>${it.title}</h2>
        <div class="path">${it.display}</div>
        <iframe src="${it.href}" loading="lazy"></iframe>
        <a class="open" href="${it.href}" target="_blank" rel="noopener">Open</a>
      </section>`).join("")}
  </div>
  <script>
    const q = document.getElementById('q');
    const cards = [...document.querySelectorAll('.card')];
    q.addEventListener('input', () => {
      const s = q.value.trim().toLowerCase();
      cards.forEach(c => c.classList.toggle('hidden', s && !c.dataset.title.includes(s)));
    });
  </script>
</body>
</html>`;

  await fsp.mkdir(OUT_DIR, { recursive: true });
  await fsp.writeFile(path.join(OUT_DIR, "index.html"), index, "utf8");

  console.log(`\nOpen: ${path.join(OUT_DIR, "index.html")}`);
}

main().catch(e => (console.error(e.message), process.exit(1)));
