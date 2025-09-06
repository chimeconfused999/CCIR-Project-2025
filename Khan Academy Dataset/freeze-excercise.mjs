// batch-freeze-tex.mjs
// Convert all legacy Khan "khan-exercises" HTML files to standalone .tex.
// Usage: node batch-freeze-tex.mjs khan-exercises-master/exercises formated-questions

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------- KA-STYLE COMPAT LAYER -------------------- */

// tiny underscore subset
const __ = {
  shuffle: (arr) => [...arr].sort(() => Math.random() - 0.5),
  range: (a, b, step = 1) => {
    if (b == null) { b = a; a = 0; }
    const out = [];
    for (let x = a; step > 0 ? x < b : x > b; x += step) out.push(x);
    return out;
  },
  sample: (arr) => arr[Math.floor(Math.random() * arr.length)],
  sum: (arr) => arr.reduce((s, x) => s + x, 0),
  sortBy: (arr, f) => [...arr].sort((x, y) => f(x) - f(y)),
  contains: (arr, v) => arr.includes(v),
  map: (arr, f) => arr.map(f),
  reduce: (arr, f, init) => arr.reduce(f, init),
};

// ✅ expose underscore-style name before helpers use it
const _ = __;

// fractions & number helpers
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }
function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }
function fractionReduce(n, d) { const g = gcd(n, d); let N = n / g, D = d / g; if (D < 0) { N = -N; D = -D; } return [N, D]; }
function reduce(a, b) { return fractionReduce(a, b); }
function fraction(n, d) { const [N, D] = fractionReduce(n, d); return D === 1 ? `${N}` : `\\frac{${N}}{${D}}`; }
function getLCM(...nums) { return nums.reduce((r, x) => lcm(r, x)); }
function getFactors(n) { n = Math.abs(n); const out = []; for (let i = 1; i * i <= n; i++) if (n % i === 0) out.push(i, n / i); return [...new Set(out)].sort((a, b) => a - b); }
function getPrime(n) { // quick & dirty prime
  function isPrime(x){ if (x<2) return false; for(let i=2;i*i<=x;i++) if(x%i===0) return false; return true; }
  let x = Math.floor(Math.random()*97)+3; while(!isPrime(x)) x++;
  return x;
}
function getPrimeFactorization(n) {
  n = Math.abs(n); const out = [];
  for (let p = 2; p * p <= n; p++) while (n % p === 0) { out.push(p); n /= p; }
  if (n > 1) out.push(n);
  return out;
}
function roundTo(x, d = 0) { const k = 10 ** d; return Math.round(x * k) / k; }
function floorTo(x, d = 0) { const k = 10 ** d; return Math.floor(x * k) / k; }
function localeToFixed(x, d = 0) {
  return Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function padDigitsToNum(n, len) { const s = Math.abs(n).toString().padStart(len, "0"); return (n < 0 ? "-" : "") + s; }
function truncate_to_max(s, max = 20) { s = String(s); return s.length <= max ? s : s.slice(0, max - 1) + "…"; }
function integerToDigits(n) { return String(Math.abs(n)).split("").map(Number); }
function isInt(n) { return Number.isInteger(n); }
function roundTowardsZero(n) { return n < 0 ? Math.ceil(n) : Math.floor(n); }

// randomizers
function rand(n) { return Math.floor(Math.random() * n); }
function randRange(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randRangeNonZero(a, b) { let x = 0; while (x === 0) x = randRange(a, b); return x; }
function randRangeExclude(a, b, ex) {
  const bad = Array.isArray(ex) ? new Set(ex) : new Set([ex]);
  let x; let tries = 0;
  do { x = randRange(a, b); if (++tries > 500) break; } while (bad.has(x));
  return x;
}
function randRangeUnique(a, b, count = 2) {
  const set = new Set(); let guard = 0;
  while (set.size < count && guard++ < 1000) set.add(randRange(a, b));
  return [...set];
}
function randRangeWeighted(a, b) { return randRange(a, b); } // light stub
function random() { return Math.random(); }

// arrays/strings/grammar
function shuffle(arr) { return __.shuffle(arr); }
function isSingular(n) { return n === 1; }
const Plural = (word) => ({ one: () => word, other: () => word + "s" });
const i18n = {
  ngettext: (sing, plur, n) => (n === 1 ? sing : plur),
  _: (s) => s,
};

// domain-ish stubs exercises sometimes reference
function complexNumber(a, b) { return `${a}${b >= 0 ? "+" : ""}${b}i`; }
function scientific(m, e) { return `${m} \\times 10^{${e}}`; }
function generateFunctionPath() { return "piecewise function"; }
function expr(x) { return String(x); }
function person() { return "Alex"; }
function school() { return "Riverview High"; }
function getCipherMessage(){ return "HELLOWORLD"; }
function animal(){ return "cat"; }
function animalAvgLifespan(){ return 15; }
function metricUnits(){ return ["mm","cm","m","km"]; }
function commonAngles(){ return [0, 30, 45, 60, 90, 120, 135, 150, 180]; }
function randomTriangleAngles(){ return [30, 60, 90]; }
function randomTriangle(){ return "triangle ABC"; }
function randomTriangleWithSides(){ return "triangle with sides 3,4,5"; }
function formattedSquareRootOf(n){ return `\\sqrt{${n}}`; }
function splitRadical(n){ return [1, n]; } // crude

// constants various files reference
const PI = Math.PI, BLUE = "blue", B = 1, M_FRAC = [1,1], M2_FRAC = [1,1], X_AXIS = "x", STD_FORM = "Ax+By=C";
const DIM_2 = 2, ROWS = 2, I = "i", D = 1, INDEX = 1, WHICH = 1, ORDER = 1, COEFF = 1;
// ---- Math wrappers many KA exercises call directly ----
const abs   = Math.abs;
const pow   = Math.pow;
const sqrt  = Math.sqrt;
const floor = Math.floor;
const ceil  = Math.ceil;
const round = Math.round;
const min   = Math.min;
const max   = Math.max;
const exp   = Math.exp;
const log   = Math.log;
const log10 = Math.log10 ? Math.log10 : (x)=>Math.log(x)/Math.LN10;
const sin   = Math.sin;
const cos   = Math.cos;
const tan   = Math.tan;
const atan  = Math.atan;
const atan2 = Math.atan2;

// Pick from array
function randFromArray(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// A few light stubs often referenced in var blocks
function decimalPlaceNames(){ return ["ones","tenths","hundredths","thousandths","ten-thousandths"]; }

// Provide KA’s historical util namespace used in some <var> code
const KhanUtil = {
  // random + picking
  randRange, randRangeNonZero, randRangeExclude, randRangeUnique, randRangeWeighted, random, shuffle, randFromArray,
  // arithmetic helpers
  gcd, lcm, getLCM, fractionReduce, reduce, fraction, getPrimeFactorization, getFactors,
  // number formatting
  roundTo, floorTo, localeToFixed, padDigitsToNum, integerToDigits, isInt, roundTowardsZero,
  // math wrappers
  abs, pow, sqrt, floor, ceil, round, min, max, exp, log, log10, sin, cos, tan, atan, atan2,
  // misc used in some hints
  formattedSquareRootOf, decimalPlaceNames,
};
const helpers = {
  // math & numbers
  gcd, lcm, fractionReduce, reduce, fraction, getLCM, getFactors, getPrime, getPrimeFactorization,
  roundTo, floorTo, localeToFixed, padDigitsToNum, truncate_to_max, integerToDigits, isInt, roundTowardsZero,
  // NEW: math wrappers
  abs, pow, sqrt, floor, ceil, round, min, max, exp, log, log10, sin, cos, tan, atan, atan2,

  // randomizers
  rand, randRange, randRangeNonZero, randRangeExclude, randRangeUnique, randRangeWeighted, random,
  // NEW: picker
  randFromArray,

  // arrays/underscore-ish
  _, __, shuffle, sum: __.sum, sortNumbers: (arr) => [...arr].sort((a,b)=>a-b),

  // grammar/i18n
  isSingular, Plural, i18n,

  // domain-ish
  complexNumber, scientific, decimalPlaceNames, generateFunctionPath, expr, person, school, getCipherMessage,
  animal, animalAvgLifespan, metricUnits, commonAngles, randomTriangleAngles, randomTriangle, randomTriangleWithSides,
  formattedSquareRootOf, splitRadical,

  // constants
  PI, BLUE, B, M_FRAC, M2_FRAC, X_AXIS, STD_FORM, DIM_2, ROWS, I, D, INDEX, WHICH, ORDER, COEFF,

  // NEW: expose historical namespace (some exercises call KhanUtil.xyz)
  KhanUtil,
};



/* -------------------- evaluator & extractors -------------------- */

function safeEval(expr, scope) {
  try {
    const names = [...Object.keys(helpers), ...Object.keys(scope)];
    const vals  = [...Object.values(helpers), ...Object.values(scope)];
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `"use strict"; return (${expr});`);
    const v = fn(...vals);
    if (typeof v === "undefined" || (typeof v === "number" && Number.isNaN(v))) throw new Error("bad");
    return v;
  } catch {
    return `[[${expr}]]`; // fallback: show marker instead of crashing
  }
}

function defineVars(dom) {
  const d = dom.window.document;
  const scope = {};

  // collect ALL var definitions with ids, anywhere in the doc
  const varNodes = [...d.querySelectorAll("var[id]")];

  // do several passes so later vars can depend on earlier ones
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (const node of varNodes) {
      const id = node.getAttribute("id");
      const code = (node.textContent || "").trim();
      const val = safeEval(code, scope);
      if (scope[id] !== val) { scope[id] = val; changed = true; }
    }
    if (!changed) break;
  }

  // honor any data-ensure gates (if present)
  const ensureHosts = [...d.querySelectorAll("[data-ensure]")];
  for (const host of ensureHosts) {
    const ensure = host.getAttribute("data-ensure")?.trim();
    if (!ensure) continue;
    for (let i = 0; i < 50; i++) {
      const ok = safeEval(ensure, scope);
      if (typeof ok === "boolean" ? ok : true) break;
      // re-roll vars that look random
      for (const node of varNodes) {
        if (/\brand|random/i.test(node.textContent || "")) {
          const id = node.getAttribute("id");
          scope[id] = safeEval((node.textContent || "").trim(), scope);
        }
      }
    }
  }
  return scope;
}

function inlineReplace(dom, scope) {
  const d = dom.window.document;

  // drop Graphie
  d.querySelectorAll(".graphie, .graphie-label").forEach(n => n.remove());

  // data-if blocks
  d.querySelectorAll("[data-if]").forEach(n => {
    const cond = safeEval(n.getAttribute("data-if") || "true", scope);
    if (!(typeof cond === "boolean" ? cond : true)) n.remove();
  });

  // inline <var>EXPR</var>
  d.querySelectorAll("var:not([id])").forEach(node => {
    const expr = (node.textContent || "").trim();
    let v = safeEval(expr, scope);
    if (Array.isArray(v)) v = v.join(", ");
    node.replaceWith(d.createTextNode(String(v)));
  });

  // pick one active .problem variant
  const allProblems = [...d.querySelectorAll(".problems .problem")];
  const active = allProblems.find(p => {
    const cond = p.getAttribute("data-if");
    if (!cond) return true;
    const ok = safeEval(cond, scope);
    return (typeof ok === "boolean" ? ok : true);
  }) || null;

  const pick = (sel, root = d) => root?.querySelector(sel)?.textContent?.trim() || "";

  const title =
    d.querySelector("title")?.textContent?.trim() ||
    d.querySelector(".exercise")?.getAttribute("data-name") ||
    "Exercise";

  const question = active ? pick(".question", active) : pick(".question");
  const solution = active ? pick(".solution", active) : pick(".solution");
  const hints = (active ? [...active.querySelectorAll(".hints > *")] : [...d.querySelectorAll(".hints > *")])
    .map(n => n.textContent.trim())
    .filter(Boolean);

  return { title, question, solution, hints };
}

/* ---- LaTeX wrapping/escaping ---- */
function latexifyInline(s) {
  if (!s) return s;

  // Convert \( ... \) and \[ ... \] to $...$ / $$...$$
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`);
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$${inner}$$`);

  // Replace eqnarray blocks with aligned + ensure $$ ... $$
  s = s.replace(/\\begin\{eqnarray\*?\}/g, '$$\\begin{aligned}');
  s = s.replace(/\\end\{eqnarray\*?\}/g, '\\end{aligned}$$');

  // Ensure |...|, \sqrt, \frac are inside math
  s = s.replace(/\\lvert\s*([^$\\]+?)\s*\\rvert/g, (_m, inner) => `$\\lvert ${inner.trim()} \\rvert$`);
  s = s.replace(/(^|[^\$])\|\s*([^\|$]+?)\s*\|([^\$]|$)/g,
    (_m, pre, inner, post) => `${pre}$| ${inner.trim()} |$${post}`);
  s = s.replace(/(?<!\$)\\d?frac\{([^}]+)\}\{([^}]+)\}(?!\$)/g, (_m,a,b) => `$\\frac{${a}}{${b}}$`);
  s = s.replace(/(?<!\$)\\sqrt\{([^}]+)\}(?!\$)/g, (_m,a) => `$\\sqrt{${a}}$`);

  // Common math tokens that sometimes show up bare
  s = s.replace(/(?<!\$)\\cdot(?![a-zA-Z])/g, '$\\cdot$');
  s = s.replace(/(?<!\$)\\times(?![a-zA-Z])/g, '$\\times$');
  s = s.replace(/(?<!\$)\\pm(?![a-zA-Z])/g, '$\\pm$');

  // Unicode minus -> ASCII
  s = s.replace(/\u2212/g, "-");
  return s;
}

