/* =====================================================================
   OVERHEAD · space.js  (the solar system view)
   You float above the solar system. The Sun is in the middle, and the
   planets sit where they really are on their orbits today.
     1. Setup                      6. Labels and the side panel
     2. Background stars           7. Camera: orbit, zoom, focus
     3. The Sun and planets        8. Clicking a planet
     4. Orbits and asteroid belt   9. Entering, leaving, and each frame
     5. Where everything is
   Sizes and distances are NOT to scale. At real scale the planets would be
   invisible specks, so distances are squeezed (square root) and planets enlarged.
   ===================================================================== */
(() => {
"use strict";

/* ---------- 1. Setup ---------- */
const { THREE, renderer, canvas, DEG, reduceMotion } = OH;
const { fmtMillions, lightTime, yearWords, cap, clamp } = OH.helpers;
const $ = id => document.getElementById(id);
const AU_KM = 149597870.7;                 // one "astronomical unit": the Earth-Sun distance, in km

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);

// Squeeze distances so Neptune (30 AU away) and Mercury (0.4 AU) both fit on screen.
function squeeze(au) { return 16 * Math.sqrt(au); }

// astronomy-engine gives positions lined up with Earth's equator ("EQJ").
// Planets orbit close to a different plane, the ecliptic, so we tilt by Earth's
// axial tilt (23.44°) to lay the solar system flat. Then: three.js y = "up" out of that plane.
const TILT = 23.4392911 * DEG, cosT = Math.cos(TILT), sinT = Math.sin(TILT);
function toScene(v, out = new THREE.Vector3()) {
  const ex = v.x, ey = v.y * cosT + v.z * sinT, ez = -v.y * sinT + v.z * cosT;
  return out.set(ex, ez, -ey);
}
function placed(v) {                        // real position (AU) -> squeezed scene position
  const p = toScene(v);
  const au = p.length();
  return au > 0 ? p.multiplyScalar(squeeze(au) / au) : p;
}


/* ---------- 2. Background stars ----------
   The same 5,044 real stars, now seen from space, so there's no horizon or twinkle. */
{
  const S = OH.stars, pos = new Float32Array(S.N * 3), v = { x: 0, y: 0, z: 0 }, out = new THREE.Vector3();
  for (let i = 0; i < S.N; i++) {
    v.x = S.cosDec[i] * Math.cos(S.raRad[i]); v.y = S.cosDec[i] * Math.sin(S.raRad[i]); v.z = S.sinDec[i];
    toScene(v, out).multiplyScalar(6000);
    pos.set([out.x, out.y, out.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(S.starColor, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(S.starSize, 1));
  g.setAttribute("aBase", new THREE.BufferAttribute(S.starBase, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize, aBase; attribute vec3 aColor;
      uniform float uScale; varying vec3 vColor; varying float vAlpha;
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vColor = aColor; vAlpha = aBase * 0.85; gl_PointSize = aSize * uScale * 0.8; }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float d2 = dot(c, c); if (d2 > 1.0) discard;
        float a = (exp(-d2 * 12.0) + exp(-d2 * 3.0) * 0.15) * vAlpha; gl_FragColor = vec4(vColor, a); }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  var spaceStars = pts;
}


/* ---------- 3. The Sun and planets ---------- */
// Simple painted textures, made in code so no image files are needed.
function paint(style, base) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  const col = new THREE.Color(base);
  const shade = (k, a = 1) => `rgba(${Math.round(Math.min(255, col.r * 255 * k))},${Math.round(Math.min(255, col.g * 255 * k))},${Math.round(Math.min(255, col.b * 255 * k))},${a})`;
  g.fillStyle = shade(1); g.fillRect(0, 0, 256, 128);
  let seed = base.length * 97; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (style === "bands") {                                   // gas giants: stripes
    for (let y = 0; y < 128; y += 3 + rnd() * 6) { g.fillStyle = shade(0.75 + rnd() * 0.45, 0.6); g.fillRect(0, y, 256, 2 + rnd() * 6); }
  } else if (style === "earth") {                            // oceans, land and clouds
    g.fillStyle = "#2a5fae"; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) { g.fillStyle = rnd() > 0.4 ? "#4c8a4a" : "#b59a62"; g.beginPath(); g.ellipse(rnd() * 256, 18 + rnd() * 92, 6 + rnd() * 22, 4 + rnd() * 14, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = "#f2f5f8"; g.fillRect(0, 0, 256, 8); g.fillRect(0, 120, 256, 8);
    for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(255,255,255,0.45)"; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 128, 8 + rnd() * 20, 2 + rnd() * 3, 0, 0, 7); g.fill(); }
  } else {                                                   // rocky or icy: soft blotches
    for (let i = 0; i < 60; i++) { g.fillStyle = shade(0.7 + rnd() * 0.5, 0.35); g.beginPath(); g.arc(rnd() * 256, rnd() * 128, 2 + rnd() * 12, 0, 7); g.fill(); }
  }
  return new THREE.CanvasTexture(c);
}
const STYLE = { Mercury: "rock", Venus: "smooth", Earth: "earth", Mars: "rock", Jupiter: "bands", Saturn: "bands", Uranus: "smooth", Neptune: "smooth" };

const SPACE_BODIES = PLANETS.filter(p => p.key !== "Moon");      // Sun + 8 planets
const PLANET_LIST = SPACE_BODIES.filter(p => p.kind === "planet");

// The Sun: a glowing ball, a halo, and a light that shines on the planets.
const sun = SPACE_BODIES.find(p => p.key === "Sun");
sun.mesh = new THREE.Mesh(new THREE.SphereGeometry(sun.size, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
scene.add(sun.mesh);
{
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,240,200,0.9)"); grad.addColorStop(0.2, "rgba(255,200,110,0.45)"); grad.addColorStop(0.5, "rgba(255,150,60,0.12)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  sun.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sun.halo.scale.set(46, 46, 1);
  scene.add(sun.halo);
}
scene.add(new THREE.PointLight(0xfff2dd, 2.1, 0));
scene.add(new THREE.AmbientLight(0x8090c0, 0.12));             // so night sides aren't pitch black

PLANET_LIST.forEach(p => {
  p.mesh = new THREE.Mesh(
    new THREE.SphereGeometry(p.size, 40, 20),
    new THREE.MeshStandardMaterial({ map: paint(STYLE[p.key], p.color), roughness: 0.9, metalness: 0 })
  );
  p.mesh.rotation.z = (p.key === "Uranus" ? 98 : 20) * DEG;   // Uranus really is tipped on its side
  scene.add(p.mesh);
  if (p.key === "Saturn") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(p.size * 1.35, p.size * 2.35, 72),
      new THREE.MeshBasicMaterial({ color: 0xe8d6a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    p.mesh.add(ring);
  }
});
const earth = PLANET_LIST.find(p => p.key === "Earth");

// "You are here": a slowly pulsing ring around Earth.
const hereRing = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.3, 48),
  new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
hereRing.rotation.x = -Math.PI / 2;
scene.add(hereRing);


/* ---------- 4. Orbits and asteroid belt ---------- */
// Each orbit is drawn by asking where the planet will be at 200 moments across one of its years.
PLANET_LIST.forEach(p => {
  const pts = [], start = new Date();
  for (let k = 0; k < 200; k++) {
    const when = new Date(start.getTime() + k / 200 * p.year * 86400000);
    pts.push(placed(Astronomy.HelioVector(Astronomy.Body[p.key], when)));
  }
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: p.key === "Earth" ? 0x9fe6ff : 0x8fa8e8, transparent: true, opacity: p.key === "Earth" ? 0.5 : 0.2 }));
  scene.add(line);
});
// The asteroid belt: thousands of rocks between Mars and Jupiter (2.2 to 3.3 AU).
const belt = new THREE.Points(
  (() => {
    const n = 2200, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = squeeze(2.2 + Math.random() * 1.1), ang = Math.random() * Math.PI * 2;
      a.set([Math.cos(ang) * r, (Math.random() - 0.5) * 1.6, Math.sin(ang) * r], i * 3);
    }
    return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(a, 3));
  })(),
  new THREE.PointsMaterial({ color: 0x9a8f80, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.55 })
);
scene.add(belt);


