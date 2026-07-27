import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const html = read('lab/speculum/index.html');
const css = read('lab/speculum/speculum-accessibility-v7.css');

test('scrollable rail regions are named and keyboard focusable', () => {
  assert.match(html, /class="controls"[^>]*role="region"[^>]*aria-label="Speculum controls"[^>]*tabindex="0"/);
  assert.match(html, /class="detail"[^>]*role="region"[^>]*aria-label="Node dossier"[^>]*tabindex="0"/);
  assert.match(html, /class="ledger"[^>]*aria-label="Generated observation ledger"[^>]*tabindex="0"/);
  assert.match(css, /\.controls:focus-visible,[\s\S]*\.detail:focus-visible,[\s\S]*\.ledger:focus-visible/);
});

test('muted interface text uses the accessible Atlas text token', () => {
  assert.match(html, /speculum-accessibility-v7\.css\?v=20260728-accessibility-v7/);
  assert.match(css, /--text-faint:\s*var\(--text-dim\)/);
  for (const selector of [
    '.snapshot-label',
    '.stats',
    '.key-item',
    '.hint',
    '.dossier-term',
    '.ledger-context',
    '.ledger .spc-t',
    'footer p',
  ]) {
    assert.ok(css.includes(selector), `missing contrast override for ${selector}`);
  }
  assert.match(css, /color:\s*var\(--text-dim\)\s*!important/);
  assert.match(css, /opacity:\s*1/);
});
