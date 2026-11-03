import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxDrag, inboxWidth } from '../../src/web/attention/inbox-widths.ts';

test('the Inbox panels keep an integer width inside their limits', () => {
  assert.equal(inboxWidth(320.4, 224, 480), 320);
  assert.equal(inboxWidth(120, 224, 480), 224);
  assert.equal(inboxWidth(900, 224, 480), 480);
});

test('dragging grows the left panel to the right and the right panel to the left', () => {
  assert.equal(inboxDrag(288, 40, 'left', 224, 480), 328);
  assert.equal(inboxDrag(288, -40, 'left', 224, 480), 248);
  assert.equal(inboxDrag(320, -40, 'right', 240, 560), 360);
  assert.equal(inboxDrag(320, 40, 'right', 240, 560), 280);
  // Los topes valen igual en los dos sentidos.
  assert.equal(inboxDrag(288, 900, 'left', 224, 480), 480);
  assert.equal(inboxDrag(320, 900, 'right', 240, 560), 240);
});
