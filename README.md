# Pokennections

Pokennections is a browser version of a Pokemon-themed Connections puzzle.
Each puzzle gives you 16 Pokemon and asks you to find four hidden groups of
four. The categories can be obvious, like type or region, or more specific,
like abilities, moves, evolution traits, stat thresholds, forms, colors, egg
groups, and other Pokemon trivia.

The browser version is static HTML/CSS/JavaScript. It runs locally, loads puzzle
rules from text files, and shows both sprites and names on every tile.

## Features

- Connections-style 4-by-4 puzzle board
- Pokemon sprites and readable names on every tile
- Dark mode interface
- Shuffle, deselect, new game, and submit controls
- Keyboard shortcuts for faster play
- "Possible Rules" modal listing the rule families used by the generator
- Local rule files, so adding new categories does not require changing the UI
- Sprite URL caching in `localStorage` to reduce repeated PokeAPI lookups

## Running Locally

The page fetches local rule files from `rules/`, so it needs to be served over
HTTP. Opening `pokennections.html` directly with `file://` will usually block
those fetches.

From this folder, run:

```sh
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/pokennections.html
```

If port 8000 is already in use, choose another port:

```sh
python -m http.server 8765
```

Then open:

```text
http://localhost:8765/pokennections.html
```

## How To Play

1. Select four Pokemon that you think share a hidden rule.
2. Press **Submit**.
3. Correct groups are locked into solved rows.
4. Incorrect guesses add a strike.
5. Solve all four groups before reaching four strikes.

The **Rules** button shows the possible rule categories and values. It is meant
as a hint/reference list, especially because some categories depend on deeper
Pokemon data.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Submit the selected group |
| `Space` | Shuffle unsolved tiles |
| `Escape` | Deselect all tiles, or close the rules modal |
| `N` | Start a new game |

## Project Structure

```text
pokennections/
  pokennections.html        Browser entry point
  css/
    connections.css         Main styles
  js/
    connections_app.js      Game logic, rendering, and rule loading
    responsive-connections.js
                            Mobile viewport/layout adjustments
  rules/
    manifest.json           List of rule files to load
    abilities/              Ability-based rule files
    colors/                 Color rule files
    egg_groups/             Egg group rule files
    evolution/              Evolution-related rule files
    growth_rates/           Growth rate rule files
    misc/                   Legendary, starter, form, and other rules
    moves/                  Move-learning rule files
    regions/                Region rule files
    shapes/                 Body shape rule files
    stats/                  Stat threshold rule files
    types/                  Type rule files
```

The Python files in the root are helper/source scripts used to generate or
prepare rule data.

## Adding Or Editing Rules

Rules live in `rules/<category>/<rule-name>.txt`.

Each rule file should contain one Pokemon per line:

```text
bulbasaur
ivysaur
venusaur
oddish
```

Use PokeAPI-style names where possible:

- lowercase names
- hyphens instead of spaces
- examples: `mr-mime`, `farfetchd`, `nidoran-f`, `golem-alola`

After creating a rule file, add its path without the `.txt` extension to
`rules/manifest.json`:

```json
[
  "types/fire",
  "abilities/levitate",
  "misc/starter"
]
```

## Puzzle Generation Notes

The generator chooses four rule files, then picks four Pokemon for each chosen
rule. It also validates the final board so that:

- each chosen rule appears exactly four times
- no unchosen rule accidentally appears exactly four times
- a puzzle contains at most one rule from `regions/` or `types/`
- a puzzle contains at most one rule from the second broad family:
  `colors/`, `egg_groups/`, `growth_rates/`, or `shapes/`

This keeps boards from becoming ambiguous while still allowing overlapping
Pokemon trivia.

## Browser Notes

Sprites are resolved through PokeAPI data and cached in `localStorage`. If a
sprite cannot be found or loaded, the tile still shows the Pokemon name.

Because this is a static browser app, there is no build step and no package
install step.

## Credits

Inspired by NYT Connections and the Pokemon series. This is a fan-made project.
