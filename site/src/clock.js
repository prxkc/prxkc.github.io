import { lightAt, localHour, previewHour } from './daylight.js';

// The hour and the name of its light, top right. It explains the wall: the
// light on it is the light of the visitor's own time of day (or of ?hour=).
const clock = document.querySelector('.clock');
const time = document.getElementById('clock-time');
const name = document.getElementById('clock-light');
const pinned = previewHour();
const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function tick() {
  const now = new Date();
  if (pinned !== null) now.setHours(Math.floor(pinned), Math.round((pinned % 1) * 60), 0, 0);
  time.textContent = format.format(now);
  time.dateTime = now.toISOString();
  name.textContent = lightAt(pinned ?? localHour(now)).name;
}

if (clock && time && name) {
  tick();
  clock.hidden = false;
  // Stay on the minute: wait for the next one, then tick once a minute.
  if (pinned === null) setTimeout(() => { tick(); setInterval(tick, 60000); }, 60000 - (Date.now() % 60000));
}
