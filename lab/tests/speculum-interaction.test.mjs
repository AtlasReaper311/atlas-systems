import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { logicalEventToCssPoint } from '../speculum/speculum-interaction-v6.js';

const html = fs.readFileSync(new URL('../speculum/index.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../speculum/speculum-interaction-v6.js', import.meta.url), 'utf8');

test('logical pointer coordinates are inverted to the real narrow canvas box', () => {
  const canvas = {
    width: 640,
    height: 1160,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 288, height: 580 }),
  };
  const point = logicalEventToCssPoint(canvas, { clientX: 170, clientY: 310 }, 2);
  assert.deepEqual(point, { x: 154, y: 310 });
});

test('pointer resolution loads before the engine boot and waits for engine frames', () => {
  const interaction = html.indexOf('/lab/speculum/speculum-interaction-v6.js');
  const engineBoot = html.indexOf('/lab/speculum/speculum.js');
  assert.ok(interaction >= 0, 'interaction resolver is missing');
  assert.ok(engineBoot > interaction, 'interaction resolver must register before the engine boot');
  assert.match(source, /const FRAME_DELAY = 2/);
  assert.match(source, /new PointerEvent\('pointermove'/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /replayAfterEngineFrame\(init, FRAME_DELAY\)/);
  assert.match(source, /new PointerEvent\('pointerdown'/);
});
