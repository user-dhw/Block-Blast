# Verification — 23 October 2026

All checks below were run against the implementation in this folder. Existing Voice2Invoice applications were preserved.

## Automated checks

- A clean `npm ci` installation from the official npm registry completed successfully.
- `npm run lint` passed with no warnings or errors.
- `npm run test` passed **61 tests across 3 files**: 26 engine tests, 32 storage tests and 3 coordinate tests.
- `npm run build` passed strict TypeScript checking and generated the static production application.
- `PAGES_BASE_PATH=/grid-burst/ npm run build -- --outDir /private/tmp/grid-burst-pages-dist` also passed, validating an explicit repository asset base.

The tests cover all twenty requested engine/persistence topics, including simultaneous row/column clears with unique intersection counts, tray refill timing, terminal-state decisions, bounded solver fallback, reproducible RNG continuation through a tray refill, invalid storage and unavailable storage. Seeded simulations cover 18 runs with up to 24 moves per run across the three difficulties and both modes.

## Browser interaction checks

Using the local development server and the production preview:

1. Placed pieces by selecting a tray slot and clicking a board cell. Score and occupied cells updated together.
2. Tried placing a piece on an occupied cell. Score, tray and board remained unchanged.
3. Dragged a piece from its tray to the board with a real pointer gesture. The piece was committed once, and using the third piece produced exactly one new three-piece tray.
4. Reloaded a seven-point game. All seven occupied cells, remaining tray and score restored.
5. Restarted through the confirmation dialog. Classic returned to 64 empty cells and zero points; the personal best survived.
6. Selected a piece with Enter, moved board focus using an arrow key, and placed it with Enter. The score increased by the correct four points.
7. Started Random Challenge. It produced clustered occupied cells and a playable tray.
8. Entered a complete replay link in Settings, restarted, then replayed its seed. The rendered board and all three piece descriptions matched exactly.
9. Served the compiled app at `http://127.0.0.1:4174/grid-burst/`. Its assets loaded, placement scored correctly, reload restored that score, and no browser warnings/errors were reported.

### Reproducible row-clear smoke check

Historical baseline from the original generator: Classic, Normal with seed **`browser-smoke`**. The October 25 weight adjustment changes seeded piece sequences, so the moves below document the original release rather than a replay recipe for the current build. To start fresh when a matching game is already saved, use Settings → Replay seed rather than refreshing the same URL.

| Move | Tray slot | Target (visible row, column) | Score after move |
| --- | --- | --- | --- |
| 1 | 1 | Row 1, column 1 | 4 |
| 2 | 2 | Row 1, column 3 | 7 |
| 3 | 3 | Row 2, column 5 | 10 |
| 4 | 1 of the new tray | Row 1, column 7 | 115 |

Move four clears all eight cells in row two, increases total lines to one, and displays the line-clear animation and +105 feedback. All eight cleared cells were verified empty in the rendered board.

## Responsive visual checks

| Viewport | Board size | Result |
| --- | --- | --- |
| 1440 × 900 desktop | 416 × 416 | All gameplay controls fit; no document overflow. |
| 390 × 844 portrait | 358 × 358 | Board, tray and controls fit; no document overflow. |
| 375 × 667 small portrait | 282 × 282 | Board, tray and controls fit; no document overflow. |
| 667 × 375 landscape | 305 × 305 | Board sits beside score/tray/controls; no document overflow. |

Screenshots: [desktop](screenshot.jpg), [phone portrait](mobile.jpg). These show the real seeded challenge **`grid-burst-qa`**, including its generated opening and tray, rather than a decorative board state.

## Verification limits

Physical iPhone/Android dragging, Safari/Firefox-specific rendering, audible output and hardware haptics were not tested. Touch coordinate conversion is covered by unit tests; the real browser drag check used a mouse pointer. The repository now deploys to [GitHub Pages](https://user-dhw.github.io/Block-Blast/) through the root workflow on pushes to `main`.

## October 25, 2026: gentle difficulty tuning and pickaxe

- ESLint, all **95 unit/simulation tests** and a production build with `PAGES_BASE_PATH=/Block-Blast/` passed locally.
- Piece distribution tests compare 3,072 generated pieces per difficulty against the original weights: small pieces become more common and large pieces less common, while Casual, Normal and Hard retain their relative difficulty.
- Real browser checks confirmed one-cell removal, unchanged score after removal, empty clicks costing nothing, cancellation by button/keyboard, exactly three uses, disabled controls at zero, and a fresh run restoring three uses.
- Reloading after one use retained **2/3** and the edited board. A legacy v1 save without a tool field retained its game and received **3/3**.
- A temporary local fixture with a blocked checkerboard and horizontal domino tray verified the game-over rescue button, restored legal moves after clearing one cell, and successful placement afterward. Settings opened immediately after a terminal move remained visible after the delayed game-over interval. The fixture was removed before committing.
- Browser viewport checks at **390×844**, **375×667** and **667×375** confirmed the pickaxe, new-game and help controls fit within the viewport with no horizontal document overflow. These are browser size checks, not physical-device touch tests.
