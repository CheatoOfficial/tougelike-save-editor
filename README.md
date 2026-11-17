# Tougelike+ Save Editor

A browser-based save editor, signer and verifier for [Tougelike+](https://njlent.de/tougelike/).
Load a save, edit it, and download it with a fresh signature that the game accepts as **GENUINE**.

**Use it:** https://cheatoofficial.github.io/tougelike-save-editor/

Everything runs locally in your browser. Nothing is uploaded, and there is no server and no build step.

## Features

- Loads the game's export (`tougelikeplus-save-….json`, from Options > SAVE) and the raw browser-storage save (`touge-like-plus-garage-v1`).
- Tells you whether the loaded file's signature is valid, invalid (edited) or missing.
- Quick edit: cash, best score and distance, runs, summit marks and upgrades, selected car.
- Garage: ownership, mastery XP (with level), the five part levels per car, boss wins.
- One-click: max cash, unlock all cars, max upgrades, mastery 10, unlock all achievements.
- Achievements: toggle any of the 40, including the hidden one.
- Raw JSON editor for everything else, such as statistics, perks, cosmetics and atlas.
- Exports a correctly signed `.json` (or `.sav`). You can choose to keep the honest `ALTERED` flag instead of `GENUINE`.

Tested end to end: a file produced by this tool shows **"Signed and unedited" / STATUS GENUINE** in the game's own Options > SAVE > LOAD dialog.

## How the signing works

Found by reading the public game bundle (`psx-renderer` chunk), not by guessing:

| | |
|---|---|
| Algorithm | HMAC-SHA-256, lowercase hex |
| Key | the string `tougelike+/savegame/v1/7c41e9a2d05b8f36a1e4c9d27b6f03e5`, hardcoded in the client |
| Message | `scope + "\n" + payload` |
| File export (scope `file`) | payload = the whole export **minus `integrity.signature`**, as compact `JSON.stringify` with **every object's keys sorted** |
| Browser storage (scope `garage`) | payload = the garage object minus `integrity.signature`, compact JSON in its stored key order |

Details that matter:

- `integrity` itself *is* signed (`status`, `alteredAt`, `reason`, `algorithm`); only the `signature` field is left out.
- Key order in the file does not matter, because keys are sorted before signing. JavaScript lists integer-like keys such as `"5"` and `"15"` first, in numeric order. This tool uses the same `JSON.stringify` replacer as the game, so it matches exactly.
- The key ships to every player, so the check only catches accidental edits. It is not real security.

The signing code is in [`core.js`](core.js): pure JavaScript with no dependencies and its own SHA-256, so it also works outside secure contexts. Run the tests with:

```
node test/test.js
node test/test.js path/to/a-real-export.json   # optional: verify real saves too
```

## The hidden achievement: Secret

The game has 40 achievements, but the menu counts out of 39 until you earn the last one, **Secret** ("Take a secret test drive.").

It is unlocked by driving in **TEST DRIVE**, a mode with no menu entry. Open it with a code on the title screen:

- **Keyboard:** the Konami code, `↑ ↑ ↓ ↓ ← → ← → B A`. Press each key once.
- **Phone / touch:** swipe `↑ ↑ ↓ ↓ ← → ← →` on the title screen (clear swipes of at least 40 px, not starting at the screen edge), or tap the Japanese title text 7 times quickly (under 0.6 s between taps).

A TEST DRIVE panel then lets you pick any car, including the traffic cars and the non-roster secret cars. You get a fully upgraded run with stock paint and engine. It pays cash and counts in statistics but never unlocks cars, and your garage is not changed. Start the run and Secret unlocks.

From the game code: the check is `secret: testDriveStarted || any non-roster car has distance > 0 in statistics`. The game's changelog also says Secret "is again earned only by a test drive".

## Notes

- Built for game version `00.22.41`. Later versions may change the save format or the key. Open an issue if the game rejects an export.
- Keep a backup of your original save.
- Unofficial fan tool, not affiliated with the game's author. For your own single-player save.

## License

MIT