function escapeOutsideMath(s) {
  if (!s) return s;
  const parts = s.split("$");
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) out += "$" + parts[i] + "$"; // keep math untouched
    else {
      out += parts[i]
        .replace(/\\/g, "\\textbackslash{}")
        .replace(/([#%&_{}])/g, "\\$1")
        .replace(/~/g, "\\textasciitilde{}")
        .replace(/\^/g, "\\textasciicircum{}");
    }
  }
  return out;
}

function toLaTeX({ title, question, solution, hints }) {
  const T = escapeOutsideMath(latexifyInline(title));
  const Q = escapeOutsideMath(latexifyInline(question));
  const A = escapeOutsideMath(latexifyInline(solution));
  const H = hints.map(h => escapeOutsideMath(latexifyInline(h)));

  return String.raw`% Auto-converted from khan-exercises
\documentclass{article}
\usepackage{amsmath,amssymb}
\usepackage[T1]{fontenc}
\usepackage{textcomp}
\newcommand{\abs}[1]{\lvert #1\rvert}

\begin{document}
\section*{${T}}
\textbf{Question.} ${Q}

\textbf{Answer.} ${A}

\textbf{Hints.}
\begin{itemize}
${H.map(x => `  \\item ${x}`).join("\n")}
\end{itemize}
\end{document}
`;
}

/* --------- walk directory & process all .html --------- */
async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && p.toLowerCase().endsWith(".html")) yield p;
  }
}

async function main() {
  const inDir  = process.argv[2] || path.join(__dirname, "khan-exercises-master", "exercises");
  const outDir = process.argv[3] || path.join(__dirname, "formated-questions"); // (spelled as requested)
  await fsp.mkdir(outDir, { recursive: true });

  let ok = 0, fail = 0;
  for await (const file of walk(inDir)) {
    const rel  = path.relative(inDir, file);
    const base = rel.replace(/\\/g, "/").replace(/\.html$/i, ".tex");
    const outPath = path.join(outDir, base);
    await fsp.mkdir(path.dirname(outPath), { recursive: true });

    try {
      const html = await fsp.readFile(file, "utf8");
      const dom  = new JSDOM(html);
      const scope = defineVars(dom);
      const extracted = inlineReplace(dom, scope);
      const tex = toLaTeX(extracted);
      await fsp.writeFile(outPath, tex, "utf8");
      console.log(`✓ ${base}`);
      ok++;
    } catch (err) {
      console.error(`✗ ${rel}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone. Wrote ${ok} .tex file(s) to ${outDir}${fail ? ` (failed: ${fail})` : ""}`);
}

main().catch(e => { console.error(e); process.exit(1); });
