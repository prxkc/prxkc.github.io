// Paper letters on a sunlit wall.
//
// Every label you can press is set in letters of paper stuck to the wall.
// Point at one and its letters lift towards your hand, throwing shadows down
// and to the right, away from the window, like everything else on this wall.
// The scene uses those shadows to hold back only the sunlight, so a letter's
// shadow fades wherever a leaf already shades the wall. Brush across a word
// and its letters swing; press and they flatten against the wall; let go and
// a breeze from the window flutters them, and the leaves outside, before they
// settle. When a label changes its words (copy, the blind, the clock), the old
// letters blow off the wall and the new ones land.
//
// Each letter is two spans: the outer keeps its place in the line and is the
// one measured; the inner carries the ink and all of the motion.
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const LABELS = '.site-name a, .index a, .home__links a, .link-text, .arrow, .cord, .copy, #clock-time, #clock-light';
const REACH = 26;           // how far along a word the pull of a hand is felt, in px
const SHADOW = [2.8, 4.2];  // how far a shadow travels per unit of lift, in px: away from the sun
const SIZE = [512, 256];    // the shadow canvas, in CSS px when nothing needs squeezing in

// The scene samples `canvas` over `rect` (x, y, width, height of the viewport,
// in CSS px) whenever `version` changes. `light` is set by the scene while its
// sunlight can carry the shadows; until then the canvas is shown on the page.
export const paperShadow = { canvas: document.createElement('canvas'), rect: [0, 0, ...SIZE], version: 0, active: false, light: false };
const shade = paperShadow.canvas;
[shade.width, shade.height] = SIZE;
shade.className = 'paper-shade';
shade.setAttribute('aria-hidden', 'true');
shade.hidden = true;
document.body.append(shade);
const pen = shade.getContext('2d');

const records = new Map(); // label element → its letters
const groups = new Map();  // pressable element → its labels and what the pointer is doing
const awake = new Set();
let drifting = [];         // letters blowing off a label that changed its words
let frame = 0, last = 0;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Words stay whole when a line wraps; screen readers get the plain text.
function lay(record, text) {
  const { el } = record;
  const paper = document.createElement('span');
  paper.className = 'paper';
  paper.setAttribute('aria-hidden', 'true');
  const letters = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { paper.append(part); continue; }
    const word = document.createElement('span');
    word.className = 'paper__word';
    for (const char of part) {
      const box = document.createElement('span');
      const ink = document.createElement('span');
      box.className = 'paper__char';
      ink.className = 'paper__ink';
      ink.textContent = char;
      box.append(ink);
      word.append(box);
      letters.push({ box, ink, char, record, lift: 0, liftV: 0, ang: 0, angV: 0, show: 1, wait: 0, kick: null, x: 0, y: 0, w: 0, h: 0 });
    }
    paper.append(word);
  }
  el.textContent = '';
  if (!el.closest('[aria-hidden="true"]')) {
    const words = document.createElement('span');
    words.className = 'visually-hidden';
    words.textContent = text;
    el.append(words);
  }
  el.append(paper);
  el.dataset.paperText = text;
  return letters;
}

function relink(group) {
  group.letters = group.records.flatMap(record => record.letters);
}

// Font and baseline for drawing a letter's shadow, measured once per label.
function measure(record) {
  if (!record.metrics) {
    const style = getComputedStyle(record.el);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const size = parseFloat(style.fontSize);
    pen.font = font;
    const sample = pen.measureText('Hg');
    record.metrics = { font, asc: sample.fontBoundingBoxAscent || size * 0.97, desc: sample.fontBoundingBoxDescent || size * 0.24 };
  }
  return record.metrics;
}

function wake(group) {
  if (reduce.matches) return;
  if (group) awake.add(group);
  if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
}

// Clicking sends a breeze in through the window: every letter is caught, one
// after another, and the leaves outside move with it.
function flutter(group) {
  if (reduce.matches) return;
  const now = performance.now();
  group.letters.forEach((letter, i) => {
    letter.kick = { at: now + i * 16, lift: 7 + Math.random() * 6, spin: (Math.random() - 0.5) * 340 };
  });
  dispatchEvent(new CustomEvent('minifolio:gust'));
  wake(group);
}

