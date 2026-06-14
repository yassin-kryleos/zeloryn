/*
 * One-off generator: emits CSS for the Tailwind-style utility classes used in
 * the .tsx components but missing from src/index.css. The app does NOT run
 * Tailwind — index.css is a hand-curated utility layer with !important. This
 * script extends that layer deterministically (standard Tailwind palette
 * values) so the ~350 colour/spacing/state utilities the components already
 * reference actually render, without introducing Tailwind preflight.
 *
 * Re-runnable: it replaces the block between the GEN markers in index.css.
 * Run: node scripts/gen-utilities.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'src', 'index.css');
const SRC = path.join(ROOT, 'src');

// --- Standard Tailwind palette (subset actually referenced) ---
const PALETTE = {
  amber: { 100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f',950:'#451a03' },
  cyan:  { 300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',950:'#083344' },
  emerald:{100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',800:'#065f46',900:'#064e3b',950:'#022c22' },
  green: { 950:'#052e16' },
  indigo:{ 100:'#e0e7ff',200:'#c7d2fe',500:'#6366f1',800:'#3730a3',900:'#312e81',950:'#1e1b4b' },
  blue:  { 100:'#dbeafe',500:'#3b82f6',800:'#1e40af',900:'#1e3a8a' },
  red:   { 200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d',950:'#450a0a' },
  purple:{ 400:'#c084fc',800:'#6b21a8' },
};
// matrix-* CSS-var colours, with raw RGB for fractional-opacity rgba().
const MATRIX = {
  'matrix-neon':      { var:'--matrix-neon', rgb:'0,255,102' },
  'matrix-dim':       { var:'--matrix-dim', rgb:'74,222,128' },
  'matrix-dark':      { var:'--matrix-dark', rgb:'39,39,42' },
  'matrix-very-dark': { var:'--matrix-very-dark', rgb:'24,24,27' },
  'matrix-red':       { var:'--matrix-red', rgb:'239,68,68' },
  'matrix-amber':     { var:'--matrix-amber', rgb:'245,158,11' },
  'matrix-text':      { var:'--matrix-text', rgb:'244,244,245' },
};
const SP = (n) => ({ '0':'0','0.2':'0.05rem','0.5':'0.125rem','1':'0.25rem','1.5':'0.375rem','2':'0.5rem','2.5':'0.625rem','3':'0.75rem','3.5':'0.875rem','4':'1rem','5':'1.25rem','6':'1.5rem','8':'2rem','10':'2.5rem','14':'3.5rem','16':'4rem','20':'5rem','40':'10rem' }[n]);
const SIZE = (n) => ({ '1.5':'0.375rem','2':'0.5rem','3':'0.75rem','3.5':'0.875rem','4':'1rem','5':'1.25rem','6':'1.5rem','14':'3.5rem','px':'1px' }[n]);

// Escape CSS selector special chars, INCLUDING commas — an unescaped comma in a
// class name (e.g. shadow-[...rgba(0,0,0,.5)]) is read as a selector-list
// separator and breaks the minifier ("Invalid empty selector").
function esc(cls){ return cls.replace(/([:./[\]()%#,])/g, '\\$1'); }
// Readability floor for tiny inline font sizes used across the components.
function clampFont(px){
  const n = parseFloat(px);
  if (n <= 8.5) return 10.5;
  if (n <= 9.5) return 11;
  if (n <= 10.5) return 11.5;
  if (n <= 11.5) return 12;
  if (n <= 12) return 12.5;
  return n;
}
function colorHex(name){
  // name like "amber-500" or "matrix-neon" optionally with /opacity handled by caller
  if (MATRIX[name]) return `var(${MATRIX[name].var})`;
  const [fam, shade] = name.split('-');
  return PALETTE[fam] && PALETTE[fam][shade];
}
function colorRgba(name, op){
  const a = (parseInt(op,10)/100).toString();
  if (MATRIX[name]) return `rgba(${MATRIX[name].rgb},${a})`;
  const hex = colorHex(name);
  if (!hex || hex.startsWith('var')) return null;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// Collect all class tokens used in components.
function collectClasses(){
  const out = new Set();
  (function walk(d){
    for (const e of fs.readdirSync(d, { withFileTypes:true })){
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.tsx')){
        const txt = fs.readFileSync(p,'utf8');
        const re = /className="([^"]*)"/g; let m;
        while ((m = re.exec(txt))){
          for (const tok of m[1].split(/\s+/)) if (tok && !/[${}]/.test(tok)) out.add(tok);
        }
      }
    }
  })(SRC);
  return out;
}

const existingCss = fs.readFileSync(CSS,'utf8');
// For "already defined" checks, ignore this generator's own prior output block
// so re-runs regenerate everything instead of skipping it as pre-existing.
const GEN_RE = /\/\* === GEN:UTILITIES START[\s\S]*?GEN:UTILITIES END === \*\//;
const handCss = existingCss.replace(GEN_RE, '');
function alreadyDefined(cls){
  // The CSS file stores selectors CSS-escaped (e.g. `.h-\[80vh\]`). Match the
  // escaped selector followed by a selector-boundary char — literal search,
  // no regex, so arbitrary-value classes like max-w-[calc(...)] are safe.
  const sel = '.' + esc(cls);
  for (const b of [' ', '{', ':', ',', '>', '\n', '\r', '\t']){
    if (handCss.includes(sel + b)) return true;
  }
  return false;
}

// Produce the declaration body for a *base* utility (no variant prefix).
function decl(cls){
  let m;
  // opacity modifiers first (else the colour regex captures "opacity-NN" as a fake colour)
  if ((m = cls.match(/^bg-opacity-(\d+)$/))) return `background-color:rgba(0,0,0,${(+m[1]/100)})!important;`;
  if ((m = cls.match(/^border-opacity-(\d+)$/))) return null; // colours carry their own alpha
  // bare directional borders / keywords first (else "border-b-0" parses as colour "b-0")
  if (cls === 'flex-row') return 'flex-direction:row!important;';
  if (cls === 'border-l') return 'border-left:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-r') return 'border-right:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-b') return 'border-bottom:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-b-0') return 'border-bottom-width:0!important;';
  if (cls === 'border-t-0') return 'border-top-width:0!important;';
  if (cls === 'outline-none') return 'outline:none!important;';
  if (cls === 'h-auto') return 'height:auto!important;';
  // colours: bg-/text-/border-/border-l- with optional /opacity
  if ((m = cls.match(/^(bg|text|border|border-l|border-t|accent)-([a-z]+-\d+|matrix-[a-z-]+|black|white)(?:\/(\d+))?$/))){
    const [, kind, name, op] = m;
    let val;
    if (name === 'black') val = op ? `rgba(0,0,0,${(+op/100)})` : '#000';
    else if (name === 'white') val = op ? `rgba(255,255,255,${(+op/100)})` : '#fff';
    else if (op) val = colorRgba(name, op);
    else val = colorHex(name);
    if (!val) return null;
    if (kind === 'bg') return `background-color:${val}!important;`;
    if (kind === 'text') return `color:${val}!important;`;
    if (kind === 'accent') return `accent-color:${val}!important;`;
    if (kind === 'border') return `border-color:${val}!important;`;
    if (kind === 'border-l') return `border-left-color:${val}!important;`;
    if (kind === 'border-t') return `border-top-color:${val}!important;`;
  }
  // text-[..] arbitrary, with a readability floor (desktop min ~10.5px).
  // Components lean heavily on 7–10px text; raise it without touching 600 call sites.
  if ((m = cls.match(/^text-\[([0-9.]+)px\]$/))) return `font-size:${clampFont(m[1])}px!important;`;
  if ((m = cls.match(/^text-\[(#[0-9a-fA-F]+)\]$/))) return `color:${m[1]}!important;`;
  if (cls === 'text-2xl') return 'font-size:1.5rem!important;line-height:2rem!important;';
  if (cls === 'text-right') return 'text-align:right!important;';
  if (cls === 'tracking-wide') return 'letter-spacing:0.025em!important;';
  if (cls === 'leading-tight') return 'line-height:1.25!important;';
  if (cls === 'underline') return 'text-decoration-line:underline!important;';
  if (cls === 'font-normal') return 'font-weight:400!important;';
  if (cls === 'font-extrabold') return 'font-weight:800!important;';
  if (cls === 'font-sans') return 'font-family:var(--font-sans)!important;';
  if (cls === 'font-header') return 'font-family:var(--font-sans)!important;';
  if (cls === 'break-words') return 'overflow-wrap:break-word!important;word-break:break-word!important;';
  if (cls === 'text-ellipsis') return 'text-overflow:ellipsis!important;';
  if (cls === 'line-clamp-1' || cls === 'line-clamp-2') return `display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:${cls.slice(-1)}!important;overflow:hidden!important;`;
  if (cls === 'list-disc') return 'list-style-type:disc!important;';
  // spacing
  if ((m = cls.match(/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(\d+(?:\.\d+)?)$/))){
    const v = SP(m[2]); if (v == null) return null;
    const map = { p:['padding'], px:['padding-left','padding-right'], py:['padding-top','padding-bottom'], pt:['padding-top'], pb:['padding-bottom'], pl:['padding-left'], pr:['padding-right'], m:['margin'], mx:['margin-left','margin-right'], my:['margin-top','margin-bottom'], mt:['margin-top'], mb:['margin-bottom'], ml:['margin-left'], mr:['margin-right'] };
    return map[m[1]].map(p=>`${p}:${v}!important;`).join('');
  }
  if ((m = cls.match(/^py-0\.2$/))) return 'padding-top:0.05rem!important;padding-bottom:0.05rem!important;';
  if ((m = cls.match(/^gap-(\d+(?:\.\d+)?)$/))){ const v=SP(m[1]); return v?`gap:${v}!important;`:null; }
  if ((m = cls.match(/^space-y-(\d+(?:\.\d+)?)$/))){ const v=SP(m[1]); return v?null:null; } // handled specially below
  // sizing h-/w-
  if ((m = cls.match(/^(h|w|max-h|min-h|max-w|min-w)-(\d+(?:\.\d+)?|px|full|auto)$/))){
    const prop = { h:'height', w:'width', 'max-h':'max-height', 'min-h':'min-height', 'max-w':'max-width', 'min-w':'min-width' }[m[1]];
    let v = m[2]==='full'?'100%':m[2]==='auto'?'auto':SIZE(m[2]); if (v==null) v = SP(m[2]); if (v==null) return null;
    return `${prop}:${v}!important;`;
  }
  if ((m = cls.match(/^(h|w|max-h|min-h|max-w|min-w)-\[([^\]]+)\]$/))){
    const prop = { h:'height', w:'width', 'max-h':'max-height', 'min-h':'min-height', 'max-w':'max-width', 'min-w':'min-width' }[m[1]];
    return `${prop}:${m[2].replace(/_/g,' ')}!important;`;
  }
  if (cls === 'max-w-sm') return 'max-width:24rem!important;';
  if (cls === 'max-w-md') return 'max-width:28rem!important;';
  if (cls === 'max-w-lg') return 'max-width:32rem!important;';
  if (cls === 'max-w-xl') return 'max-width:36rem!important;';
  if (cls === 'max-w-2xl') return 'max-width:42rem!important;';
  if (cls === 'max-h-full') return 'max-height:100%!important;';
  if (cls === 'min-w-full') return 'min-width:100%!important;';
  // directional borders (used bare and behind lg:)
  if (cls === 'flex-row') return 'flex-direction:row!important;';
  if (cls === 'border-l') return 'border-left:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-r') return 'border-right:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-b') return 'border-bottom:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-b-0') return 'border-bottom-width:0!important;';
  if (cls === 'border-t-0') return 'border-top-width:0!important;';
  if (cls === 'outline-none') return 'outline:none!important;';
  if (cls === 'h-auto') return 'height:auto!important;';
  // display/layout
  if (cls === 'block') return 'display:block!important;';
  if (cls === 'inline-flex') return 'display:inline-flex!important;';
  if (cls === 'flex-wrap') return 'flex-wrap:wrap!important;';
  if (cls === 'items-end') return 'align-items:flex-end!important;';
  if (cls === 'self-center') return 'align-self:center!important;';
  if (cls === 'self-end') return 'align-self:flex-end!important;';
  if (cls === 'mt-auto') return 'margin-top:auto!important;';
  if (cls === 'min-w-0') return 'min-width:0!important;';
  if (cls === 'min-h-0') return 'min-height:0!important;';
  if (cls === 'overflow-visible') return 'overflow:visible!important;';
  if (cls === 'sticky') return 'position:sticky!important;';
  if (cls === 'resize-none') return 'resize:none!important;';
  if (cls === 'resize-y') return 'resize:vertical!important;';
  if (cls === 'select-all') return 'user-select:all!important;';
  if (cls === 'shrink-0') return 'flex-shrink:0!important;';
  if ((m = cls.match(/^col-span-(\d+)$/))) return `grid-column:span ${m[1]}/span ${m[1]}!important;`;
  if (cls === 'grid-cols-2') return 'grid-template-columns:repeat(2,minmax(0,1fr))!important;';
  if (cls === 'grid-cols-4') return 'grid-template-columns:repeat(4,minmax(0,1fr))!important;';
  if ((m = cls.match(/^grid-cols-\[([^\]]+)\]$/))) return `grid-template-columns:${m[1].replace(/_/g,' ')}!important;`;
  // position
  if (cls === 'top-0') return 'top:0!important;';
  if (cls === 'left-0') return 'left:0!important;';
  if ((m = cls.match(/^(top|left|right|bottom)-(\d+)$/))) return `${m[1]}:${SP(m[2])}!important;`;
  if ((m = cls.match(/^(top|left|right|bottom)-\[([^\]]+)\]$/))) return `${m[1]}:${m[2]}!important;`;
  if ((m = cls.match(/^z-\[(\d+)\]$/))) return `z-index:${m[1]}!important;`;
  // borders
  if (cls === 'border-0') return 'border:0!important;';
  if (cls === 'border-2') return 'border-width:2px!important;';
  if (cls === 'border-t') return 'border-top:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-y') return 'border-top:1px solid var(--matrix-dark)!important;border-bottom:1px solid var(--matrix-dark)!important;';
  if (cls === 'border-t-transparent') return 'border-top-color:transparent!important;';
  if (cls === 'border-dashed') return 'border-style:dashed!important;';
  if (cls === 'border-collapse') return 'border-collapse:collapse!important;';
  if (cls === 'rounded-full') return 'border-radius:9999px!important;';
  if (cls === 'rounded-sm') return 'border-radius:2px!important;';
  // effects
  if (cls === 'shadow-lg') return 'box-shadow:0 10px 15px -3px rgba(0,0,0,0.4),0 4px 6px -4px rgba(0,0,0,0.4)!important;';
  if (cls === 'shadow-2xl') return 'box-shadow:0 25px 50px -12px rgba(0,0,0,0.6)!important;';
  if ((m = cls.match(/^shadow-\[([^\]]+)\]$/))) return `box-shadow:${m[1].replace(/_/g,' ')}!important;`;
  if ((m = cls.match(/^opacity-(\d+)$/))) return `opacity:${(+m[1]/100)}!important;`;
  if (cls === 'transition-opacity') return 'transition-property:opacity!important;transition-duration:0.15s!important;';
  if (cls === 'animate-none') return 'animation:none!important;';
  if (cls === 'bg-transparent') return 'background-color:transparent!important;';
  // bg-opacity-N → approximate as panel bg alpha
  if ((m = cls.match(/^bg-opacity-(\d+)$/))) return `background-color:rgba(0,0,0,${(+m[1]/100)})!important;`;
  if ((m = cls.match(/^border-opacity-(\d+)$/))) return null; // no-op; colours carry their own alpha
  return null;
}

const STATE = {
  'hover:':   (sel)=>`${sel}:hover`,
  'focus:':   (sel)=>`${sel}:focus`,
  'active:':  (sel)=>`${sel}:active`,
  'disabled:':(sel)=>`${sel}:disabled`,
  'last:':    (sel)=>`${sel}:last-child`,
  'placeholder:':(sel)=>`${sel}::placeholder`,
  'group-hover:':(sel)=>`.group:hover ${sel}`,
  'dark:':    (sel)=>sel,            // default theme is dark
  'lg:':      (sel)=>sel,            // desktop-first app; treat as base
};
// extra state base decls not covered by decl()
function stateDecl(rest){
  if (rest === 'cursor-not-allowed') return 'cursor:not-allowed!important;';
  if (rest === 'cursor-grabbing') return 'cursor:grabbing!important;';
  if (rest === 'pointer-events-none') return 'pointer-events:none!important;';
  if (rest === 'outline-none') return 'outline:none!important;';
  if (rest === 'ring-0') return 'box-shadow:none!important;';
  if (rest === 'underline') return 'text-decoration-line:underline!important;';
  if (rest === 'opacity-100') return 'opacity:1!important;';
  if (rest === 'stroke-opacity-80') return 'stroke-opacity:0.8!important;';
  if ((m = rest.match(/^opacity-(\d+)$/))) return `opacity:${(+m[1]/100)}!important;`;
  return decl(rest);
}

const used = collectClasses();
const rules = [];
const skipped = [];
let m;
for (const cls of [...used].sort()){
  if (alreadyDefined(cls)) continue;
  // variant?
  const vi = cls.indexOf(':');
  if (vi !== -1){
    const prefix = cls.slice(0, vi+1);
    const rest = cls.slice(vi+1);
    const wrap = STATE[prefix];
    if (!wrap) { skipped.push(cls); continue; }
    let body; let mm;
    if ((mm = rest.match(/^opacity-(\d+)$/))) body = `opacity:${(+mm[1]/100)}!important;`;
    else if (rest === 'cursor-not-allowed') body='cursor:not-allowed!important;';
    else if (rest === 'cursor-grabbing') body='cursor:grabbing!important;';
    else if (rest === 'pointer-events-none') body='pointer-events:none!important;';
    else if (rest === 'outline-none') body='outline:none!important;';
    else if (rest === 'ring-0') body='box-shadow:none!important;';
    else if (rest === 'underline') body='text-decoration-line:underline!important;';
    else if (rest === 'stroke-opacity-80') body='stroke-opacity:0.8!important;';
    else body = decl(rest);
    if (!body) { skipped.push(cls); continue; }
    rules.push(`.${esc(cls)}${''}${(()=>'')()} { }`.replace('.'+esc(cls)+' { }', `${wrap('.'+esc(cls))} { ${body} }`));
    continue;
  }
  // space-y-N special (margin-top on children)
  if ((m = cls.match(/^space-y-(\d+(?:\.\d+)?)$/))){
    const v = SP(m[1]); if (v==null){ skipped.push(cls); continue; }
    rules.push(`.${esc(cls)} > * + * { margin-top:${v}!important; }`);
    continue;
  }
  const body = decl(cls);
  if (!body){ skipped.push(cls); continue; }
  rules.push(`.${esc(cls)} { ${body} }`);
}

// Fixed supplements: keyframe-based or semantic classes that don't fit the
// pattern generator.
const SUPPLEMENT = [
  '@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }',
  '.animate-ping { animation: ping 1s cubic-bezier(0,0,0.2,1) infinite !important; }',
  '.matrix-panel { background: var(--matrix-panel-bg) !important; border: 1px solid var(--border-color) !important; border-radius: 8px !important; }',
];
for (const s of SUPPLEMENT){
  const m2 = s.match(/^\.([A-Za-z0-9-]+)/);
  if (m2 && alreadyDefined(m2[1])) continue;
  rules.push(s);
}

const START = '/* === GEN:UTILITIES START (scripts/gen-utilities.cjs) === */';
const END = '/* === GEN:UTILITIES END === */';
const block = `${START}\n${rules.join('\n')}\n${END}\n`;

let css = existingCss;
const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\n?');
css = re.test(css) ? css.replace(re, block) : css.trimEnd() + '\n\n' + block;
fs.writeFileSync(CSS, css, 'utf8');

console.log(`Generated ${rules.length} utility rules.`);
console.log(`Skipped ${skipped.length}:`, skipped.join(' '));
