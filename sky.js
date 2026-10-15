/* =====================================================================
   OVERHEAD · sky.js  (the view from the ground)
   Read top to bottom. Each numbered part does one job:
     1. Settings and places        8. Looking around (mouse, touch, keys)
     2. The 3D scene               9. Pointing at and clicking things
     3. Stars                     10. The details card
     4. Constellations            11. The report panel
     5. Sun, Moon and planets     12. Controls: places and toggles
     6. Moving the sky            13. The animation loop
     7. Labels and compass
   The solar system view lives in space.js. The two share a few things
   through one object called OH ("Overhead"), set up at the bottom.
   ===================================================================== */
(() => {
"use strict";

/* ---------- 1. Settings and places ---------- */
const DEG = Math.PI / 180;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CITIES = [
  { name: "New York",    lat: 40.71,  lon: -74.01,  tz: "America/New_York" },
  { name: "Vancouver",   lat: 49.28,  lon: -123.12, tz: "America/Vancouver" },
  { name: "London",      lat: 51.51,  lon: -0.13,   tz: "Europe/London" },
  { name: "Seoul",       lat: 37.57,  lon: 126.98,  tz: "Asia/Seoul" },
  { name: "Tokyo",       lat: 35.68,  lon: 139.69,  tz: "Asia/Tokyo" },
  { name: "Delhi",       lat: 28.61,  lon: 77.21,   tz: "Asia/Kolkata" },
  { name: "Sydney",      lat: -33.87, lon: 151.21,  tz: "Australia/Sydney" },
  { name: "Los Angeles", lat: 34.05,  lon: -118.24, tz: "America/Los_Angeles" },
  { name: "Lagos",       lat: 6.52,   lon: 3.38,    tz: "Africa/Lagos" },
  { name: "São Paulo",   lat: -23.55, lon: -46.63,  tz: "America/Sao_Paulo" },
];

let place = { ...CITIES[0] };                         // the place named in the report
const observer = { lat: place.lat, lon: place.lon };  // where the sky is drawn from (animates during a "flight")
let flight = null;                                    // set while flying between places
let daylight = true;                                  // false = hide sunlight so stars show any time
let showAllConstellations = false;
let mode = "sky";                                     // "sky" (ground view) or "space" (solar system view)

const $ = id => document.getElementById(id);


/* ---------- 2. The 3D scene ----------
   We stand at the center (0,0,0) of a giant sphere and look outward.
   Directions: +y is straight up, -z is north, +x is east.            */
const canvas = $("sky");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);

// Turn "azimuth + altitude" (compass direction + height, in degrees) into a 3D direction.
function directionFrom(azimuthDeg, altitudeDeg, out = new THREE.Vector3()) {
  const az = azimuthDeg * DEG, alt = altitudeDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
}
// And back again: 3D direction -> azimuth + altitude.
function anglesFrom(v) {
  const len = v.length() || 1;
  return {
    azimuth: (Math.atan2(v.x, -v.z) / DEG + 360) % 360,
    altitude: Math.asin(v.y / len) / DEG,
  };
}

// 2a. The sky dome: a big sphere painted from the inside by a small GPU program (a "shader").
//     It draws the sky gradient, the twilight glow, the Milky Way and the dark ground.
const skyUniforms = {
  uDay:       { value: 0 },                       // 0 = night, 1 = full daylight
  uTwilight:  { value: 0 },                       // strength of the sunset glow
  uSunDir:    { value: new THREE.Vector3(0, -1, 0) },
  uGalPole:   { value: new THREE.Vector3(0, 1, 0) },  // the Milky Way is a band around this direction
  uGalCenter: { value: new THREE.Vector3(1, 0, 0) },  // and is brightest toward this one
  uMilky:     { value: 1 },
  uIntro:     { value: 0 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(2000, 64, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uDay, uTwilight, uMilky, uIntro;
      uniform vec3 uSunDir, uGalPole, uGalCenter;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float t = pow(clamp(h, 0.0, 1.0), 0.45);
        vec3 night = mix(vec3(0.045, 0.06, 0.12), vec3(0.008, 0.012, 0.032), t);
        vec3 day   = mix(vec3(0.62, 0.76, 0.92), vec3(0.16, 0.36, 0.72), t);
        vec3 col = mix(night, day, uDay);

        // Sunset / sunrise glow on the side of the sky where the Sun is.
        vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
        float toward = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunFlat));
        col += vec3(0.95, 0.42, 0.2) * uTwilight * pow(toward, 3.0) * exp(-max(h, 0.0) * 6.0);
        col += vec3(0.25, 0.3, 0.6) * uTwilight * 0.25 * exp(-max(h, 0.0) * 3.0);

        // The Milky Way: a soft, cloudy band with dark dust lanes.
        float b = dot(d, uGalPole);
        float band = exp(-b * b * 26.0);
        float core = 0.5 + 1.1 * pow(max(0.0, dot(d, uGalCenter)), 3.0);
        float cloud = fbm(d * 6.0) * fbm(d * 15.0 + 3.0);
        float dust = smoothstep(0.42, 0.62, fbm(d * 9.0 + 7.0)) * exp(-b * b * 120.0);
        float mw = band * core * (0.3 + 1.6 * cloud) * (1.0 - 0.7 * dust);
        col += vec3(0.62, 0.68, 0.92) * mw * uMilky * 0.16 * smoothstep(-0.01, 0.12, h) * smoothstep(0.5, 2.5, uIntro);

        // Faint glow right at the horizon, then the dark ground below it.
        col += vec3(0.35, 0.55, 0.95) * 0.06 * exp(-abs(h) * 45.0) * (1.0 - uDay * 0.6);
        if (h < 0.0) {
          vec3 ground = vec3(0.006, 0.009, 0.018) + vec3(0.04, 0.06, 0.09) * uDay;
          col = mix(ground, col, exp(h * 70.0) * 0.55);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
skyDome.renderOrder = -1;
scene.add(skyDome);

// 2b. A dark treeline and hills around the horizon, so you feel like you're standing somewhere.
{
  const verts = [], index = [];
  const R = 900, steps = 720;
  for (let i = 0; i <= steps; i++) {
    const az = i / steps * 360;
    const a = az * DEG;
    let h = 0.8 + 0.9 * Math.sin(a * 2 + 1.3) + 0.6 * Math.sin(a * 5 + 0.4) + 0.35 * Math.sin(a * 13);
    const tree = Math.max(0, Math.sin(a * 97) * Math.sin(a * 41 + 2)) * 2.2;   // spiky "trees"
    h = Math.max(0.3, h + tree);
    const top = directionFrom(az, h).multiplyScalar(R);
    const bottom = directionFrom(az, -12).multiplyScalar(R);
    verts.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
    if (i < steps) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(index);
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x02040a, side: THREE.DoubleSide })));
}

