# Public interface performance baseline

`data/performance-baseline.json` records deterministic source-level weight for representative Atlas Systems routes. It counts each route's HTML document and the repository-local assets referenced directly by that document.

This baseline is evidence, not a blocking budget. It does not claim network latency, browser paint timing, cache behaviour, JavaScript execution cost, dynamic imports, or third-party performance. Those remain browser-run evidence from isolated previews and production verification.

Regenerate the report with:

```bash
python3 scripts/measure_static_performance.py
```

Pull-request CI runs the same script with `--check-only` so source and evidence cannot drift. Blocking thresholds should be introduced only after the measured baseline has been reviewed across representative devices and routes.
