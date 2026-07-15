export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createPanBounds(
  state,
  worldScale,
  marginRatio = 0.12,
) {
  const halfWidth = (state.width * worldScale) / 2;
  const halfHeight = (state.height * worldScale) / 2;
  const marginX = halfWidth * marginRatio;
  const marginZ = halfHeight * marginRatio;

  return {
    minX: -halfWidth - marginX,
    maxX: halfWidth + marginX,
    minZ: -halfHeight - marginZ,
    maxZ: halfHeight + marginZ,
  };
}

export function clampTarget(target, bounds) {
  if (!bounds) return { x: target.x, z: target.z };

  return {
    x: clamp(target.x, bounds.minX, bounds.maxX),
    z: clamp(target.z, bounds.minZ, bounds.maxZ),
  };
}

export function zoomLimits(defaultDistance) {
  return {
    minimum: Math.max(8, defaultDistance * 0.34),
    maximum: Math.max(36, defaultDistance * 1.72),
  };
}

export function clampZoom(distance, defaultDistance) {
  const limits = zoomLimits(defaultDistance);
  return clamp(distance, limits.minimum, limits.maximum);
}

export function zoomTargetTowardPoint({
  target,
  point,
  previousDistance,
  nextDistance,
  bounds,
  influence = 0.72,
}) {
  if (!point || previousDistance <= 0) {
    return clampTarget(target, bounds);
  }

  const movement =
    (1 - nextDistance / previousDistance) * influence;
  const nextTarget = {
    x: target.x + (point.x - target.x) * movement,
    z: target.z + (point.z - target.z) * movement,
  };

  return clampTarget(nextTarget, bounds);
}
