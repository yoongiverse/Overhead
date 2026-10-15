// Planet facts for Overhead (written by hand). These don't change, so no API is needed.
// Positions are NOT stored here: astronomy-engine calculates them for any date.
//   key       = the name astronomy-engine uses
//   diameter  = width in kilometers
//   year      = days to go once around the Sun
//   color     = how it looks, used for its dot in the sky and its ball in the solar system view
//   size      = ball size in the solar system view (made-up units; real sizes would be invisible)
const PLANETS = [
  { key: "Sun",     name: "Sun",     kind: "star",   diameter: 1392700, year: null,  color: "#ffd27a", size: 4.6,
    fact: "Our star. Its light takes about 8 minutes to reach Earth. Never look straight at it." },
  { key: "Moon",    name: "Moon",    kind: "moon",   diameter: 3474,    year: 27.3,  color: "#d8d4ca", size: 0.4,
    fact: "Always shows Earth the same face. It goes around us about once a month." },
  { key: "Mercury", name: "Mercury", kind: "planet", diameter: 4879,    year: 88,    color: "#b9b1a6", size: 0.75,
    fact: "The smallest planet, and the closest to the Sun. It races round the Sun in just 88 days." },
  { key: "Venus",   name: "Venus",   kind: "planet", diameter: 12104,   year: 224.7, color: "#f3e3c0", size: 1.15,
    fact: "The hottest planet, about 465 °C under thick clouds. Often the brightest thing in the sky after the Moon." },
  { key: "Earth",   name: "Earth",   kind: "planet", diameter: 12742,   year: 365.25, color: "#4f8fe0", size: 1.2,
    fact: "Home. Everything you see in the sky view is seen from here." },
  { key: "Mars",    name: "Mars",    kind: "planet", diameter: 6779,    year: 687,   color: "#d9734a", size: 0.9,
    fact: "Red from rusty iron dust. Home to Olympus Mons, the tallest volcano known." },
  { key: "Jupiter", name: "Jupiter", kind: "planet", diameter: 139820,  year: 4333,  color: "#e2c9a2", size: 3.2,
    fact: "The largest planet. Its Great Red Spot is a storm wider than Earth." },
  { key: "Saturn",  name: "Saturn",  kind: "planet", diameter: 116460,  year: 10759, color: "#e8d29a", size: 2.7,
    fact: "Its bright rings are made mostly of ice. Small binoculars won't show them, but a small telescope will." },
  { key: "Uranus",  name: "Uranus",  kind: "planet", diameter: 50724,   year: 30687, color: "#a9dde4", size: 1.9,
    fact: "Spins on its side, so each pole gets about 42 years of daylight and then 42 years of darkness." },
  { key: "Neptune", name: "Neptune", kind: "planet", diameter: 49244,   year: 60190, color: "#6f8ff0", size: 1.85,
    fact: "The farthest planet and the windiest, with winds faster than the speed of sound on Earth." },
];