function listen(group) {
  const { trigger } = group;
  const reach = event => {
    group.hovered = true;
    group.px = group.seenX = event.clientX;
    group.seenT = event.timeStamp;
    group.vx = 0;
    wake(group);
  };
  trigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') reach(event); });
  trigger.addEventListener('pointermove', event => {
    if (!group.hovered) return;
    const elapsed = Math.max(event.timeStamp - group.seenT, 4) / 1000;
    group.vx += ((event.clientX - group.seenX) / elapsed - group.vx) * 0.4;
    group.px = group.seenX = event.clientX;
    group.seenT = event.timeStamp;
    wake(group);
  }, { passive: true });
  trigger.addEventListener('pointerleave', () => { group.hovered = group.pressed = false; wake(group); });
  trigger.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    // A finger has no hover, so touching a label lifts it towards the finger.
    if (event.pointerType === 'touch') reach(event);
    else { group.pressed = true; wake(group); }
  });
  const release = event => {
    group.pressed = false;
    if (event.pointerType === 'touch') group.hovered = false;
    wake(group);
  };
  trigger.addEventListener('pointerup', release);
  trigger.addEventListener('pointercancel', release);
  trigger.addEventListener('click', () => flutter(group));
  trigger.addEventListener('focus', () => { group.focused = trigger.matches(':focus-visible'); wake(group); });
  trigger.addEventListener('blur', () => { group.focused = false; wake(group); });
}

for (const el of document.querySelectorAll(LABELS)) {
  const trigger = el.closest('a, button') || el;
  let group = groups.get(trigger);
  if (!group) {
    group = { trigger, records: [], letters: [], hovered: false, focused: false, pressed: false, press: 0, px: 0, vx: 0, seenX: 0, seenT: 0, gone: false };
    groups.set(trigger, group);
    if (trigger.matches('a, button')) listen(group);
  }
  const record = { el, group, letters: [], metrics: null };
  record.letters = lay(record, el.textContent.trim());
  group.records.push(record);
  records.set(el, record);
  relink(group);
}

// Other scripts set a label's text as usual; the old letters blow away here and
// the new ones land in their place.
function swap(record, text) {
  const { el, group } = record;
  const before = el.dataset.paperText || '';
  const old = record.letters;
  if (!before || before === text || reduce.matches || document.hidden) {
    record.letters = lay(record, text);
    relink(group);
    return;
  }
  // Set the old words once more to see where each letter sat.
  const ghosts = lay(record, before);
  const style = getComputedStyle(el);
  const layer = document.createElement('span');
  layer.className = 'paper-gone';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    fontStyle: style.fontStyle, fontFeatureSettings: style.fontFeatureSettings, letterSpacing: style.letterSpacing, color: style.color });
  const metrics = measure(record);
  // The clock is not pressed, so its minutes change more gently.
  const push = group.trigger.matches('a, button') ? 1 : 0.45;
  ghosts.forEach((ghost, i) => {
    const box = ghost.box.getBoundingClientRect();
    if (!box.width) return;
    const ink = document.createElement('span');
    ink.textContent = ghost.char;
    Object.assign(ink.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, lineHeight: `${box.height}px` });
    layer.append(ink);
    const was = old[i] || ghost;
    drifting.push({ ink, layer, char: ghost.char, metrics, x: box.left, y: box.top, w: box.width, h: box.height,
      lift: Math.max(0, was.lift), liftV: Math.max(0, was.liftV) * 0.5 + (4 + Math.random() * 3) * push,
      ang: was.ang, angV: was.angV * 0.3 + (Math.random() - 0.5) * 120 * push,
      dx: 0, dy: 0, vx: (30 + Math.random() * 30) * push, vy: -(18 + Math.random() * 20) * push, show: 1, wait: i * 0.012 });
  });
  document.body.append(layer);
  record.letters = lay(record, text);
  record.letters.forEach((letter, i) => { letter.lift = push > 0.5 ? 1.4 : 0.8; letter.show = 0; letter.wait = 0.16 + i * 0.022; });
  relink(group);
  wake(group);
}

const observer = new MutationObserver(found => {
  observer.disconnect();
  for (const el of new Set(found.map(change => change.target))) {
    const record = records.get(el);
    if (record && !el.querySelector(':scope > .paper')) swap(record, el.textContent.trim());
  }
  watch();
});
const watch = () => records.forEach((record, el) => observer.observe(el, { childList: true }));
watch();

function tick(now) {
  frame = 0;
  const dt = clamp((now - last) / 1000, 0, 1 / 20);
  last = now;
  // Measure first, then move, so each frame reads the layout once.
  for (const group of awake) {
    group.gone = Boolean(group.trigger.closest('.is-leaving'));
    for (const letter of group.letters) {
      const box = letter.box.getBoundingClientRect();
      letter.x = box.left; letter.y = box.top; letter.w = box.width; letter.h = box.height;
    }
  }
  const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
  const shadows = [];
  for (const group of awake) {
    if (!simulate(group, now, dt, steps, h, shadows)) { awake.delete(group); rest(group); }
  }
  drifting = drifting.filter(letter => blow(letter, dt, steps, h, shadows));
  draw(shadows);
  if (awake.size || drifting.length || paperShadow.active) frame = requestAnimationFrame(tick);
}