// 2c. A holographic compass ring on the horizon with tick marks every 5°.
{
  const pts = [], R = 860;
  for (let az = 0; az < 360; az += 5) {
    const big = az % 45 === 0, mid = az % 15 === 0;
    const low = big ? -1.6 : mid ? -1.0 : -0.6;
    const a = directionFrom(az, low).multiplyScalar(R), b = directionFrom(az, 0).multiplyScalar(R);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  for (let az = 0; az < 360; az += 1) {
    const a = directionFrom(az, 0).multiplyScalar(R), b = directionFrom(az + 1, 0).multiplyScalar(R);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const ring = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.renderOrder = 2;
  scene.add(ring);
}


/* ---------- 3. Stars ----------
   Every star becomes one glowing point. Its size, color and twinkle come from the catalog.
   Catalog rows: [id, right ascension, declination, magnitude, color index, name, constellation] */
const N = STAR_CATALOG.length;
const starPos   = new Float32Array(N * 3);   // where each star is right now (recomputed as the sky turns)
const starVis   = new Float32Array(N);       // 1 if above the horizon, 0 if below
const starColor = new Float32Array(N * 3);
const starSize  = new Float32Array(N);
const starBase  = new Float32Array(N);       // base brightness
const starPhase = new Float32Array(N);       // random twinkle timing
const starDelay = new Float32Array(N);       // when it "ignites" on load
const sinDec = new Float32Array(N), cosDec = new Float32Array(N), raRad = new Float32Array(N);

// B-V color index -> RGB. Low numbers are hot blue-white stars, high numbers cooler orange ones.
function colorFromBV(bv) {
  if (bv === null) return [1, 1, 1];
  if (bv < -0.1) return [0.62, 0.74, 1.0];
  if (bv < 0.2)  return [0.82, 0.88, 1.0];
  if (bv < 0.5)  return [1.0, 0.97, 0.93];
  if (bv < 0.9)  return [1.0, 0.9, 0.74];
  if (bv < 1.3)  return [1.0, 0.8, 0.58];
  return [1.0, 0.68, 0.45];
}

STAR_CATALOG.forEach(([id, ra, dec, mag, bv], i) => {
  raRad[i] = ra * 15 * DEG;                  // 1 hour of right ascension = 15°
  sinDec[i] = Math.sin(dec * DEG);
  cosDec[i] = Math.cos(dec * DEG);
  starColor.set(colorFromBV(bv), i * 3);
  starSize[i] = Math.min(16, 3.4 + Math.max(0, 5.8 - mag) * 1.5);    // brighter = bigger
  starBase[i] = Math.min(1, Math.max(0.38, 0.38 + (6.2 - mag) * 0.14));
  starPhase[i] = Math.random();
  starDelay[i] = 0.35 + 2.6 * Math.sqrt(i / N);                       // list is brightest-first, so bright stars ignite first
});

const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute("aVis",   new THREE.BufferAttribute(starVis, 1));
starGeo.setAttribute("aColor", new THREE.BufferAttribute(starColor, 3));
starGeo.setAttribute("aSize",  new THREE.BufferAttribute(starSize, 1));
starGeo.setAttribute("aBase",  new THREE.BufferAttribute(starBase, 1));
starGeo.setAttribute("aPhase", new THREE.BufferAttribute(starPhase, 1));
starGeo.setAttribute("aDelay", new THREE.BufferAttribute(starDelay, 1));

const STAR_VERTEX = `
    attribute float aVis, aSize, aBase, aPhase, aDelay;
    attribute vec3 aColor;
    uniform float uTime, uIntro, uScale, uGlow, uTwinkle;
    varying vec3 vColor; varying float vAlpha; varying float vSize;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      float alt = normalize(position).y;
      float appear = smoothstep(aDelay, aDelay + 0.8, uIntro);                 // ignition on load
      float haze = 0.4 + 0.6 * smoothstep(0.0, 0.4, alt);                       // dimmer near the horizon
      float amount = 0.14 + 0.26 * (1.0 - smoothstep(0.0, 0.45, alt));          // twinkle more near the horizon
      float tw = 1.0 - uTwinkle * amount * (0.5 + 0.5 * sin(uTime * (1.6 + aPhase * 2.8) + aPhase * 6.283));
      vAlpha = aBase * appear * haze * uGlow * aVis * tw;
      vColor = aColor;
      vSize = aSize;
      gl_PointSize = aSize * uScale * mix(2.2, 1.0, appear);                    // a little flare as it ignites
    }`;
const STAR_FRAGMENT = `
    varying vec3 vColor; varying float vAlpha; varying float vSize;
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      float d2 = dot(c, c);
      if (d2 > 1.0 || vAlpha < 0.003) discard;
      float core = exp(-d2 * 12.0);
      float bright = clamp((vSize - 6.0) / 8.0, 0.0, 1.0);
      float halo = exp(-d2 * 3.2) * 0.38 * bright;
      float spikes = (exp(-abs(c.x) * 45.0) * exp(-abs(c.y) * 2.6) + exp(-abs(c.y) * 45.0) * exp(-abs(c.x) * 2.6)) * 0.35 * bright * bright;
      float a = (core + halo + spikes) * vAlpha;
      gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.55), a);
    }`;

const starUniforms = {
  uTime:    { value: 0 },
  uIntro:   { value: reduceMotion ? 100 : 0 },
  uScale:   { value: 1 },
  uGlow:    { value: 1 },        // how visible stars are (sunlight washes them out)
  uTwinkle: { value: reduceMotion ? 0 : 1 },
};
const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
  uniforms: starUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
}));
stars.frustumCulled = false;
stars.renderOrder = 1;
scene.add(stars);


/* ---------- 4. Constellations ----------
   Stick figures from data/constellations.js. All of them live in one set of lines;
   a number on each line (aCon) says which constellation it belongs to, so the GPU
   can make one constellation glow while the rest stay faint or hidden. */
const conById = {};
CONSTELLATIONS.forEach((c, i) => { c.index = i; conById[c.id] = c; });

