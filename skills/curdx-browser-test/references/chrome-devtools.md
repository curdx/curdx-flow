# chrome-devtools-mcp integration for curdx-browser-test

## When to use this path

`.curdx/config.json` `browser_testing.mode` is `chrome-devtools` or `both` (for WebGL/canvas/perf parts).

Use this path when the feature involves:
- WebGL / WebGL2 rendering (three.js, babylon.js, ogl, regl, raw)
- Canvas2D drawing (pixi.js, konva, charting libraries)
- Maps (mapbox-gl, maplibre-gl, leaflet, cesium, deck.gl)
- Performance-critical rendering where FPS / Core Web Vitals matter
- Memory-leak-prone code (long-running canvases, uncleared references)

## Install

From `/curdx:init`:

```bash
claude mcp add chrome-devtools --scope project -- npx -y chrome-devtools-mcp@latest --isolated
```

`--isolated` uses an ephemeral Chrome profile auto-cleaned on exit; safer default for per-session verification.

## The 29 MCP tools

The server exposes these via MCP. Invoke them the normal Claude Code way (tool calls):

### Navigation (6)
- `new_page(url, background?, isolatedContext?, timeout?)` — open a new tab
- `navigate_page(type, url, timeout?, ignoreCache?, handleBeforeUnload?, initScript?)` — navigate current tab
- `list_pages()` — enumerate open tabs
- `select_page(pageId, bringToFront?)`
- `close_page(pageId)`
- `wait_for(text, timeout?)` — wait until text appears in the page

### Input (9)
- `click(uid, dblClick?, includeSnapshot?)`
- `drag(from_uid, to_uid, includeSnapshot?)`
- `fill(uid, value, includeSnapshot?)`
- `fill_form(elements, includeSnapshot?)`
- `handle_dialog(action, promptText?)`
- `hover(uid, includeSnapshot?)`
- `press_key(key, includeSnapshot?)`
- `type_text(text, submitKey?)`
- `upload_file(filePath, uid, includeSnapshot?)`

Element `uid`s come from `take_snapshot` which returns an accessibility-tree text snapshot.

### Emulation (2)
- `emulate(colorScheme?, cpuThrottlingRate?, geolocation?, networkConditions?, userAgent?, viewport?)` — match production conditions
- `resize_page(width, height)`

### Performance (4) — the killer features
- `performance_start_trace(reload?, autoStop?, filePath?)` — records CDP traces
- `performance_stop_trace(filePath?)`
- `performance_analyze_insight(insightSetId, insightName)` — e.g., `LCPBreakdown`, `DocumentLatency`
- `take_memory_snapshot(filePath?)` — V8 heap snapshot

### Network (2)
- `list_network_requests(pageIdx?, pageSize?, resourceTypes?, includePreservedRequests?)`
- `get_network_request(reqid, requestFilePath?, responseFilePath?)`

### Debugging (6)
- `evaluate_script(function, args?)` — runs JS in the page context; return must be JSON-serializable
- `take_screenshot(uid?, filePath?, format?, fullPage?, quality?)` — PNG/JPEG/WebP
- `take_snapshot(filePath?, verbose?)` — a11y-tree with uids
- `list_console_messages(...)`
- `get_console_message(msgid)`
- `lighthouse_audit(device?, mode?, outputDirPath?)` — runs Lighthouse

## VE2 pattern — WebGL / canvas verification

```
// pseudo — actual tool calls are JSON via the MCP layer
1. new_page({url: 'http://localhost:3000/scene', isolatedContext: true})
2. wait_for({text: 'Loaded', timeout: 15000})
3. evaluate_script({
     function: '() => ({
       center: window.map?.getCenter().toArray(),
       zoom: window.map?.getZoom(),
       loaded: window.map?.loaded(),
       mesh_count: window.scene?.children?.length,
       fps: window.__FPS__,
     })',
   })
   // save result to evidence/
4. take_screenshot({
     fullPage: true,
     filePath: '.curdx/features/<id>/evidence/scene-loaded.png'
   })
5. list_console_messages({})
   // assert zero errors (or filter third-party)
6. close_page(...)
```

## VE2 pattern — performance verification

```
1. new_page({url: 'http://localhost:3000/heavy-page'})
2. performance_start_trace({reload: true, autoStop: false})
3. // user interactions via click/fill/...
4. performance_stop_trace({filePath: '.curdx/features/<id>/evidence/trace.json'})
5. performance_analyze_insight({insightSetId: <from stop_trace>, insightName: 'LCPBreakdown'})
6. // optionally: lighthouse_audit({mode: 'navigation', outputDirPath: '.curdx/features/<id>/evidence/lighthouse/'})
```

## VE2 pattern — memory leak check

```
1. new_page({url: 'http://localhost:3000/long-running'})
2. take_memory_snapshot({filePath: '.curdx/features/<id>/evidence/heap-before.heapsnapshot'})
3. // trigger the behavior many times (e.g., navigate in/out of a route 20 times)
4. take_memory_snapshot({filePath: '.curdx/features/<id>/evidence/heap-after.heapsnapshot'})
5. // diff snapshots offline OR evaluate_script to read window.performance.memory
```

## Detecting the right feature type

Read `package.json` deps:

- `three` / `@react-three/fiber` → three.js. Verify scene.children length / renderer.info.
- `mapbox-gl` / `maplibre-gl` → Mapbox. Verify `map.loaded()`, `map.getCenter()`, `map.getZoom()`.
- `leaflet` → Leaflet. Verify `map.getCenter()`, markers count.
- `cesium` → Cesium. Verify `viewer.scene.globe.tilesLoaded === 0` after camera settles.
- `deck.gl` / `@deck.gl/core` → deck.gl. Verify layer count + tooltip behavior.
- `pixi.js` → Pixi. Verify `app.stage.children.length`.

If the spec mentions any of these, include specific assertions against `window.<global>` in `evaluate_script`.

## Constraints of this path (vs Playwright)

- Chrome-only (no Firefox / WebKit)
- No built-in test runner — you orchestrate tool calls manually
- Harder to assert declaratively — no `expect(...).toBeVisible()`; you write JS in `evaluate_script`
- Better for: debugging, profiling, WebGL-specific pixel-level checks
- Worse for: regression-style assertions across many pages and interactions

If you need both: use Playwright for the interaction/assertion flow, and invoke chrome-devtools-mcp for the WebGL- or performance-specific moments only. They coexist (different MCP server keys).

## Evidence-file naming

| Artifact | Suggested filename |
|----------|-------------------|
| Page screenshot | `evidence/screenshot-<what>.png` |
| Trace | `evidence/trace-<what>.json` (CDP trace, viewable in chrome://tracing) |
| Lighthouse | `evidence/lighthouse/` (directory) |
| Heap snapshot | `evidence/heap-<phase>.heapsnapshot` (openable in Chrome DevTools → Memory) |
| evaluate_script result | `evidence/eval-<what>.json` (pretty-printed JSON) |

## Self-review

- [ ] `take_screenshot` was called with explicit `filePath` (not inline base64)
- [ ] `list_console_messages` was called and the result filtered
- [ ] `close_page` was called for every opened page (leaks hurt Chrome lifecycle)
- [ ] `--isolated` flag was used (no cross-session state leakage)