// Springs: lift towards the hand (or flat while pressed), and a loose swing
// that the pointer's sideways speed pushes and the letter's weight brings back.
function simulate(group, now, dt, steps, h, shadows) {
  group.vx *= Math.exp(-dt / 0.09);
  group.press += ((group.pressed ? 1 : 0) - group.press) * (1 - Math.exp(-dt / 0.05));
  const lifting = group.hovered || group.focused;
  let moving = lifting || group.pressed || group.press > 0.01;
  for (const letter of group.letters) {
    if (letter.kick && now >= letter.kick.at) {
      letter.liftV += letter.kick.lift;
      letter.angV += letter.kick.spin;
      letter.kick = null;
    }
    const waiting = letter.wait > 0;
    if (waiting) letter.wait -= dt;
    else if (letter.show < 1) letter.show = Math.min(1, letter.show + dt / 0.26);
    const near = group.hovered ? Math.exp(-(((letter.x + letter.w / 2 - group.px) / REACH) ** 2)) : 0;
    const target = group.pressed ? 0 : lifting ? 0.42 + 0.58 * near : 0;
    const lean = group.hovered ? clamp(-group.vx * 0.016, -16, 16) * near : 0;
    const stiffness = group.pressed ? 700 : 150, damping = group.pressed ? 50 : 11;
    for (let s = 0; s < steps; s++) {
      if (!waiting) {
        letter.liftV += (stiffness * (target - letter.lift) - damping * letter.liftV) * h;
        letter.lift += letter.liftV * h;
      }
      letter.angV += (160 * (lean - letter.ang) - 7 * letter.angV) * h;
      letter.ang += letter.angV * h;
    }
    if (letter.kick || waiting || letter.show < 1 || Math.abs(letter.lift) > 0.002 || Math.abs(letter.liftV) > 0.02
      || Math.abs(letter.ang) > 0.04 || Math.abs(letter.angV) > 0.4) moving = true;
    const lift = Math.max(0, letter.lift), scale = 1 + 0.03 * lift - 0.035 * group.press;
    letter.ink.style.transform = `translate(${(-0.25 * lift).toFixed(2)}px, ${(-1.1 * lift).toFixed(2)}px) rotate(${letter.ang.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    letter.ink.style.opacity = letter.show < 1 ? letter.show.toFixed(3) : '';
    if (!group.gone && letter.w && lift > 0.004) {
      shadows.push({ x: letter.x, y: letter.y, w: letter.w, h: letter.h, char: letter.char, metrics: measure(letter.record),
        lift, ang: letter.ang, scale, alpha: Math.min(0.9, lift * 2.2) * letter.show });
    }
  }
  return moving;
}

function rest(group) {
  for (const letter of group.letters) {
    letter.lift = letter.liftV = letter.ang = letter.angV = 0;
    letter.ink.style.transform = letter.ink.style.opacity = '';
  }
}

// A letter blown off the wall: it peels away, spins loosely, drifts with the
// breeze and fades.
function blow(letter, dt, steps, h, shadows) {
  if (letter.wait > 0) letter.wait -= dt;
  else {
    letter.show -= dt / 0.42;
    letter.dx += letter.vx * dt;
    letter.dy += letter.vy * dt;
  }
  for (let s = 0; s < steps; s++) {
    letter.liftV += (150 * (2.2 - letter.lift) - 9 * letter.liftV) * h;
    letter.lift += letter.liftV * h;
    letter.angV += (-60 * letter.ang - 2 * letter.angV) * h;
    letter.ang += letter.angV * h;
  }
  if (letter.show <= 0) {
    letter.ink.remove();
    if (!letter.layer.childElementCount) letter.layer.remove();
    return false;
  }
  const lift = Math.max(0, letter.lift), scale = 1 + 0.03 * lift;
  letter.ink.style.transform = `translate(${(letter.dx - 0.25 * lift).toFixed(2)}px, ${(letter.dy - 1.1 * lift).toFixed(2)}px) rotate(${letter.ang.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
  letter.ink.style.opacity = letter.show.toFixed(3);
  shadows.push({ x: letter.x + letter.dx, y: letter.y + letter.dy, w: letter.w, h: letter.h, char: letter.char, metrics: letter.metrics,
    lift, ang: letter.ang, scale, alpha: Math.min(0.9, lift * 2.2) * letter.show });
  return true;
}

// Draw every lifted letter's shadow into one canvas that covers just the part
// of the viewport where shadows fall. Paper a few millimetres off a wall casts
// a nearly sharp shadow, so they soften only a little as they rise.
function draw(shadows) {
  if (!shadows.length) {
    if (paperShadow.active) {
      pen.setTransform(1, 0, 0, 1, 0, 0);
      pen.clearRect(0, 0, ...SIZE);
      paperShadow.active = false;
      paperShadow.version++;
      shade.hidden = true;
    }
    return;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shadows) {
    const x = s.x + SHADOW[0] * s.lift, y = s.y + SHADOW[1] * s.lift, margin = s.h * 0.5 + 6;
    x0 = Math.min(x0, x - margin); y0 = Math.min(y0, y - margin);
    x1 = Math.max(x1, x + s.w + margin); y1 = Math.max(y1, y + s.h + margin);
  }
  const scale = Math.min(1, SIZE[0] / (x1 - x0), SIZE[1] / (y1 - y0));
  paperShadow.rect = [x0, y0, SIZE[0] / scale, SIZE[1] / scale];
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, ...SIZE);
  pen.fillStyle = pen.strokeStyle = '#3c2c1c';
  pen.lineWidth = 0.5;
  pen.lineJoin = 'round';
  pen.textBaseline = 'alphabetic';
  for (const s of shadows) {
    pen.setTransform(scale, 0, 0, scale, (s.x + s.w / 2 + SHADOW[0] * s.lift - x0) * scale, (s.y + SHADOW[1] * s.lift - y0) * scale);
    pen.rotate(s.ang * Math.PI / 180);
    pen.scale(s.scale, s.scale);
    pen.globalAlpha = s.alpha;
    pen.filter = `blur(${((0.45 + 0.55 * s.lift) * scale).toFixed(2)}px)`;
    pen.font = s.metrics.font;
    const baseline = (s.h - s.metrics.asc - s.metrics.desc) / 2 + s.metrics.asc;
    pen.strokeText(s.char, -s.w / 2, baseline);
    pen.fillText(s.char, -s.w / 2, baseline);
  }
  pen.filter = 'none';
  pen.globalAlpha = 1;
  paperShadow.active = true;
  paperShadow.version++;
  // Without the 3D light, the canvas darkens the page itself.
  shade.hidden = paperShadow.light;
  if (!paperShadow.light) shade.style.transform = `translate(${x0}px, ${y0}px) scale(${1 / scale})`;
}

reduce.addEventListener('change', () => {
  if (!reduce.matches) return;
  cancelAnimationFrame(frame);
  frame = 0;
  for (const group of awake) rest(group);
  awake.clear();
  for (const letter of drifting) letter.layer.remove();
  drifting = [];
  draw([]);
});
document.fonts?.ready.then(() => records.forEach(record => { record.metrics = null; }));

// The index underline follows aria-current, which pages.js keeps up to date.
const index = document.querySelector('.index');
if (index) {
  const line = document.createElement('span');
  line.className = 'index__line';
  line.setAttribute('aria-hidden', 'true');
  index.append(line);
  const links = [...index.querySelectorAll('a')];
  let shown = false;
  const place = () => {
    const current = links.find(link => link.hasAttribute('aria-current'));
    if (!current) { line.style.opacity = '0'; shown = false; return; }
    const box = current.getBoundingClientRect(), frameBox = index.getBoundingClientRect();
    // Appearing from nowhere, it starts under its page instead of sliding in.
    if (!shown) line.style.transition = 'none';
    line.style.width = `${box.width}px`;
    line.style.transform = `translate(${box.left - frameBox.left}px, ${box.bottom - frameBox.top + 1}px)`;
    line.style.opacity = '1';
    if (!shown) { void line.offsetWidth; line.style.transition = ''; shown = true; }
  };
  new MutationObserver(place).observe(index, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  addEventListener('resize', place);
  document.fonts?.ready.then(place);
  place();
}

// Development only: inspect from the console, and run the springs for `ms`
// without waiting for frames (a hidden tab does not draw any).
if (import.meta.env.DEV) {
  window.__paper = {
    paperShadow, groups,
    advance(ms) {
      const start = performance.now() - ms;
      last = start;
      for (let t = 16; t <= ms; t += 16) { cancelAnimationFrame(frame); tick(start + t); }
    },
  };
}