const conVerts = [];                 // every line end, as [ra radians, sin dec, cos dec, constellation index]
CONSTELLATIONS.forEach((c, ci) => {
  c.verts = [];
  c.lines.forEach(line => {
    for (let k = 0; k < line.length - 1; k++) {
      [line[k], line[k + 1]].forEach(([ra, dec]) => {
        c.verts.push(conVerts.length);
        conVerts.push([ra * 15 * DEG, Math.sin(dec * DEG), Math.cos(dec * DEG), ci]);
      });
    }
  });
});
const conPos = new Float32Array(conVerts.length * 3);
const conGeo = new THREE.BufferGeometry();
conGeo.setAttribute("position", new THREE.BufferAttribute(conPos, 3));
conGeo.setAttribute("aCon", new THREE.Float32BufferAttribute(conVerts.map(v => v[3]), 1));
const conUniforms = { uSel: { value: -1 }, uAll: { value: 0 }, uFocus: { value: 0 }, uGlow: { value: 1 } };
const conLines = new THREE.LineSegments(conGeo, new THREE.ShaderMaterial({
  uniforms: conUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute float aCon;
    uniform float uSel, uAll, uFocus, uGlow;
    varying float vA; varying float vSel;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      float alt = normalize(position).y;
      vSel = 1.0 - step(0.5, abs(aCon - uSel));
      vA = mix(uAll * 0.28, uFocus * 0.85, vSel) * smoothstep(-0.005, 0.03, alt) * mix(0.55, 1.0, uGlow);
    }`,
  fragmentShader: `
    varying float vA; varying float vSel;
    void main() { gl_FragColor = vec4(mix(vec3(0.55, 0.68, 1.0), vec3(0.62, 0.92, 1.0), vSel), vA); }`,
}));
conLines.frustumCulled = false;
conLines.renderOrder = 1;
scene.add(conLines);


/* ---------- 5. Sun, Moon and planets ----------
   Unlike stars, these move against the stars from night to night, so we ask
   astronomy-engine where each one is. Facts about them come from data/planets.js. */
const BODY = {};
PLANETS.forEach(p => BODY[p.key] = p);
const SKY_BODIES = PLANETS.filter(p => p.key !== "Earth");           // everything you can see from Earth
const SKY_PLANETS = SKY_BODIES.filter(p => p.kind === "planet");

// 5a. Planets: glowing disks, a bit like stars but steady (planets don't twinkle much).
const planetPos = new Float32Array(SKY_PLANETS.length * 3);
const planetSize = new Float32Array(SKY_PLANETS.length);
const planetAlpha = new Float32Array(SKY_PLANETS.length);
const planetColor = new Float32Array(SKY_PLANETS.length * 3);
SKY_PLANETS.forEach((p, i) => { const c = new THREE.Color(p.color); planetColor.set([c.r, c.g, c.b], i * 3); });
const planetGeo = new THREE.BufferGeometry();
planetGeo.setAttribute("position", new THREE.BufferAttribute(planetPos, 3));
planetGeo.setAttribute("aSize", new THREE.BufferAttribute(planetSize, 1));
planetGeo.setAttribute("aAlpha", new THREE.BufferAttribute(planetAlpha, 1));
planetGeo.setAttribute("aColor", new THREE.BufferAttribute(planetColor, 3));
const planetUniforms = { uScale: { value: 1 }, uIntro: { value: reduceMotion ? 100 : 0 } };
const planetPoints = new THREE.Points(planetGeo, new THREE.ShaderMaterial({
  uniforms: planetUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute float aSize, aAlpha; attribute vec3 aColor;
    uniform float uScale, uIntro;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vColor = aColor; vAlpha = aAlpha * smoothstep(1.2, 2.4, uIntro);
      gl_PointSize = aSize * uScale;
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vAlpha;
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0; float d = length(c);
      if (d > 1.0) discard;
      float disk = 1.0 - smoothstep(0.22, 0.3, d);
      float glow = exp(-d * d * 5.0) * 0.45;
      gl_FragColor = vec4(mix(vColor, vec3(1.0), disk * 0.35), (disk + glow) * vAlpha);
    }`,
}));
planetPoints.frustumCulled = false;
planetPoints.renderOrder = 3;
scene.add(planetPoints);

