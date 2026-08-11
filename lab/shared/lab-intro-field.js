"use strict";

import { mountSecondarySurfaceField } from "../../static/js/secondary-surface-fields.js?v=20260728-composition-batch-two-v1";
import { ATLAS_FIELD_COMPOSITIONS } from "../../static/js/atlas-field-composition-registry.js?v=20260728-composition-batch-two-v1";

export const LAB_INTRO_FIELD = ATLAS_FIELD_COMPOSITIONS["signal-bloom"];

export function mountLabIntroField(root = document) {
  return mountSecondarySurfaceField(root, "/lab/");
}
