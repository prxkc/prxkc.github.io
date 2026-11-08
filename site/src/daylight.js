// The light follows the visitor's clock. The sun keeps its direction, so the
// window and the leaves cast the same composition all day; what changes is the
// colour and strength of the light. Night holds a low dusk instead of going dark.
// Preview any hour with ?hour=7.5 in the address bar.
//
// No Three.js here: the page names the light before the 3D scene has loaded.
// Colours are sRGB triples from 0 to 1.
const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);

const KEYS = [
  { hour: 2, name: 'dusk', sun: '#ff9d5a', sunI: 3.9, sky: '#dddbe1', skyI: 0.72, ambient: '#d2d1d8', ambientI: 0.69, bounce: '#f2ba88', bounceI: 16 },
  { hour: 5, name: 'early light', sun: '#ffb98c', sunI: 3.6, sky: '#e0e1ea', skyI: 0.75, ambient: '#d5d8e2', ambientI: 0.74, bounce: '#f3caa8', bounceI: 13 },
  { hour: 9, name: 'morning light', sun: '#ffd7a0', sunI: 4.0, sky: '#e9eef5', skyI: 0.90, ambient: '#dde5ed', ambientI: 0.82, bounce: '#f7dbb6', bounceI: 15 },
  { hour: 14, name: 'afternoon light', sun: '#ffc276', sunI: 4.1, sky: '#e6eaf0', skyI: 0.85, ambient: '#d9e1e8', ambientI: 0.78, bounce: '#f8d3a1', bounceI: 16 },
  { hour: 18, name: 'golden hour', sun: '#ffa456', sunI: 4.35, sky: '#e5e0e0', skyI: 0.78, ambient: '#d8d5d8', ambientI: 0.72, bounce: '#f7bd84', bounceI: 18 },
  { hour: 21, name: 'dusk', sun: '#ff9d5a', sunI: 3.9, sky: '#dddbe1', skyI: 0.72, ambient: '#d2d1d8', ambientI: 0.69, bounce: '#f2ba88', bounceI: 16 },
].map(key => ({ ...key, sun: hex(key.sun), sky: hex(key.sky), ambient: hex(key.ambient), bounce: hex(key.bounce) }));

const COLOURS = ['sun', 'sky', 'ambient', 'bounce'];

export function previewHour() {
  const value = Number.parseFloat(new URLSearchParams(location.search).get('hour'));
  return Number.isFinite(value) ? ((value % 24) + 24) % 24 : null;
}

export function localHour(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

// The light for an hour, eased between the two nearest keys.
export function lightAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let from = KEYS[KEYS.length - 1], to = KEYS[0], t = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const next = KEYS[(i + 1) % KEYS.length];
    const start = KEYS[i].hour;
    const end = next.hour > start ? next.hour : next.hour + 24;
    const at = h < start ? h + 24 : h;
    if (at >= start && at < end) { from = KEYS[i]; to = next; t = (at - start) / (end - start); break; }
  }
  const s = t * t * (3 - 2 * t);
  const light = { name: s < 0.5 ? from.name : to.name };
  for (const key of COLOURS) {
    light[key] = from[key].map((v, i) => v + (to[key][i] - v) * s);
    light[key + 'I'] = from[key + 'I'] + (to[key + 'I'] - from[key + 'I']) * s;
  }
  return light;
}

// Now and then a thin cloud crosses the sun: a slow dip of a few seconds, then
// the room brightens again. Returns how much of the sunlight is held back.
export function createClouds(random) {
  let next = 24 + random() * 30, start = -1, duration = 0, depth = 0;
  return time => {
    if (start < 0) {
      if (time < next) return 0;
      start = time; duration = 8 + random() * 7; depth = 0.12 + random() * 0.12;
    }
    const t = (time - start) / duration;
    if (t >= 1) { start = -1; next = time + 45 + random() * 75; return 0; }
    return depth * Math.sin(Math.PI * t) ** 2;
  };
}
