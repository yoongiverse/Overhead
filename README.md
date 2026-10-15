# Overhead

What's in the sky above you tonight: the real stars, planets, the Moon and passing satellites, for any place on Earth. Built step by step as a learning project in JavaScript, Python and APIs.

**Live demo:** : https://yoongiverse.github.io/Overhead/

## Build log

| Step | What it adds | Skills | Status |
| --- | --- | --- | --- |
| 1 | The 5,044 naked-eye stars on a sky dome for any city, plus an "is it dark yet?" report | JavaScript, canvas drawing, a Python data script | Done |
| 1.5 | Redesign: full-screen 3D sky you can look around, glowing and twinkling stars, Milky Way, frosted-glass panels, smooth flights between cities, click a star to identify it | three.js, shaders, CSS glass and animation | Done |
| 2 | The Sun, Moon and planets in their real positions (the Moon shows its real phase), plus a 3D solar system view with time warp | Using a library, 3D lighting, two views sharing code | Done |
| 3 | Constellation lines and names you can toggle; clicking a star frames its whole constellation; point at a star to see its name | Python data processing, working with data files | Done |
| 4 | Time slider, city vs countryside darkness slider | Interaction | Next |
| 5 | "Will it be cloudy tonight?" from a live weather API | APIs in JavaScript and Python | Planned |
| 6 | The ISS and other satellites crossing the sky | APIs, live data | Planned |

## How it works

- **Stars** come from a catalog file (`data/stars.js`). Each star has a fixed "address" on the sky.
- **The 3D sky** is drawn with [three.js](https://threejs.org). You stand at the center of a giant sphere; stars are glowing points on it.
- **The sky turns, the stars don't.** The [astronomy-engine](https://github.com/cosinekitty/astronomy) library works out where each star appears from your location at the current time.
- **Planets move**, so they aren't in a catalog. astronomy-engine works out where each one is for any date, in your sky and around the Sun.
- **Python prepares the data.** `tools/build_star_catalog.py` reads the large raw files in `data/raw/` and writes the small file the web page loads.

## Project layout

```
index.html                    the page structure
styles.css                    the look: glass panels, glow, animation
sky.js                        the view from the ground: sky, stars, planets, the details card
space.js                      the solar system view
data/planets.js               facts about the Sun, Moon and planets (written by hand)
data/stars.js                 star catalog the page loads (made by a Python script)
data/constellations.js        constellation figures and names (made by a Python script)
data/raw/                     original data the scripts read
tools/build_star_catalog.py   builds data/stars.js, including each star's constellation
tools/build_constellations.py builds data/constellations.js
```

## Run the Python script

You need Python 3 installed (python.org). Then, in a terminal opened in this folder:

```
python tools/build_star_catalog.py
python tools/build_constellations.py
```

On Windows you may need `py` instead of `python`. Each script prints a short summary of what it wrote.

## What I learned

### Step 1
- Magnitude measures brightness, and smaller numbers are brighter. Sirius is -1.44; the faintest stars you can see are about 6.
- Stars have fixed positions on the sky. What changes is your view as Earth spins.
- A Python script can turn messy raw data into a clean file for a web page.

### Step 1.5
- A web page can be split into structure (HTML), looks (CSS) and behavior (JavaScript).
- Frosted glass is a CSS blur of whatever is behind a panel (`backdrop-filter`).
- Smooth motion comes from gliding a little toward a goal every frame instead of jumping there.

### Step 2
- Planets drift against the stars from night to night, so their positions are calculated, not stored.
- The Moon's phase isn't drawn by hand: it's a ball lit from the Sun's real direction, so the right part is lit automatically.
- To fit the whole solar system on screen, distances are squeezed (square root) and planets enlarged. A real-scale model would be almost all empty space.
- Two views can share code through one shared object (`OH`), so each file stays focused on one job.

### Step 3
- The sky is officially divided into 88 constellation regions, like countries on a map.
- To check whether a point is inside a shape, draw a line out from it and count how many times it crosses the border: odd means inside.
- Testing a result against known answers (Betelgeuse is in Orion, Vega is in Lyra) is how you catch bugs in your own code.

## Credits

- Star data: ESA Hipparcos mission via the XHIP compilation (Anderson & Francis 2012), packaged by [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause, see `data/LICENSE-d3-celestial.txt`).
- 3D graphics: [three.js](https://threejs.org) (MIT).
- Sky calculations: [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT).
