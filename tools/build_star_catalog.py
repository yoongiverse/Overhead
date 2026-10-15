"""
build_star_catalog.py
=====================

Turns the raw star data in data/raw/ into data/stars.js, the small file the web page loads.

Why this script exists:
    The raw files are big and in a format made for a different project.
    The web page only needs a few facts per star, so Python reads the raw
    files once, keeps what we need, and writes a tidy file for the browser.

What it adds:
    For every star, which constellation it belongs to. The sky is officially
    divided into 88 regions (like countries on a map), and every star sits in one.

How to run it (from the project folder, in a terminal):
    python tools/build_star_catalog.py        (on Windows you may need: py tools/build_star_catalog.py)

You only need to run it again if you change this script or the raw data.
"""

# --- 1. Imports --------------------------------------------------------------
# "import" loads a tool that comes with Python.
#   json    -> reads and writes JSON (the same format APIs send)
#   pathlib -> works with file and folder paths on any computer
import json
from pathlib import Path


# --- 2. Settings -------------------------------------------------------------
# Path(__file__) is this script. .parent is the "tools" folder,
# and .parent again is the project folder.
PROJECT = Path(__file__).parent.parent
RAW = PROJECT / "data" / "raw"
RAW_STARS = RAW / "stars.6.json"
RAW_NAMES = RAW / "starnames.json"
RAW_BOUNDS = RAW / "constellations.bounds.json"
OUTPUT = PROJECT / "data" / "stars.js"


# --- 3. Functions ------------------------------------------------------------
# A function is a named, reusable recipe. "def" starts one.

def load_json(path):
    """Open a JSON file and turn it into Python data (lists and dictionaries)."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def to_number(value):
    """Turn text like "0.911" into the number 0.91. Return None if it isn't a number."""
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def degrees_to_hours(longitude):
    """
    The raw file stores a star's sky position like a map longitude (-180 to 180 degrees).
    Astronomers use "right ascension" in hours (0 to 24) instead.
    The sky is a 360-degree circle split into 24 hours, so 15 degrees = 1 hour.
    """
    return (longitude % 360) / 15


def unroll(points):
    """
    Lay a border out flat like a world map. Borders that cross the 0/360 line
    would otherwise jump across the whole map, so we keep each step short.
    """
    flat = [list(points[0])]
    for lon, lat in points[1:]:
        prev = flat[-1][0]
        lon = prev + ((lon - prev + 180) % 360) - 180      # take the short way round
        flat.append([lon, lat])
    # A border around a pole (like Polaris's Ursa Minor) goes all the way round.
    # Close it off by running along the pole.
    turned = flat[-1][0] - flat[0][0] + ((flat[0][0] - flat[-1][0] + 180) % 360) - 180
    if abs(turned) > 180:
        pole = 90 if sum(p[1] for p in flat) > 0 else -90
        end_lon = flat[0][0] + turned
        flat += [[end_lon, flat[0][1]], [end_lon, pole], [flat[0][0], pole]]
    return flat


def inside_flat(lon, lat, border):
    """
    Classic "ray" test: draw a line from the point going one way and count how
    many times it crosses the border. Odd = inside, even = outside.
    """
    inside = False
    for (x1, y1), (x2, y2) in zip(border, border[1:] + border[:1]):
        if (y1 > lat) != (y2 > lat):
            cross_x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < cross_x:
                inside = not inside
    return inside


def load_borders(bounds):
    """Prepare every constellation border once, so checking 5,000 stars is quick."""
    borders = []
    for feature in bounds["features"]:
        points = [tuple(p) for p in feature["geometry"]["coordinates"][0]]
        if points[0] == points[-1]:                        # drop the repeated last point
            points = points[:-1]
        borders.append((feature["id"], unroll(points)))
    return borders


def which_constellation(longitude, latitude, borders):
    """Return the 3-letter code of the constellation a sky position is in, like "Ori" for Orion."""
    for code, border in borders:
        # The flat map repeats every 360°, so try the point at each copy.
        for shift in (-360, 0, 360):
            if inside_flat(longitude + shift, latitude, border):
                return code
    return ""


def build_rows(stars, names, borders):
    """Make one short row per star: [id, right ascension, declination, magnitude, color, name, constellation]."""
    rows = []
    for star in stars["features"]:                       # loop: repeat for every star
        star_id = star["id"]
        longitude, declination = star["geometry"]["coordinates"]
        props = star["properties"]

        # names.get(...) looks up the star's info, giving {} if it has none.
        info = names.get(str(star_id), {})
        name = info.get("name", "")

        # Many stars already have their constellation listed ("c"). Use it if so;
        # otherwise work it out from the borders.
        constellation = info.get("c") or which_constellation(longitude, declination, borders)

        rows.append([
            star_id,
            round(degrees_to_hours(longitude), 4),
            round(declination, 3),
            to_number(props["mag"]),
            to_number(props.get("bv")),
            name,
            constellation,
        ])

    # Sort brightest first. In astronomy SMALLER magnitude = BRIGHTER.
    rows.sort(key=lambda row: row[3])
    return rows


def write_js(rows, path):
    """Write the rows as a JavaScript file the web page can load with a <script> tag."""
    header = f"""// Star catalog for Overhead (generated by tools/build_star_catalog.py, do not edit by hand)
// Every star bright enough to see with the naked eye (magnitude 6 or brighter): {len(rows)} stars.
// Each row is: [Hipparcos ID, right ascension (hours), declination (degrees), magnitude, B-V color index, name, constellation]
//   right ascension + declination = the star's fixed "address" on the sky
//   magnitude = brightness; SMALLER numbers are BRIGHTER (Sirius is -1.44, the faintest here are about 6)
//   B-V color index = color; low = blue-white, high = orange-red
//   constellation = 3-letter code of the region of sky it's in, like "Ori" for Orion
// Sorted brightest first.
// Data from d3-celestial by Olaf Frohn (BSD-3-Clause, see data/LICENSE-d3-celestial.txt),
// derived from the XHIP extended Hipparcos compilation (Anderson & Francis 2012).
const STAR_CATALOG = [
"""
    body = ",\n".join(json.dumps(row, ensure_ascii=False) for row in rows)
    path.write_text(header + body + "\n];\n", encoding="utf-8")


# --- 4. The main program -------------------------------------------------------
# This block runs only when you run this file directly.
if __name__ == "__main__":
    stars = load_json(RAW_STARS)
    names = load_json(RAW_NAMES)
    borders = load_borders(load_json(RAW_BOUNDS))

    print("Working out which constellation each star is in ...")
    rows = build_rows(stars, names, borders)
    write_js(rows, OUTPUT)

    named = [row for row in rows if row[5]]              # keep only rows that have a name
    missing = [row for row in rows if not row[6]]
    print(f"Wrote {len(rows)} stars ({len(named)} with names) to {OUTPUT}")
    print("Brightest five:", ", ".join(f"{row[5] or 'HIP ' + str(row[0])} ({row[6]})" for row in rows[:5]))
    if missing:
        print(f"Note: {len(missing)} stars didn't match a constellation")