// 5b. The Moon: a real 3D ball lit from the Sun's direction, so its phase is correct automatically.
function moonTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#c9c5bc"; g.fillRect(0, 0, 256, 128);
  let seed = 4; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) {                         // dark "seas" (maria)
    g.fillStyle = `rgba(90, 92, 96, ${0.25 + rnd() * 0.3})`;
    g.beginPath(); g.ellipse(rnd() * 256, 20 + rnd() * 88, 10 + rnd() * 30, 8 + rnd() * 18, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 140; i++) {                        // craters
    g.strokeStyle = `rgba(255, 255, 255, ${0.08 + rnd() * 0.12})`; g.lineWidth = 1;
    g.beginPath(); g.arc(rnd() * 256, rnd() * 128, 1 + rnd() * 4, 0, Math.PI * 2); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(16, 48, 24),
  new THREE.MeshStandardMaterial({ map: moonTexture(), roughness: 1, metalness: 0 })
);
moonMesh.renderOrder = 3;
scene.add(moonMesh);
const moonLight = new THREE.DirectionalLight(0xffffff, 1.7);   // the Sun, as far as the Moon is concerned
moonLight.target = moonMesh;
scene.add(moonLight);
scene.add(new THREE.AmbientLight(0x6070a0, 0.08));            // faint "earthshine" on the dark side

// 5c. The Sun: a bright glow (a sprite is a flat picture that always faces you).
function glowTexture(inner, outer) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(0.18, inner); grad.addColorStop(0.3, outer); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture("rgba(255,250,235,1)", "rgba(255,190,90,0.35)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
sunSprite.scale.set(150, 150, 1);
sunSprite.renderOrder = 3;
scene.add(sunSprite);


/* ---------- 6. Moving the sky ----------
   A star's catalog address never changes. As Earth spins, the whole sky turns.
   "Local sidereal time" says how far it has turned for your longitude right now.
   We do the turn ourselves here (instead of asking the library star by star)
   because it's fast enough to run 60 times a second while we fly between cities. */
let sky = { count: 0, brightest: -1, sunAlt: 0, date: new Date() };

function skyDirection(raRadians, sinD, cosD, lst, sinLat, cosLat, out, k) {
  const H = lst - raRadians;                          // "hour angle": how far past due south it is
  const cosH = Math.cos(H);
  out[k]     = -cosD * Math.sin(H);                   // east
  out[k + 1] = sinD * sinLat + cosD * cosLat * cosH;  // up
  out[k + 2] = -(sinD * cosLat - cosD * sinLat * cosH);  // north is -z
}

const tmp = new Float32Array(3);
function equatorialToVector(raHours, decDeg, lst, sinLat, cosLat) {
  skyDirection(raHours * 15 * DEG, Math.sin(decDeg * DEG), Math.cos(decDeg * DEG), lst, sinLat, cosLat, tmp, 0);
  return new THREE.Vector3(tmp[0], tmp[1], tmp[2]);
}

function recomputeSky() {
  const date = new Date();
  // The library tells us how far Earth has turned (Greenwich sidereal time, in hours).
  const gst = Astronomy.SiderealTime(date);
  const lst = (gst + observer.lon / 15) * 15 * DEG;
  const sinLat = Math.sin(observer.lat * DEG), cosLat = Math.cos(observer.lat * DEG);

  // Stars
  let count = 0, brightest = -1;
  for (let i = 0; i < N; i++) {
    skyDirection(raRad[i], sinDec[i], cosDec[i], lst, sinLat, cosLat, starPos, i * 3);
    const up = starPos[i * 3 + 1];
    starVis[i] = up > 0 ? 1 : 0;
    if (up > 0) { count++; if (brightest < 0) brightest = i; }
    starPos[i * 3] *= 1000; starPos[i * 3 + 1] *= 1000; starPos[i * 3 + 2] *= 1000;
  }
  starGeo.attributes.position.needsUpdate = true;
  starGeo.attributes.aVis.needsUpdate = true;

  // Constellation lines (a little closer than the stars, radius 995)
  for (let k = 0; k < conVerts.length; k++) {
    const [ra, sd, cd] = conVerts[k];
    skyDirection(ra, sd, cd, lst, sinLat, cosLat, conPos, k * 3);
    conPos[k * 3] *= 995; conPos[k * 3 + 1] *= 995; conPos[k * 3 + 2] *= 995;
  }
  conGeo.attributes.position.needsUpdate = true;
  CONSTELLATIONS.forEach(c => { c.centerVec = equatorialToVector(c.center[0], c.center[1], lst, sinLat, cosLat).multiplyScalar(995); });

  // Sun, Moon and planets: ask the library for each one's sky address right now.
  const obs = new Astronomy.Observer(observer.lat, observer.lon, 0);
  SKY_BODIES.forEach(b => {
    const body = Astronomy.Body[b.key];
    const eq = Astronomy.Equator(body, date, obs, true, true);         // address "of date", for drawing
    b.dir = equatorialToVector(eq.ra, eq.dec, lst, sinLat, cosLat);
    b.alt = Math.asin(b.dir.y) / DEG;
    b.distAU = eq.dist;
    if (!flight) {                                                      // slower facts: skip them mid-flight
      b.mag = Astronomy.Illumination(body, date).mag;
      const j2000 = Astronomy.Equator(body, date, obs, false, true);    // the constellation lookup wants J2000
      b.con = Astronomy.Constellation(j2000.ra, j2000.dec).symbol;
    }
  });
  const sunDir = BODY.Sun.dir, sunAlt = BODY.Sun.alt;

  // Planet dots: brighter planets get bigger dots. Uranus and Neptune stay small and dim.
  SKY_PLANETS.forEach((p, i) => {
    const v = p.dir.clone().multiplyScalar(970);
    planetPos.set([v.x, v.y, v.z], i * 3);
    const mag = p.mag ?? 2;
    planetSize[i] = clamp(9 - mag * 1.9, 6, 17);
    planetAlpha[i] = p.alt > -0.5 ? (mag > 5 ? 0.55 : 1) : 0;
  });
  planetGeo.attributes.position.needsUpdate = planetGeo.attributes.aSize.needsUpdate = planetGeo.attributes.aAlpha.needsUpdate = true;

  // Moon and Sun
  moonMesh.position.copy(BODY.Moon.dir).multiplyScalar(950);
  moonMesh.visible = BODY.Moon.alt > -2;
  moonLight.position.copy(sunDir).multiplyScalar(5000).add(moonMesh.position);
  sunSprite.position.copy(sunDir).multiplyScalar(960);
  sunSprite.visible = sunAlt > -2;

  // How dark is the sky?
  const lookAlt = daylight ? sunAlt : -30;            // with daylight off, draw it as if it's night
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uDay.value = smooth(-10, 3, lookAlt);
  skyUniforms.uTwilight.value = Math.exp(-Math.pow((lookAlt + 4) / 6, 2));
  skyUniforms.uMilky.value = 1 - smooth(-18, -9, lookAlt);
  starUniforms.uGlow.value = 1 - 0.9 * smooth(-16, 1, lookAlt);
  conUniforms.uGlow.value = starUniforms.uGlow.value;

  // The Milky Way's direction (galactic north pole and galactic center, fixed sky addresses).
  skyUniforms.uGalPole.value.copy(equatorialToVector(12.857, 27.128, lst, sinLat, cosLat));
  skyUniforms.uGalCenter.value.copy(equatorialToVector(17.761, -28.936, lst, sinLat, cosLat));

  sky = { count, brightest, sunAlt, date };
}
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function starVector(i) { return new THREE.Vector3(starPos[i * 3], starPos[i * 3 + 1], starPos[i * 3 + 2]); }
function bodyVector(b) { return b.dir.clone().multiplyScalar(b.key === "Moon" ? 950 : 970); }


/* ---------- 7. Labels and compass ----------
   HTML text that follows points in the 3D sky. */
const labelLayer = $("labels");
const labels = [];
function addLabel(text, className, getVector, opts = {}) {
  const el = document.createElement("div");
  el.className = "lbl " + className;
  el.textContent = text;
  labelLayer.appendChild(el);
  const l = { el, getVector, ...opts };
  labels.push(l);
  return l;
}
// Names for bright stars. You can click a name to open that star.
STAR_CATALOG.forEach(([id, ra, dec, mag, bv, name], i) => {
  if (!name || mag >= 2.8) return;
  const l = addLabel(name, "star", () => starVector(i), { kind: "star", star: i, mag });
  l.el.addEventListener("click", () => select({ kind: "star", i }));
});
// Names for the Sun, Moon and planets.
SKY_BODIES.forEach(b => {
  const l = addLabel(b.name, "planet", () => bodyVector(b), { kind: "body", body: b });
  l.el.addEventListener("click", () => select({ kind: "body", b }));
});
// Constellation names, placed at the middle of each figure.
CONSTELLATIONS.forEach(c => { c.label = addLabel(c.name, "con", () => c.centerVec, { kind: "con", con: c }); });
// Compass points just below the horizon.
[["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]].forEach(([t, az]) => {
  addLabel(t, "compass" + (t.length > 1 ? " minor" : ""), () => directionFrom(az, -3.2).multiplyScalar(800), { kind: "compass" });
});

const v3 = new THREE.Vector3();
function placeOnScreen(vec, cam = camera) {
  v3.copy(vec).project(cam);
  if (v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.2 || Math.abs(v3.y) > 1.2) return null;
  return { x: (v3.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v3.y * 0.5 + 0.5) * canvas.clientHeight };
}
function hideLabel(l) { if (l.el.style.opacity !== "0") { l.el.style.opacity = 0; l.el.style.pointerEvents = "none"; } }
function updateLabels(t) {
  if (mode !== "sky") { labels.forEach(hideLabel); return; }
  const introOK = reduceMotion || t > 3;
  const glow = Math.min(1, starUniforms.uGlow.value * 1.4);
  // Zoomed out: only the brightest names. Zoomed in: more names appear.
  const magLimit = view.fov > 75 ? 1.3 : view.fov > 50 ? 2.0 : 2.8;
  const selCon = selectedConstellation();
  labels.forEach(l => {
    let show = introOK;
    if (l.kind === "star") show = show && l.mag < magLimit && !isSelected({ kind: "star", i: l.star });
    if (l.kind === "body") show = show && l.body.alt > 0.3 && !isSelected({ kind: "body", b: l.body });
    if (l.kind === "con") show = show && (conUniforms.uAll.value > 0.5 || l.con === selCon);
    const vec = show ? l.getVector() : null;
    if (vec && l.kind !== "compass" && vec.y < 15) show = false;
    const p = show ? placeOnScreen(vec) : null;
    if (!p) { hideLabel(l); return; }
    l.el.style.opacity = l.kind === "compass" || l.kind === "body" ? 1 : glow;
    l.el.style.pointerEvents = l.kind === "star" || l.kind === "body" ? "auto" : "none";
    l.el.classList.toggle("focus", l.kind === "con" && l.con === selCon);
    const left = l.kind === "star" || l.kind === "body";
    const dx = l.kind === "body" ? 14 : 9;
    l.el.style.transform = `translate(${p.x + (left ? dx : 0)}px, ${p.y}px) translate(${left ? 0 : -50}%, -50%)`;
  });
}


/* ---------- 8. Looking around ----------
   "view" is where we're looking now; the goal values are where we're heading.
   Each frame we glide a little toward the goal: that's what makes it feel smooth.
   In the solar system view, the same gestures are passed on to space.js. */
const view = { az: 180, alt: 28, fov: 62, fovBump: 0 };
const goal = { az: 180, alt: 28, fov: 62 };
const spin = { az: 0, alt: 0 };                  // leftover drag speed, for a gentle glide after you let go
const pointers = new Map();
let dragDist = 0, pinchStart = null;

function degPerPixel() { return goal.fov / canvas.clientHeight; }

canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { dragDist = 0; spin.az = spin.alt = 0; }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: goal.fov, last: Math.hypot(a.x - b.x, a.y - b.y) }; }
});
canvas.addEventListener("pointermove", e => {
  const p = pointers.get(e.pointerId);
  if (!p) { hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    dragDist += Math.abs(dx) + Math.abs(dy);
    if (dragDist > 6) setHover(null);
    if (mode === "space") { OH.space.drag(dx, dy); return; }
    const k = degPerPixel();
    goal.az -= dx * k; goal.alt = clamp(goal.alt + dy * k, -4, 89);
    spin.az = -dx * k; spin.alt = dy * k;
  } else if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    if (mode === "space") OH.space.zoom(pinchStart.last / d);
    else goal.fov = clamp(pinchStart.fov * pinchStart.d / d, 18, 95);
    pinchStart.last = d;
    dragDist = 999;
  }
});
canvas.addEventListener("pointerleave", () => setHover(null));
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0 && dragDist < 6 && e.type === "pointerup") {
    const target = findTarget(e.clientX, e.clientY, e.pointerType === "touch" ? 40 : 30);
    if (target) select(target); else closeCard();
  }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  if (mode === "space") OH.space.zoom(Math.exp(e.deltaY * 0.0012));
  else goal.fov = clamp(goal.fov * Math.exp(e.deltaY * 0.0011), 18, 95);
}, { passive: false });
window.addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input, select, button")) return;
  if (e.key === "Escape") closeCard();
  if (mode !== "sky") return;
  const step = 8;
  if (e.key === "ArrowLeft") goal.az -= step;
  if (e.key === "ArrowRight") goal.az += step;
  if (e.key === "ArrowUp") goal.alt = clamp(goal.alt + step, -4, 89);
  if (e.key === "ArrowDown") goal.alt = clamp(goal.alt - step, -4, 89);
  if (e.key === "+" || e.key === "=") goal.fov = clamp(goal.fov * 0.85, 18, 95);
  if (e.key === "-") goal.fov = clamp(goal.fov / 0.85, 18, 95);
});
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }


/* ---------- 9. Pointing at and clicking things ----------
   A "target" is anything you can select: {kind: "star", i}, {kind: "body", b},
   or {kind: "space", p} for a planet in the solar system view.
   You don't have to hit a star exactly: we find the nearest one to your pointer,
   and planets and brighter stars win when two are close. */
let selected = null, hovered = null, hoverTimer = 0;
const hoverRing = $("hover"), hoverTip = $("hover-tip");

function findTarget(x, y, radius) {
  if (mode === "space") return OH.space.findTarget(x, y, radius);
  // Sun, Moon and planets first.
  let best = null, bestDist = radius + 8;
  SKY_BODIES.forEach(b => {
    if (b.alt < -0.5) return;
    const p = placeOnScreen(bodyVector(b)); if (!p) return;
    const reach = b.key === "Moon" || b.key === "Sun" ? 30 : 0;     // the Moon and Sun are big targets
    const d = Math.hypot(p.x - x, p.y - y) - reach;
    if (d < bestDist) { bestDist = d; best = { kind: "body", b }; }
  });
  if (best) return best;
  // Then stars.
  let bestStar = -1, bestScore = Infinity;
  const limit = Math.min(N, 2600);                // the brightest ~half of the catalog
  for (let i = 0; i < limit; i++) {
    if (!starVis[i]) continue;
    const p = placeOnScreen(starVector(i));
    if (!p) continue;
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist > radius) continue;
    const score = dist - (6 - STAR_CATALOG[i][3]) * 3;   // prefer brighter stars when close
    if (score < bestScore) { bestScore = score; bestStar = i; }
  }
  return bestStar >= 0 ? { kind: "star", i: bestStar } : null;
}
function sameTarget(a, b) { return !!a && !!b && a.kind === b.kind && a.i === b.i && a.b === b.b && a.p === b.p; }
function isSelected(t) { return sameTarget(selected, t); }

// Where is a target on screen right now?
function targetScreen(t) {
  if (t.kind === "space") return OH.space.screenOf(t.p);
  if (t.kind === "star") return starVis[t.i] ? placeOnScreen(starVector(t.i)) : null;
  if (t.kind === "body") return t.b.alt > -0.5 ? placeOnScreen(bodyVector(t.b)) : null;
  return null;
}
function targetName(t) {
  if (t.kind === "star") { const [id, , , , , name] = STAR_CATALOG[t.i]; return name || `HIP ${id}`; }
  return (t.b || t.p).name;
}

function hoverAt(x, y) {
  const now = performance.now();
  if (now - hoverTimer < 40) return;
  hoverTimer = now;
  setHover(findTarget(x, y, 30));
}
function setHover(t) {
  if (t && isSelected(t)) t = null;
  hovered = t;
  canvas.style.cursor = t ? "pointer" : "";
  hoverRing.hidden = hoverTip.hidden = !t;
  if (!t) return;
  let detail = "click for details";
  if (t.kind === "star") { const con = conById[STAR_CATALOG[t.i][6]]; if (con) detail = `${con.name} · ${detail}`; }
  if (t.kind === "body") detail = `${t.b.kind === "planet" ? "Planet" : t.b.kind === "moon" ? "Moon" : "Our star"} · ${detail}`;
  if (t.kind === "space") detail = `${t.p.kind === "star" ? "Our star" : "Planet"} · ${detail}`;
  hoverTip.innerHTML = `<b>${targetName(t)}</b><span>${detail}</span>`;
}
function updateHover() {
  if (!hovered) return;
  const p = targetScreen(hovered);
  if (!p) { setHover(null); return; }
  hoverRing.style.left = p.x + "px"; hoverRing.style.top = p.y + "px";
  hoverTip.style.left = p.x + "px"; hoverTip.style.top = p.y + "px";
}


/* ---------- 10. The details card ----------
   One card for everything. Each kind of target builds a short list of facts. */
const card = $("card"), reticle = $("reticle"), leaderLine = $("leader-line");

function select(t) {
  setHover(null);
  selected = t;
  let spec;
  if (t.kind === "star") spec = starCard(t.i);
  else if (t.kind === "body") spec = bodyCard(t.b);
  else spec = OH.space.cardFor(t.p);
  showCard(spec);
  if (t.kind === "space") { OH.space.focusOn(t.p); return; }

  // Light up the constellation it's in and glide the view to it.
  const con = t.kind === "star" ? conById[STAR_CATALOG[t.i][6]] : conById[t.b.con];
  conUniforms.uSel.value = con ? con.index : -1;
  conUniforms.uFocus.value = 0;
  if (t.kind === "star") frameStarAndConstellation(starVector(t.i), con);
  else frameStarAndConstellation(bodyVector(t.b), null, t.b.key === "Sun" || t.b.key === "Moon" ? 30 : 40);
}
function selectedConstellation() {
  if (!selected) return null;
  if (selected.kind === "star") return conById[STAR_CATALOG[selected.i][6]];
  if (selected.kind === "body") return conById[selected.b.con];
  return null;
}

function showCard(spec) {
  set("c-eyebrow", spec.eyebrow);
  set("c-title", spec.title);
  set("c-sub", spec.sub || "");
  $("c-facts").innerHTML = spec.facts.map(f =>
    `<div class="fact${f.wide ? " wide" : ""}"><span>${f.label}</span><b>${f.value}</b>${f.note ? `<small>${f.note}</small>` : ""}</div>`).join("");
  card.hidden = false;
  document.querySelector(".hud").classList.add("card-open");
  restartAnimation(card, "sweep");
  reticle.hidden = true; void reticle.offsetWidth; reticle.hidden = false;   // replay the lock-on animation
  leaderLine.style.display = "";
}

