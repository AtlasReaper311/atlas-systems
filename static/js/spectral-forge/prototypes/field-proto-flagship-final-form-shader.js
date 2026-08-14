"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";

export const FINAL_FIELD_COUNT = 7;

function shaderPrelude() {
  return `
#define ATLAS_FINAL_FIELD_COUNT ${FINAL_FIELD_COUNT}
uniform vec4 uAtlasFields[ATLAS_FINAL_FIELD_COUNT];
uniform vec4 uAtlasFieldParamsA[ATLAS_FINAL_FIELD_COUNT];
uniform vec4 uAtlasFieldParamsB[ATLAS_FINAL_FIELD_COUNT];
uniform float uAtlasPhase;
uniform float uAtlasActivity;
uniform float uAtlasDamage;
uniform float uAtlasDisplacement;
uniform float uAtlasPhaseDisagreement;
uniform float uAtlasCoherenceLoss;
uniform float uAtlasLateralSpread;
uniform float uAtlasCompression;
uniform float uAtlasStretch;
uniform float uAtlasAfterimage;
uniform float uAtlasBreathing;
uniform float uAtlasMicrostructure;
uniform float uAtlasBrilliance;
uniform float uAtlasEmission;
uniform float uAtlasAudioEnergy;
uniform float uAtlasIdentitySeed;
uniform float uAtlasRouteEnabled;
uniform float uAtlasRouteCenter;
uniform float uAtlasRouteWidth;
varying float vAtlasStress;
varying float vAtlasRoute;
varying float vAtlasMicro;

float atlasSat(float value) {
  return clamp(value, 0.0, 1.0);
}

float atlasRouteValue(vec3 p) {
  if (uAtlasRouteEnabled < 0.5) return 0.0;
  float routeDistance = abs((p.x * 0.5 + 0.5) - uAtlasRouteCenter);
  float falloff = atlasSat(1.0 - routeDistance / max(0.035, uAtlasRouteWidth));
  float latitudeOffset = (p.y + sin(p.z * 2.2 + uAtlasPhase * 0.18) * 0.11) * 1.85;
  float latitudeSq = latitudeOffset * latitudeOffset;
  float latitude = 1.0 / (1.0 + latitudeSq * 2.6 + latitudeSq * latitudeSq * 0.8);
  return falloff * falloff * latitude;
}

vec3 atlasFinalDisplaced(vec3 source, out float stressOut, out float routeOut, out float microOut) {
  vec3 p = normalize(source);

  float identity = sin(p.x * 2.1 + p.y * 1.7 - p.z * 1.35 + uAtlasIdentitySeed) * 0.016
    + cos(p.x * 1.15 - p.y * 2.35 + p.z * 1.8 - uAtlasIdentitySeed * 0.7) * 0.011;
  float breath = (uAtlasBreathing - 0.5) * (0.016 + uAtlasDisplacement * 0.014);

  float radial = identity + breath;
  vec3 flow = vec3(0.0);
  float gradient = 0.0;
  float overlap = 0.0;
  float sourceEnergy = 0.0;
  float sinkEnergy = 0.0;

  float ridgeScale = (0.021 + uAtlasDisplacement * 0.034 + uAtlasDamage * 0.02) * uAtlasAudioEnergy;

  for (int i = 0; i < ATLAS_FINAL_FIELD_COUNT; i++) {
    vec4 field = uAtlasFields[i];
    vec4 paramsA = uAtlasFieldParamsA[i];
    vec4 paramsB = uAtlasFieldParamsB[i];

    vec3 centre = field.xyz;
    float polarity = field.w;
    float strength = paramsA.x;
    float invExtent = paramsA.y;
    float fieldFlow = paramsA.z;
    float fieldSwirl = paramsA.w;
    float crest = paramsB.x;
    float waveFrequency = paramsB.y;
    float wavePhase = paramsB.z;
    float crestGate = paramsB.w;

    float dotValue = clamp(dot(p, centre), -1.0, 1.0);
    float distance2 = max(0.0, 2.0 - 2.0 * dotValue);
    float q = 1.0 - distance2 * invExtent;
    if (q <= 0.0) continue;

    float q2 = q * q;
    float influence = q2 * (3.0 - 2.0 * q);
    float ring = influence * (1.0 - influence) * 4.0;
    float absoluteEnergy = influence * strength;
    float signedEnergy = absoluteEnergy * polarity;

    radial += signedEnergy * 1.14 * uAtlasAudioEnergy;
    gradient += ring * strength;
    overlap += influence * influence;
    if (polarity > 0.0) sourceEnergy += absoluteEnergy * polarity;
    else sinkEnergy += absoluteEnergy * -polarity;

    if (ring > 0.0005) {
      float tangentSq = max(0.0001, 1.0 - dotValue * dotValue);
      vec3 tangent = (centre - p * dotValue) * inversesqrt(tangentSq);
      float pull = ring * fieldFlow * polarity * 1.12 * uAtlasAudioEnergy;
      flow += tangent * pull;

      vec3 swirlAxis = cross(p, centre);
      float wave = sin(dotValue * waveFrequency + wavePhase);
      float swirl = influence * fieldSwirl * wave * uAtlasAudioEnergy;
      flow += swirlAxis * swirl;
      radial += ring * wave * ridgeScale;

      if (crestGate > 0.001 && polarity > 0.0) {
        float crestBase = max(0.0, 0.5 + 0.5 * wave);
        float crest2 = crestBase * crestBase;
        float crestPulse = crest2 * crest2 * sqrt(crestBase);
        float influence3 = influence * influence * influence;
        radial += influence3 * crestGate * crestPulse * crest * 1.18 * uAtlasAudioEnergy;
      }
    }
  }

  float conflict = atlasSat(overlap / float(ATLAS_FINAL_FIELD_COUNT) * 2.25);
  float gatherDelta = (sourceEnergy - sinkEnergy) * 4.2;
  float gather = gatherDelta / (1.0 + abs(gatherDelta));
  float conflictWave = sin(dot(p, vec3(5.0, -4.1, 3.6)) + uAtlasPhase * 1.33 + uAtlasIdentitySeed);
  radial += conflict * conflictWave
    * (0.032 + uAtlasPhaseDisagreement * 0.052 + uAtlasDamage * 0.044)
    * uAtlasAudioEnergy;
  radial += gather * conflict * (0.028 + uAtlasDisplacement * 0.044);

  float counterA = sin(dot(p, vec3(2.0, -1.35, 1.62)) + uAtlasPhase * 0.78 + uAtlasIdentitySeed * 0.4);
  float counterB = cos(dot(p, vec3(1.12, 2.28, -1.34)) - uAtlasPhase * 0.53 + uAtlasIdentitySeed * 0.8);
  radial += counterA * counterB
    * (0.032 + uAtlasDisplacement * 0.04 + uAtlasActivity * 0.022)
    * uAtlasAudioEnergy;

  float mesoA = sin(dot(p, vec3(9.8, -8.2, 7.6)) + uAtlasPhase * (0.68 + uAtlasActivity * 0.19));
  float mesoB = cos(dot(p, vec3(-7.1, 11.2, 8.7)) - uAtlasPhase * 0.54 + mesoA * 0.44);
  float mesoC = sin(dot(p, vec3(14.4, 6.4, -10.8)) + uAtlasPhase * 0.43 + mesoB * 0.55);
  float mesoD = cos(dot(p, vec3(-12.6, -4.7, 13.2)) + uAtlasPhase * 0.31 + mesoA * mesoC);
  float meso = mesoA * mesoB * 0.46 + mesoC * 0.34 + mesoD * 0.20;
  float fold = sin(meso * 2.65 + dot(p, vec3(5.1, -3.7, 4.8)) + uAtlasPhase * 0.38);
  float mesoGate = atlasSat(0.18 + gradient * 2.35 + conflict * 0.48 + uAtlasDisplacement * 0.22);
  radial += meso * mesoGate
    * (0.012 + uAtlasDisplacement * 0.026 + uAtlasDamage * 0.014 + uAtlasPhaseDisagreement * 0.011);
  radial += fold * fold * sign(fold) * mesoGate
    * (0.006 + uAtlasDisplacement * 0.012 + uAtlasMicrostructure * 0.006);

  float clusterA = 0.5 + 0.5 * sin(dot(p, vec3(4.7, -5.6, 4.2)) + uAtlasPhase * 0.39);
  float clusterB = 0.5 + 0.5 * cos(dot(p, vec3(-5.2, 4.1, 6.4)) - uAtlasPhase * 0.31 + clusterA * 1.25);
  float clusterC = 0.5 + 0.5 * sin(dot(p, vec3(3.3, 6.2, -5.1)) + uAtlasPhase * 0.23 + clusterB);
  float cluster = smoothstep(
    0.56,
    0.82,
    clusterA * 0.42 + clusterB * 0.34 + clusterC * 0.24 + conflict * 0.2 + gradient * 0.28
  );

  float s1 = 0.5 + 0.5 * sin(dot(p, vec3(28.7, 34.3, -30.1)) + uAtlasPhase * (1.19 + uAtlasEmission * 0.42));
  float s2 = 0.5 + 0.5 * sin(dot(p, vec3(-37.9, 25.6, 32.4)) - uAtlasPhase * 1.03 + meso * 0.62);
  float s3 = 0.5 + 0.5 * cos(dot(p, vec3(31.2, -42.7, 21.5)) + uAtlasPhase * 0.79);
  float cell = s1 * s2 * s3;
  float spike = smoothstep(0.35, 0.72, cell + uAtlasMicrostructure * 0.045 + conflict * 0.045);
  spike = spike * spike;
  spike *= spike;

  float f1 = 0.5 + 0.5 * sin(dot(p, vec3(47.0, -53.0, 39.0)) + uAtlasPhase * 1.51);
  float f2 = 0.5 + 0.5 * cos(dot(p, vec3(-59.0, 38.0, 46.0)) - uAtlasPhase * 1.28);
  float fineCell = f1 * f2;
  float fineSpike = smoothstep(0.58, 0.88, fineCell + uAtlasMicrostructure * 0.028 + gradient * 0.045);
  fineSpike = fineSpike * fineSpike * fineSpike;

  float microAudio = mix(1.0, 1.18, atlasSat((uAtlasAudioEnergy - 1.0) * 3.0));
  float microGate = cluster * (0.34 + mesoGate * 0.36 + conflict * 0.3);
  float microAmp = (
      spike * (0.012 + uAtlasMicrostructure * 0.04 + uAtlasDamage * 0.022 + uAtlasPhaseDisagreement * 0.014)
      + fineSpike * (0.004 + uAtlasMicrostructure * 0.014 + uAtlasDamage * 0.009)
    ) * microGate * microAudio;
  radial += microAmp;

  float radius = 1.0 + radial;
  vec3 displaced = vec3(
    p.x * radius * (1.09 + uAtlasLateralSpread * 0.056 + uAtlasDamage * 0.02),
    p.y * radius * (0.905 - uAtlasCompression * 0.026 + uAtlasStretch * 0.026),
    p.z * radius * (0.965 + uAtlasAfterimage * 0.02)
  );

  float flowScale = 1.02 + uAtlasActivity * 0.25 + uAtlasDamage * 0.17;
  displaced += flow * flowScale;

  float slip = sin(dot(p, vec3(4.4, -3.6, 3.1)) + uAtlasPhase * 1.72 + uAtlasIdentitySeed)
    * uAtlasCoherenceLoss
    * gradient
    * (0.65 + uAtlasPhaseDisagreement * 1.7)
    * uAtlasAudioEnergy;
  displaced.x += -p.y * slip;
  displaced.y += p.x * slip;
  displaced.z += (p.x - p.z) * slip * 0.25;

  routeOut = atlasRouteValue(p);
  if (routeOut > 0.0) {
    float routePulse = 0.5 + 0.5 * sin(uAtlasPhase * (2.1 + uAtlasEmission * 2.7) + p.z * 5.3);
    displaced.x += -p.y * routeOut * (0.012 + routePulse * 0.01);
    displaced.y += p.x * routeOut * (0.008 + routePulse * 0.012);
  }

  stressOut = atlasSat(gradient * 2.4 + conflict * 0.52 + abs(gather) * 0.18);
  microOut = atlasSat(microAmp * 9.0 + spike * microGate * 0.52);
  return displaced;
}
`;
}

