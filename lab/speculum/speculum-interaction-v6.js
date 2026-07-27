const FRAME_DELAY = 2;

function pointerInit(event, clientX, clientY) {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    button: event.button,
    buttons: event.buttons,
    pressure: event.pressure,
    width: event.width,
    height: event.height,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    clientX,
    clientY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  };
}

export function logicalEventToCssPoint(canvas, event, devicePixelRatio = globalThis.devicePixelRatio || 1) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const dpr = Math.min(devicePixelRatio, 2);
  const logicalWidth = canvas.width / dpr;
  const logicalHeight = canvas.height / dpr;
  const scaleX = logicalWidth > 0 ? logicalWidth / rect.width : 1;
  const scaleY = logicalHeight > 0 ? logicalHeight / rect.height : 1;

  return {
    x: rect.left + (event.clientX - rect.left) / scaleX,
    y: rect.top + (event.clientY - rect.top) / scaleY,
  };
}

export function installResolvedPointerDown(canvas) {
  let replaying = false;
  let queued = false;
  let frame = 0;

  function cancelQueuedReplay() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    queued = false;
  }

  function replayAfterEngineFrame(init, remaining) {
    frame = requestAnimationFrame(() => {
      if (remaining > 1) {
        replayAfterEngineFrame(init, remaining - 1);
        return;
      }

      frame = 0;
      queued = false;
      replaying = true;
      try {
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      } finally {
        replaying = false;
      }
    });
  }

  function resolveBeforePin(event) {
    if (replaying || queued || event.button !== 0) return;
    const cssPoint = logicalEventToCssPoint(canvas, event);
    if (!cssPoint) return;

    const init = pointerInit(event, cssPoint.x, cssPoint.y);
    event.preventDefault();
    event.stopImmediatePropagation();

    // Prime the existing engine pointer handler immediately. The engine resolves
    // hover during its animation frame, so replay the press only after that frame.
    canvas.dispatchEvent(new PointerEvent('pointermove', init));
    queued = true;
    replayAfterEngineFrame(init, FRAME_DELAY);
  }

  canvas.addEventListener('pointerdown', resolveBeforePin);

  return () => {
    cancelQueuedReplay();
    canvas.removeEventListener('pointerdown', resolveBeforePin);
  };
}

function boot() {
  const canvas = document.getElementById('spc-canvas');
  if (canvas instanceof HTMLCanvasElement) installResolvedPointerDown(canvas);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