function starCard(i) {
  const [id, ra, dec, mag, bv, name, conId] = STAR_CATALOG[i];
  const con = conById[conId];
  const pos = anglesFrom(starVector(i));
  return {
    eyebrow: `#${(i + 1).toLocaleString()} brightest of ${N.toLocaleString()} stars`,
    title: name || `HIP ${id}`,
    sub: name ? `Hipparcos catalog no. ${id}` : "No common name, just a catalog number",
    facts: [
      { label: "Brightness", value: mag.toFixed(2), note: magnitudeWords(mag) },
      { label: "Color", value: colorWords(bv), note: bv === null ? "Temperature unknown" : `Surface about ${roundHundreds(temperature(bv) - 273)} °C` },
      { label: "Constellation", value: con ? con.name : "Unknown", note: con ? "The view zooms out to show its whole figure, with this star circled." : "", wide: true },
      { label: "Where to look", value: `${cap(compassWord(pos.azimuth))}, ${heightWord(pos.altitude)}`, note: `Altitude ${pos.altitude.toFixed(0)}° · Azimuth ${pos.azimuth.toFixed(0)}°`, wide: true },
    ],
  };
}

function bodyCard(b) {
  const pos = anglesFrom(b.dir);
  const con = conById[b.con];
  const km = b.distAU * 149597870.7;
  const look = {
    label: "Where to look",
    value: b.alt > 0 ? `${cap(compassWord(pos.azimuth))}, ${heightWord(pos.altitude)}` : "Below the horizon right now",
    note: `Altitude ${pos.altitude.toFixed(0)}° · Azimuth ${pos.azimuth.toFixed(0)}°`, wide: true,
  };
  const inCon = { label: "In front of", value: con ? con.name : "–", note: "The constellation behind it tonight", wide: false };
  if (b.key === "Sun") {
    return { eyebrow: "Our star", title: "The Sun", sub: b.fact, facts: [
      { label: "Distance", value: `${fmtMillions(km)} km`, note: `Its light left ${lightTime(km)} ago` },
      inCon, look ] };
  }
  if (b.key === "Moon") {
    const illum = Astronomy.Illumination(Astronomy.Body.Moon, sky.date);
    const phase = Astronomy.MoonPhase(sky.date);
    return { eyebrow: "Earth's moon", title: "The Moon", sub: b.fact, facts: [
      { label: "Phase", value: moonPhaseName(phase), note: `${Math.round(illum.phase_fraction * 100)}% lit` },
      { label: "Distance", value: `${Math.round(km).toLocaleString()} km`, note: `Light takes ${(km / 299792.458).toFixed(1)} seconds` },
      inCon, look ] };
  }
  const eye = b.mag < 5.5 ? "Visible to the naked eye" : "Too faint for your eyes; needs binoculars or a telescope";
  return { eyebrow: "Planet", title: b.name, sub: b.fact, facts: [
    { label: "Brightness", value: b.mag.toFixed(1), note: eye },
    { label: "Distance from you", value: `${fmtMillions(km)} km`, note: `Its light left ${lightTime(km)} ago` },
    { label: "Year length", value: yearWords(b.year), note: "Time to go once around the Sun" },
    inCon, look ] };
}

function frameStarAndConstellation(targetVec, con, minFov = 40) {
  const star = targetVec.clone().normalize();
  if (!con || !con.verts.length) {
    const pos = anglesFrom(star);
    goal.az = view.az + wrap180(pos.azimuth - view.az); goal.alt = clamp(pos.altitude, -4, 89); goal.fov = Math.min(goal.fov, minFov);
    return;
  }
  // The middle of the figure = the average direction of all its line ends (plus the star).
  const mid = star.clone();
  con.verts.forEach(k => mid.add(v3.set(conPos[k * 3], conPos[k * 3 + 1], conPos[k * 3 + 2]).normalize()));
  mid.normalize();
  // How wide is it? The biggest angle from the middle to any part of it.
  let widest = mid.angleTo(star);
  con.verts.forEach(k => { widest = Math.max(widest, mid.angleTo(v3.set(conPos[k * 3], conPos[k * 3 + 1], conPos[k * 3 + 2]))); });
  const aspect = Math.min(1, camera.aspect);           // tall phone screens need a wider view
  const pos = anglesFrom(mid);
  goal.az = view.az + wrap180(pos.azimuth - view.az);
  goal.alt = clamp(pos.altitude, 2, 89);
  goal.fov = clamp((widest / DEG) * 2.7 / aspect, 22, 95);
}

function closeCard() {
  if (!selected) return;
  const wasSpace = selected.kind === "space";
  selected = null; card.hidden = true; reticle.hidden = true;
  leaderLine.style.display = "none";                  // hide the pointer line completely
  conUniforms.uSel.value = -1;
  document.querySelector(".hud").classList.remove("card-open");
  if (wasSpace) OH.space.focusOn(null);
  else if (goal.fov < 55) goal.fov = 62;
}
$("card-close").addEventListener("click", closeCard);

function updateSelection() {
  if (!selected) return;
  conUniforms.uFocus.value += (1 - conUniforms.uFocus.value) * (reduceMotion ? 1 : 0.05);
  const p = targetScreen(selected);
  if (!p) { reticle.style.opacity = 0; leaderLine.style.display = "none"; return; }
  reticle.style.opacity = 1; leaderLine.style.display = "";
  reticle.style.left = p.x + "px"; reticle.style.top = p.y + "px";
  // Draw the dashed line from the card to the edge of the reticle.
  const r = card.getBoundingClientRect();
  const sx = Math.min(Math.max(p.x, r.left + 20), r.right - 20), sy = p.y < r.top ? r.top : r.bottom;
  const ang = Math.atan2(sy - p.y, sx - p.x);
  leaderLine.setAttribute("x1", sx); leaderLine.setAttribute("y1", sy);
  leaderLine.setAttribute("x2", p.x + Math.cos(ang) * 26); leaderLine.setAttribute("y2", p.y + Math.sin(ang) * 26);
  if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) leaderLine.style.display = "none";
}