function replaceRequired(source, anchor, replacement) {
  if (!source.includes(anchor)) {
    throw new Error(`Flagship final-form shader anchor missing: ${anchor}`);
  }
  return source.replace(anchor, replacement);
}

export function createFinalUniformState() {
  return {
    fields: Array.from({ length: FINAL_FIELD_COUNT }, () => new THREE.Vector4()),
    fieldParamsA: Array.from({ length: FINAL_FIELD_COUNT }, () => new THREE.Vector4()),
    fieldParamsB: Array.from({ length: FINAL_FIELD_COUNT }, () => new THREE.Vector4()),
    phase: { value: 0 },
    activity: { value: 0 },
    damage: { value: 0 },
    displacement: { value: 0 },
    phaseDisagreement: { value: 0 },
    coherenceLoss: { value: 0 },
    lateralSpread: { value: 0 },
    compression: { value: 0 },
    stretch: { value: 0 },
    afterimage: { value: 0 },
    breathing: { value: 0 },
    microstructure: { value: 0 },
    brilliance: { value: 0 },
    emission: { value: 0 },
    audioEnergy: { value: 1 },
    identitySeed: { value: 0 },
    routeEnabled: { value: 0 },
    routeCenter: { value: 0.5 },
    routeWidth: { value: 0.1 },
  };
}