/* ---------- 5. Where everything is ----------
   "simTime" is the date the solar system shows. Normally it's now; the time buttons fast-forward it. */
let simTime = Date.now();
let rate = 0;                               // days per second

function updatePositions() {
  const date = new Date(simTime);
  PLANET_LIST.forEach(p => {
    p.au = Astronomy.HelioVector(Astronomy.Body[p.key], date);       // real position in AU
    p.mesh.position.copy(placed(p.au));
  });
  hereRing.position.copy(earth.mesh.position);
}
function auBetween(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function auFromSun(p) { return Math.hypot(p.au.x, p.au.y, p.au.z); }


/* ---------- 6. Labels and the side panel ---------- */
const labels = SPACE_BODIES.map(p => {
  const el = document.createElement("div");
  el.className = "lbl planet space-lbl" + (p.key === "Earth" ? " here" : "");
  el.textContent = p.key === "Earth" ? "Earth · you are here" : p.name;
  el.style.opacity = 0;
  el.addEventListener("click", () => OH.select({ kind: "space", p }));
  OH.labelLayer.appendChild(el);
  return { el, p };
});
function updateLabels(show) {
  labels.forEach(({ el, p }) => {
    const pos = show ? OH.placeOnScreen(p.mesh.position, camera) : null;
    if (!pos || OH.isSelected({ kind: "space", p })) { el.style.opacity = 0; el.style.pointerEvents = "none"; return; }
    el.style.opacity = 1; el.style.pointerEvents = "auto";
    el.style.transform = `translate(${pos.x + 12}px, ${pos.y}px) translate(0, -50%)`;
  });
}

// The panel lists each planet with live distances. Rows are built once, then only their numbers change.
const list = $("s-list");
list.innerHTML = PLANET_LIST.map(p => `
  <button class="planet-row" data-key="${p.key}">
    <i style="background:${p.color}"></i>
    <span class="pn">${p.name}${p.key === "Earth" ? " <em>you</em>" : ""}</span>
    <span class="pd" id="pd-${p.key}"></span>
    <span class="pu" id="pu-${p.key}"></span>
  </button>`).join("");
list.addEventListener("click", e => {
  const row = e.target.closest("[data-key]");
  if (row) OH.select({ kind: "space", p: PLANET_LIST.find(p => p.key === row.dataset.key) });
});
function updatePanel() {
  const date = new Date(simTime);
  const live = Math.abs(simTime - Date.now()) < 3600000;
  $("s-date").textContent = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const days = Math.round((simTime - Date.now()) / 86400000);
  $("tagline").textContent = live ? "Solar system · now" : `Solar system · ${days > 0 ? "+" : ""}${days.toLocaleString()} days`;
  PLANET_LIST.forEach(p => {
    $("pd-" + p.key).textContent = p.key === "Earth" ? "1.00 AU from Sun" : `${fmtMillions(auBetween(p.au, earth.au) * AU_KM)} km`;
    // Is it in your sky right now? Only meaningful when showing the present.
    const sky = OH.skyBodies.find(b => b.key === p.key);
    $("pu-" + p.key).textContent = live && sky && sky.alt > 0 ? "up now" : "";
  });
}


/* ---------- 7. Camera: orbit, zoom, focus ----------
   The camera circles a "focus" point (the Sun, or a planet you picked).
   az = angle around, el = angle above the planets' plane, dist = how far away. */
const cam = { az: 0, el: 0.3, dist: 10 };
const goal = { az: 0.6, el: 0.55, dist: 215 };
const focus = new THREE.Vector3();
let focusBody = null;                       // null = the Sun
let glide = 0.06;

function focusOn(p) {
  focusBody = p && p.key !== "Sun" ? p : null;
  goal.dist = focusBody ? Math.max(7, p.size * 7) : (p ? 40 : 215);
  if (!p) goal.el = Math.max(goal.el, 0.45);
  glide = 0.06;
}
function drag(dx, dy) {
  goal.az -= dx * 0.005;
  goal.el = clamp(goal.el + dy * 0.004, -1.2, 1.45);
}
function zoom(f) { goal.dist = clamp(goal.dist * f, 5, 900); }


/* ---------- 8. Clicking a planet ---------- */
function findTarget(x, y, radius) {
  let best = null, bestD = radius;
  SPACE_BODIES.forEach(p => {
    const s = OH.placeOnScreen(p.mesh.position, camera); if (!s) return;
    // A planet's size on screen: bigger when the camera is close.
    const d = Math.hypot(s.x - x, s.y - y) - p.size / camera.position.distanceTo(p.mesh.position) * canvas.clientHeight;
    if (d < bestD) { bestD = d; best = { kind: "space", p }; }
  });
  return best;
}
function screenOf(p) { return OH.placeOnScreen(p.mesh.position, camera); }

function cardFor(p) {
  const fromEarth = p.key === "Sun" ? Math.hypot(earth.au.x, earth.au.y, earth.au.z) : auBetween(p.au, earth.au);
  const sky = OH.skyBodies.find(b => b.key === p.key);
  const live = Math.abs(simTime - Date.now()) < 3600000;
  const where = sky && live ? { label: "In your sky", value: sky.alt > 0 ? "Up right now" : "Below your horizon", note: "Switch back to your sky to find it", wide: true } : null;
  const width = { label: "Diameter", value: `${p.diameter.toLocaleString()} km`, note: p.key === "Earth" ? "" : `${(p.diameter / 12742).toFixed(p.diameter < 12742 ? 2 : 1)} × Earth` };
  if (p.key === "Sun") {
    return { eyebrow: "Our star", title: "The Sun", sub: p.fact, facts: [
      width,
      { label: "Distance from Earth", value: `${fmtMillions(fromEarth * AU_KM)} km`, note: `Sunlight takes ${lightTime(fromEarth * AU_KM)} to reach us` },
      ...(where ? [where] : []) ] };
  }
  const sunAU = auFromSun(p);
  const facts = [
    { label: "From the Sun", value: `${sunAU.toFixed(2)} AU`, note: `${fmtMillions(sunAU * AU_KM)} km · 1 AU = Earth-Sun distance` },
    p.key === "Earth"
      ? { label: "Year length", value: "365.25 days", note: "That's what a year is!" }
      : { label: "From Earth", value: `${fmtMillions(fromEarth * AU_KM)} km`, note: `Light takes ${lightTime(fromEarth * AU_KM)}` },
    { label: "Year length", value: yearWords(p.year), note: "One trip around the Sun" },
    width,
  ];
  if (p.key === "Earth") facts.splice(2, 1);
  if (where && p.key !== "Earth") facts.push(where);
  return { eyebrow: p.key === "Earth" ? "Home" : "Planet", title: p.name, sub: p.fact, facts };
}


/* ---------- 9. Entering, leaving, and each frame ---------- */
function enter() {
  simTime = Date.now(); setRate(0);
  updatePositions();
  // Start right next to Earth, looking back toward the Sun, then pull back to see everything.
  const e = earth.mesh.position;
  focus.copy(e);
  cam.az = Math.atan2(e.x, e.z); cam.el = 0.18; cam.dist = 6;
  focusBody = null; goal.az = cam.az + 0.9; goal.el = 0.55; goal.dist = 215;
  glide = reduceMotion ? 1 : 0.022;
  updatePanel();
}
function exit() { updateLabels(false); }

function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }

let panelTimer = 0;
function frame(dt, t) {
  if (rate) { simTime += rate * dt * 86400000; updatePositions(); }

  // Glide the camera and its focus point.
  const k = reduceMotion ? 1 : glide;
  cam.az += (goal.az - cam.az) * k; cam.el += (goal.el - cam.el) * k; cam.dist += (goal.dist - cam.dist) * k;
  glide = Math.min(0.09, glide + dt * 0.02);                              // speeds back up after a slow intro
  const target = focusBody ? focusBody.mesh.position : sun.mesh.position;
  focus.lerp(target, reduceMotion ? 1 : 0.08);
  camera.position.set(
    focus.x + cam.dist * Math.cos(cam.el) * Math.sin(cam.az),
    focus.y + cam.dist * Math.sin(cam.el),
    focus.z + cam.dist * Math.cos(cam.el) * Math.cos(cam.az)
  );
  camera.lookAt(focus);

  // Small touches: planets spin, the Sun's halo breathes, the "you are here" ring pulses.
  PLANET_LIST.forEach(p => p.mesh.rotation.y += dt * 0.4);
  if (!reduceMotion) {
    sun.halo.scale.setScalar(46 + Math.sin(t * 1.3) * 2);
    hereRing.scale.setScalar(1 + (t * 0.5 % 1) * 0.6);
    hereRing.material.opacity = 0.7 * (1 - (t * 0.5 % 1));
  }
  belt.rotation.y += dt * 0.01 * (1 + rate * 0.02);
  spaceStars.material.uniforms.uScale.value = Math.min(window.devicePixelRatio || 1, 2);

  renderer.render(scene, camera);
  updateLabels(true);
  panelTimer += dt;
  if (panelTimer > 0.25) { panelTimer = 0; updatePanel(); }
}

// Time buttons
const rateButtons = document.querySelectorAll("[data-rate]");
function setRate(r) {
  rate = r;
  rateButtons.forEach(b => b.setAttribute("aria-pressed", +b.dataset.rate === r));
}
rateButtons.forEach(b => b.addEventListener("click", () => setRate(+b.dataset.rate)));
$("t-now").addEventListener("click", () => { simTime = Date.now(); setRate(0); updatePositions(); updatePanel(); });

updatePositions();
resize(canvas.clientWidth || 1, canvas.clientHeight || 1);

OH.space = { enter, exit, frame, drag, zoom, findTarget, screenOf, cardFor, focusOn, resize };
})();