// Plain-language helpers
function magnitudeWords(m) {
  if (m < 0) return "Among the very brightest stars";
  if (m < 1) return "Very bright, easy even in a city";
  if (m < 2.5) return "Bright, visible from most towns";
  if (m < 4) return "Easy to see away from city lights";
  if (m < 5) return "Faint, needs a darker sky";
  return "Very faint, needs a truly dark sky";
}
function colorWords(bv) {
  if (bv === null) return "Unknown";
  if (bv < -0.1) return "Blue-white";
  if (bv < 0.2) return "White";
  if (bv < 0.5) return "Yellow-white";
  if (bv < 0.9) return "Yellow";
  if (bv < 1.3) return "Orange";
  return "Red-orange";
}
// Rough surface temperature from color (Ballesteros' formula), in kelvin.
function temperature(bv) { return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)); }
function roundHundreds(n) { return (Math.round(n / 100) * 100).toLocaleString(); }
function compassWord(az) { return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(az / 45) % 8]; }
function heightWord(alt) {
  if (alt > 70) return "almost straight up";
  if (alt > 45) return "high in the sky";
  if (alt > 20) return "about halfway up";
  return "low, near the horizon";
}
function moonPhaseName(deg) {
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(deg / 45) % 8];
}
function fmtMillions(km) { return km >= 1e9 ? `${(km / 1e9).toFixed(2)} billion` : `${Math.round(km / 1e6).toLocaleString()} million`; }
function lightTime(km) {
  const s = km / 299792.458;
  if (s < 120) return `${Math.round(s)} seconds`;
  if (s < 7200) return `${Math.round(s / 60)} minutes`;
  return `${(s / 3600).toFixed(1)} hours`;
}
function yearWords(days) { return days < 700 ? `${Math.round(days)} days` : `${(days / 365.25).toFixed(days < 36500 ? 1 : 0)} years`; }
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function wrap180(d) { return ((d % 360) + 540) % 360 - 180; }


/* ---------- 11. The report panel ---------- */
const report = $("report");
let shownCount = 0, countAnim = null, planetsKey = "";

function updateReport() {
  set("f-place", flight ? `Flying to ${place.name}…` : place.name);
  set("f-coords", `${fmtCoord(observer.lat, "N", "S")} · ${fmtCoord(observer.lon, "E", "W")}`);
  const opts = { hour: "2-digit", minute: "2-digit", weekday: "short", month: "short", day: "numeric" };
  const tz = place.tz || "UTC";
  set("f-time", sky.date.toLocaleString("en-US", { ...opts, timeZone: tz }));
  set("f-tz", place.tz ? place.tz.replace(/_/g, " ") : "Shown in UTC (world time) for custom coordinates");
  const s = sky.sunAlt;
  const dark =
    s > 0   ? ["No, it's daytime", "The stars are still there; sunlight hides them."] :
    s > -6  ? ["Twilight", "Only the brightest stars and planets show."] :
    s > -12 ? ["Getting dark", "Most bright stars are out."] :
    s > -18 ? ["Nearly dark", "Good for stargazing away from city lights."] :
              ["Yes, fully dark", "The sky is as dark as it gets."];
  set("f-dark", dark[0]);
  set("f-sun", `Sun ${Math.abs(s).toFixed(0)}° ${s < 0 ? "below" : "above"} the horizon. ${dark[1]}`);

  // Planets and the Moon above the horizon, as buttons that take you to them.
  const up = SKY_BODIES.filter(b => b.key !== "Sun" && b.alt > 0);
  const key = up.map(b => b.key).join();
  if (key !== planetsKey) {
    planetsKey = key;
    $("f-planets").innerHTML = up.length
      ? up.map(b => `<button class="pill" data-body="${b.key}">${b.name}</button>`).join("")
      : `<b>None right now</b>`;
    set("f-planets-note", up.some(b => b.mag > 5.5) ? "Uranus and Neptune need binoculars." : up.length ? "Click one to go there." : "They're all below the horizon. Check back later.");
  }

  if (sky.brightest >= 0) {
    const [id, , , , , name] = STAR_CATALOG[sky.brightest];
    const pos = anglesFrom(starVector(sky.brightest));
    set("f-bright", name || `HIP ${id}`);
    set("f-look", `Look ${compassWord(pos.azimuth)}, ${heightWord(pos.altitude)}. Click the name to go there.`);
  }
  countTo(sky.count);
}
$("f-bright").addEventListener("click", () => { if (sky.brightest >= 0) select({ kind: "star", i: sky.brightest }); });
$("f-planets").addEventListener("click", e => { const b = e.target.closest("[data-body]"); if (b) select({ kind: "body", b: BODY[b.dataset.body] }); });

// Numbers count up to their new value instead of jumping.
function countTo(target) {
  if (target === shownCount && !countAnim) return;
  const from = shownCount, start = performance.now(), dur = reduceMotion ? 0 : 1100;
  cancelAnimationFrame(countAnim);
  const tick = now => {
    const t = dur ? Math.min(1, (now - start) / dur) : 1;
    shownCount = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
    $("f-count").textContent = shownCount.toLocaleString();
    countAnim = t < 1 ? requestAnimationFrame(tick) : null;
  };
  countAnim = requestAnimationFrame(tick);
}
function fmtCoord(v, pos, neg) { return `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`; }
function set(id, text) { const el = $(id); if (el.textContent !== text) el.textContent = text; }
function restartAnimation(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }


/* ---------- 12. Controls: places and toggles ---------- */
const citySelect = $("city"), latInput = $("lat"), lonInput = $("lon"), coordsForm = $("coords"), toast = $("toast");
CITIES.forEach((c, i) => citySelect.add(new Option(c.name, i)));
citySelect.add(new Option("Custom place", "custom"));

let toastTimer = 0;
// A short message at the top. It can carry one action button.
function showToast(msg, action) {
  toast.innerHTML = "";
  toast.append(document.createTextNode(msg));
  if (action) {
    const b = document.createElement("button");
    b.className = "chip go"; b.textContent = action.label;
    b.addEventListener("click", () => { toast.hidden = true; action.run(); });
    toast.append(b);
  }
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.hidden = true, action ? 9000 : 4200);
}
// If it's daytime where you're looking, offer to hide the sunlight.
function daylightHint() {
  if (mode === "sky" && daylight && sky.sunAlt > -6) {
    showToast(`It's ${sky.sunAlt > 0 ? "daytime" : "twilight"} in ${place.name}, so sunlight hides most stars.`,
      { label: "Show the stars", run: () => setDaylight(false) });
  }
}

const dayBtn = $("daylight-toggle"), conBtn = $("con-toggle");
function setDaylight(on) {
  daylight = on;
  dayBtn.setAttribute("aria-pressed", on);
  dayBtn.textContent = on ? "☀ Daylight on" : "☾ Daylight off";
  recomputeSky();
}
dayBtn.addEventListener("click", () => setDaylight(!daylight));
conBtn.addEventListener("click", () => {
  showAllConstellations = !showAllConstellations;
  conBtn.setAttribute("aria-pressed", showAllConstellations);
});

// Fly to a new place: the observer's latitude and longitude glide there over two seconds,
// so the sky rolls smoothly into its new position.
function flyTo(newPlace) {
  closeCard();
  const hemisphereChange = Math.sign(newPlace.lat || 1) !== Math.sign(place.lat || 1);
  place = { ...newPlace };
  flight = {
    fromLat: observer.lat, fromLon: observer.lon,
    dLat: newPlace.lat - observer.lat, dLon: wrap180(newPlace.lon - observer.lon),
    start: performance.now(), dur: reduceMotion ? 1 : 2400,
  };
  if (hemisphereChange) { goal.az = view.az + wrap180((newPlace.lat >= 0 ? 180 : 0) - view.az); goal.alt = 28; }
  latInput.value = newPlace.lat.toFixed(2); lonInput.value = newPlace.lon.toFixed(2);
  updateReport();
}
function stepFlight(now) {
  const t = Math.min(1, (now - flight.start) / flight.dur);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // ease in and out
  observer.lat = flight.fromLat + flight.dLat * e;
  observer.lon = flight.fromLon + flight.dLon * e;
  view.fovBump = Math.sin(Math.PI * t) * 16;                              // pull back mid-flight, then settle
  if (t >= 1) {
    flight = null; view.fovBump = 0;
    observer.lon = ((observer.lon + 540) % 360) - 180;
  }
  recomputeSky();
  if (!flight) {
    restartAnimation(report, "sweep");
    updateReport();
    daylightHint();
  }
}