export function configureFinalMaterial(material, uniforms, perf) {
  material.customProgramCacheKey = () => "atlas-spectral-forge-final-form-gpu-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlasFields = { value: uniforms.fields };
    shader.uniforms.uAtlasFieldParamsA = { value: uniforms.fieldParamsA };
    shader.uniforms.uAtlasFieldParamsB = { value: uniforms.fieldParamsB };
    shader.uniforms.uAtlasPhase = uniforms.phase;
    shader.uniforms.uAtlasActivity = uniforms.activity;
    shader.uniforms.uAtlasDamage = uniforms.damage;
    shader.uniforms.uAtlasDisplacement = uniforms.displacement;
    shader.uniforms.uAtlasPhaseDisagreement = uniforms.phaseDisagreement;
    shader.uniforms.uAtlasCoherenceLoss = uniforms.coherenceLoss;
    shader.uniforms.uAtlasLateralSpread = uniforms.lateralSpread;
    shader.uniforms.uAtlasCompression = uniforms.compression;
    shader.uniforms.uAtlasStretch = uniforms.stretch;
    shader.uniforms.uAtlasAfterimage = uniforms.afterimage;
    shader.uniforms.uAtlasBreathing = uniforms.breathing;
    shader.uniforms.uAtlasMicrostructure = uniforms.microstructure;
    shader.uniforms.uAtlasBrilliance = uniforms.brilliance;
    shader.uniforms.uAtlasEmission = uniforms.emission;
    shader.uniforms.uAtlasAudioEnergy = uniforms.audioEnergy;
    shader.uniforms.uAtlasIdentitySeed = uniforms.identitySeed;
    shader.uniforms.uAtlasRouteEnabled = uniforms.routeEnabled;
    shader.uniforms.uAtlasRouteCenter = uniforms.routeCenter;
    shader.uniforms.uAtlasRouteWidth = uniforms.routeWidth;

    shader.vertexShader = replaceRequired(
      shader.vertexShader,
      "#include <common>",
      `#include <common>\n${shaderPrelude()}`,
    );
    shader.vertexShader = replaceRequired(
      shader.vertexShader,
      "#include <begin_vertex>",
      `float atlasStressValue = 0.0;\nfloat atlasRouteValueOut = 0.0;\nfloat atlasMicroValue = 0.0;\nvec3 transformed = atlasFinalDisplaced(position, atlasStressValue, atlasRouteValueOut, atlasMicroValue);\nvAtlasStress = atlasStressValue;\nvAtlasRoute = atlasRouteValueOut;\nvAtlasMicro = atlasMicroValue;`,
    );

    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      "#include <common>",
      `#include <common>\nvarying float vAtlasStress;\nvarying float vAtlasRoute;\nvarying float vAtlasMicro;`,
    );
    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      "#include <color_fragment>",
      `#include <color_fragment>\nvec3 atlasCool = vec3(0.009, 0.010, 0.019) * vAtlasStress + vec3(0.013, 0.014, 0.027) * vAtlasMicro;\ndiffuseColor.rgb += atlasCool;\nfloat atlasWound = clamp(vAtlasRoute, 0.0, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.092, 0.010), atlasWound * 0.38);`,
    );

    perf.shaderCompiled = true;
    perf.smoothNormals = true;
  };
}
