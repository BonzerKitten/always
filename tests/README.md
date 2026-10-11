# Checks for the site

These scripts are not part of the page. Nothing here is loaded by `index.html`.
They open the site in an invisible browser (Microsoft Edge by default) and check it automatically.

## Setup, once

    cd tests
    npm install

This downloads `puppeteer-core`, the tool that drives the browser, into `tests/node_modules` (ignored by git).
To use another Chromium browser, set `BROWSER_PATH` to its program file.

## The checks

| Command | What it checks |
|---|---|
| `node dates.js` | The four counters against an independent calculation, for every day of the next 35 years. No browser. |
| `node places.js` | Every place in `config.js` can be reached by taps, with its own caption, on PC and phone. Run it after adding a place. |
| `node layout.js` | No scrolling and no overlaps at 14 screen sizes. |
| `node hero.js` | The globe stays centred under the title as the big number grows. |
| `node globe.js` | Zooming, dragging, flights to a group, the pin on the rim, a damaged `land-detail.js`. `node globe.js E` runs one part. |

`lib.js`, `act.js` and `state.js` are shared helpers. To look inside the globe, the tests serve a copy of the site
in which `hook-tail.txt` replaces the last lines of `globe.js`; the real file is never changed. If the end of
`globe.js` changes, `hook-tail.txt` has to follow.

These were written quickly while the site was being built. They are dense, and they are tools, not examples of style.