citySelect.addEventListener("change", () => {
  if (citySelect.value === "custom") { openCoords(true); return; }
  flyTo(CITIES[citySelect.value]);
});
function openCoords(open) {
  coordsForm.hidden = !open; $("coords-toggle").setAttribute("aria-expanded", open);
  if (open) latInput.focus();
}
$("coords-toggle").addEventListener("click", () => openCoords(coordsForm.hidden));
// Close the Coordinates dropdown when you press Esc or click somewhere else.
document.addEventListener("keydown", e => { if (e.key === "Escape" && !coordsForm.hidden) openCoords(false); });
document.addEventListener("pointerdown", e => {
  if (!coordsForm.hidden && !e.target.closest("#coords, #coords-toggle, #city")) openCoords(false);
});

// Keep the report panels just below the top bar, even when the bar wraps onto two lines.
const dock = document.querySelector(".dock");
function placePanels() {
  const wide = window.innerWidth > 760;
  const top = wide ? `${Math.round(dock.getBoundingClientRect().bottom + 14)}px` : "";
  report.style.top = top;
  $("space-panel").style.top = top;
}
new ResizeObserver(placePanels).observe(dock);
window.addEventListener("resize", placePanels);
coordsForm.addEventListener("submit", e => {
  e.preventDefault();
  const lat = parseFloat(latInput.value), lon = parseFloat(lonInput.value);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    showToast("Latitude must be between -90 and 90, and longitude between -180 and 180.");
    return;
  }
  citySelect.value = "custom";
  openCoords(false);
  flyTo({ name: "Custom place", lat, lon, tz: null });
});
$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { showToast("This browser can't share your location. Use Coordinates instead."); return; }
  showToast("Asking your browser for your location…");
  navigator.geolocation.getCurrentPosition(
    p => {
      toast.hidden = true; citySelect.value = "custom";
      flyTo({ name: "Your location", lat: p.coords.latitude, lon: p.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    },
    () => showToast("Location wasn't shared. Pick a city or use Coordinates instead.")
  );
});

// Switching between the sky and the solar system: a quick "warp" (the view stretches,
// the screen flashes to black) hides the swap, then space.js takes over.
const warp = $("warp"), spaceBtn = $("space-toggle");
let switching = false;
function switchMode(next) {
  if (switching || next === mode) return;
  switching = true;
  closeCard(); setHover(null); toast.hidden = true;
  if (next === "space") { view.fovBump = 0; warpStretch = 1; }
  warp.classList.add("on");
  setTimeout(() => {
    mode = next;
    warpStretch = 0;
    document.body.classList.toggle("space-mode", next === "space");
    spaceBtn.textContent = next === "space" ? "↩ Back to my sky" : "☉ Solar system";
    $("tagline").textContent = next === "space" ? "Solar system" : "Live sky";
    if (next === "space") OH.space.enter(); else OH.space.exit();
    warp.classList.remove("on");
    setTimeout(() => { switching = false; }, 400);
  }, reduceMotion ? 50 : 650);
}
let warpStretch = 0;
spaceBtn.addEventListener("click", () => switchMode(mode === "sky" ? "space" : "sky"));


/* ---------- 13. The animation loop ----------
   Runs about 60 times a second: glide the view, update the sky, draw. */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (OH.space) OH.space.resize(w, h);
}
window.addEventListener("resize", resize);

const startTime = performance.now();
let lastSkyUpdate = 0, lastFacing = "", lastFrame = performance.now();
const lookAt = new THREE.Vector3();

function frame(now) {
  const t = (now - startTime) / 1000;
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;

  if (mode === "space") {
    OH.space.frame(dt, t);
  } else {
    // The sky turns slowly, so recompute every 10 seconds (or every frame while flying).
    if (flight) stepFlight(now);
    else if (now - lastSkyUpdate > 10000) { recomputeSky(); updateReport(); lastSkyUpdate = now; }

    // Glide toward the goal. After a drag, keep drifting a little and slow down.
    if (pointers.size === 0 && (Math.abs(spin.az) > 0.001 || Math.abs(spin.alt) > 0.001) && !reduceMotion) {
      goal.az += spin.az; goal.alt = clamp(goal.alt + spin.alt, -4, 89);
      spin.az *= 0.9; spin.alt *= 0.9;
    }
    const k = reduceMotion ? 1 : 0.1;
    view.az += (goal.az - view.az) * k;
    view.alt += (goal.alt - view.alt) * k;
    view.fov += (goal.fov - view.fov) * k;
    if (warpStretch) { view.fovBump += (70 - view.fovBump) * 0.12; view.alt += (80 - view.alt) * 0.08; }

    // Fade all constellation lines in or out when the toggle changes.
    const allTarget = showAllConstellations ? 1 : 0;
    conUniforms.uAll.value += (allTarget - conUniforms.uAll.value) * (reduceMotion ? 1 : 0.08);

    camera.fov = Math.min(150, view.fov + view.fovBump);
    camera.updateProjectionMatrix();
    camera.lookAt(directionFrom(view.az, view.alt, lookAt));

    starUniforms.uTime.value = t;
    if (!reduceMotion) { starUniforms.uIntro.value = t; planetUniforms.uIntro.value = t; }
    skyUniforms.uIntro.value = reduceMotion ? 100 : t;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    starUniforms.uScale.value = dpr * Math.pow(62 / camera.fov, 0.55);
    planetUniforms.uScale.value = dpr * Math.pow(62 / camera.fov, 0.4);

    renderer.render(scene, camera);
    const facing = `Facing ${compassWord(((view.az % 360) + 360) % 360)} · ${Math.round(view.alt)}° up`;
    if (facing !== lastFacing) { $("facing").textContent = facing; lastFacing = facing; }
  }
  updateLabels(t);
  updateSelection();
  updateHover();
  requestAnimationFrame(frame);
}


/* ---------- Shared with space.js ---------- */
window.OH = {
  THREE, renderer, canvas, reduceMotion, DEG,
  stars: { N, raRad, sinDec, cosDec, starColor, starSize, starBase, starPhase, STAR_VERTEX, STAR_FRAGMENT },
  BODY, labelLayer, placeOnScreen, select, closeCard, isSelected, showToast,
  helpers: { fmtMillions, lightTime, yearWords, cap, clamp },
  get mode() { return mode; },
  get observer() { return observer; },
  get skyBodies() { return SKY_BODIES; },
  space: null,                                   // space.js fills this in
};

// Start up (after space.js has loaded, so everything is ready)
window.addEventListener("DOMContentLoaded", () => {
  latInput.value = place.lat.toFixed(2); lonInput.value = place.lon.toFixed(2);
  leaderLine.style.display = "none";
  resize();
  placePanels();
  recomputeSky();
  updateReport();
  lastSkyUpdate = performance.now();
  setTimeout(daylightHint, reduceMotion ? 300 : 3200);
  requestAnimationFrame(frame);
});
})();
