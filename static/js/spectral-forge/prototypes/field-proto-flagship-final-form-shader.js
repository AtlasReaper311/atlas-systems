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
uniform vec4 uAtlasLifeA;
uniform vec3 uAtlasNeckAxis;
uniform vec4 uAtlasMesoDrive;
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

    radial += signedEnergy * 1.14 * mix(1.0, uAtlasAudioEnergy, 0.28);
    gradient += ring * strength;
    overlap += influence * influence;
    if (polarity > 0.0) sourceEnergy += absoluteEnergy * polarity;
    else sinkEnergy += absoluteEnergy * -polarity;

    if (ring > 0.0005) {
      float tangentSq = max(0.0001, 1.0 - dotValue * dotValue);
      vec3 tangent = (centre - p * dotValue) * inversesqrt(tangentSq);
      float pull = ring * fieldFlow * polarity * 1.12 * mix(1.0, uAtlasAudioEnergy, 0.35);
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

  vec3 mesoAxis = normalize(uAtlasMesoDrive.xyz + vec3(0.0001, 0.0, 0.0));
  float mesoTravel = uAtlasMesoDrive.w;
  float mesoA = sin(dot(p, mesoAxis * vec3(9.8, -8.2, 7.6)) + mesoTravel);
  float mesoB = cos(dot(p, vec3(-7.1, 11.2, 8.7)) - uAtlasPhase * 0.37 + mesoA * 0.44);
  float mesoC = sin(dot(p, vec3(14.4, 6.4, -10.8)) + uAtlasPhase * 0.53 + mesoB * 0.55);
  float mesoD = cos(dot(p, vec3(-12.6, -4.7, 13.2)) + uAtlasPhase * 0.23 + mesoA * mesoC);
  float meso = mesoA * mesoB * 0.46 + mesoC * 0.34 + mesoD * 0.20;
  float fold = sin(meso * 2.65 + dot(p, vec3(5.1, -3.7, 4.8)) + uAtlasPhase * 0.29 + uAtlasLifeA.z * 1.8);
  float mesoGate = atlasSat(0.18 + gradient * 2.35 + conflict * 0.48 + uAtlasDisplacement * 0.22 + uAtlasLifeA.z * 0.35);
  radial += meso * mesoGate
    * (0.014 + uAtlasDisplacement * 0.03 + uAtlasDamage * 0.014 + uAtlasPhaseDisagreement * 0.011 + uAtlasLifeA.z * 0.02);
  radial += fold * fold * sign(fold) * mesoGate
    * (0.007 + uAtlasDisplacement * 0.014 + uAtlasMicrostructure * 0.007 + uAtlasLifeA.z * 0.016);

  float microAmp = 0.0;
  float microCluster = 0.0;
  float microTip = 0.0;
  float microAudio = mix(1.0, 1.08, atlasSat((uAtlasAudioEnergy - 1.0) * 4.0));

  // continuous-surface magnetic peaks: local bounded wander, no cluster orbit
  for (int j = 0; j < 6; j++) {
    float jf = float(j);
    float wx = sin(uAtlasPhase * (0.067 + jf * 0.013) + uAtlasIdentitySeed * (0.41 + jf * 0.07) + jf * 1.37)
      + 0.47 * sin(uAtlasPhase * (0.113 + jf * 0.009) + jf * 2.11);
    float wy = sin(uAtlasPhase * (0.053 + jf * 0.011) + uAtlasIdentitySeed * 0.62 + jf * 0.93)
      + 0.39 * cos(uAtlasPhase * (0.097 + jf * 0.007) + jf * 1.71);
    float wz = cos(uAtlasPhase * (0.079 + jf * 0.012) + uAtlasIdentitySeed * 0.28 + jf * 2.53)
      + 0.44 * sin(uAtlasPhase * (0.121 + jf * 0.008) + jf * 0.61);
    vec3 centre = normalize(vec3(wx, wy, wz));
    vec3 patchUp = abs(centre.y) < 0.82 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 patchTangent = normalize(cross(patchUp, centre));
    vec3 patchBitangent = normalize(cross(centre, patchTangent));
    vec2 local = vec2(dot(p, patchTangent), dot(p, patchBitangent));
    float angular = clamp(dot(p, centre), -1.0, 1.0);
    float distanceFromCluster = length(local);
    float patchMask = (1.0 - smoothstep(0.05, 0.38, distanceFromCluster)) * smoothstep(0.86, 0.995, angular);
    float core = 1.0 - smoothstep(0.025, 0.16, distanceFromCluster);
    float dissolve = 0.5 + 0.5 * sin(uAtlasPhase * (0.41 + jf * 0.05) + jf * 2.03);
    float life = smoothstep(0.28, 0.78, dissolve + gradient * 0.18 + conflict * 0.14 + uAtlasMicrostructure * 0.12 + uAtlasLifeA.y * 0.22);

    float shoulders = 0.0;
    float narrow = 0.0;
    float isolate = 0.0;
    for (int k = 0; k < 8; k++) {
      float kf = float(k);
      float homeA = jf * 1.73 + kf * 2.399;
      float ring = 0.022 + 0.03 * kf + 0.012 * sin(uAtlasPhase * (0.091 + kf * 0.013) + jf);
      vec2 peakCentre = vec2(cos(homeA), sin(homeA * 0.87 + jf)) * ring;
      peakCentre += vec2(
        sin(uAtlasPhase * (0.19 + kf * 0.017) + jf * 2.1 + kf),
        cos(uAtlasPhase * (0.147 + jf * 0.013) + kf * 1.4)
      ) * (0.016 + 0.01 * sin(uAtlasPhase * (0.073 + jf * 0.01) + kf));
      float d = length(local - peakCentre);
      float width = 0.022 + 0.006 * mod(kf + jf, 3.0);
      float base = 1.0 - smoothstep(0.0, width * 5.0, d);
      float tip = 1.0 - smoothstep(0.0, width * 1.72, d);
      tip = tip * tip * tip;
      float grow = smoothstep(
        0.18,
        0.88,
        0.5 + 0.5 * sin(uAtlasPhase * (0.53 + kf * 0.031) + jf * 0.93 + kf * 1.61)
      );
      float classWave = 0.5 + 0.5 * sin(uAtlasIdentitySeed * (1.3 + jf) + kf * 2.17 + uAtlasPhase * 0.019);
      float mediumMix = smoothstep(0.46, 0.7, classWave);
      float largeMix = smoothstep(0.8, 0.94, classWave) * life * (0.4 + uAtlasLifeA.y);
      float sizeAmp = mix(0.72, 1.18, mediumMix);
      sizeAmp = mix(sizeAmp, 1.55, largeMix);
      shoulders += base * grow * (0.62 + 0.38 * core);
      narrow += tip * grow * sizeAmp;
      isolate = max(isolate, tip * smoothstep(0.12, 0.32, distanceFromCluster));
    }
    float grainA = 0.5 + 0.5 * sin(local.x * (78.0 + jf * 4.0) + sin(local.y * 15.0) + uAtlasPhase * (0.8 + jf * 0.03));
    float grainB = 0.5 + 0.5 * cos(local.y * (82.0 - jf * 3.0) + cos(local.x * 13.0) - uAtlasPhase * (0.72 + jf * 0.04));
    float grainC = 0.5 + 0.5 * sin((local.x - local.y) * (64.0 + jf * 2.0) + uAtlasPhase * 0.57 + jf);
    float grain = grainA * grainB * grainC;
    float grainPeak = smoothstep(0.48, 0.78, grain + core * 0.04 + uAtlasMicrostructure * 0.022);
    grainPeak = grainPeak * grainPeak * grainPeak;
    shoulders += grainPeak * 0.32;
    narrow += grainPeak * 0.42;
    shoulders = atlasSat(shoulders * 0.22);
    narrow = atlasSat(narrow * 0.95);

    float amp = life * patchMask * microAudio;
    microAmp += amp * (
      shoulders * (0.007 + uAtlasMicrostructure * 0.007)
      + narrow * (0.07 + uAtlasMicrostructure * 0.058 + uAtlasDamage * 0.012)
      + isolate * (0.014 + uAtlasMicrostructure * 0.014)
    );
    microCluster = max(microCluster, amp * patchMask);
    microTip = max(microTip, amp * narrow);
  }

  microAmp *= 0.5 + mesoGate * 0.26 + conflict * 0.18 + uAtlasPhaseDisagreement * 0.06 + uAtlasLifeA.y * 0.16;
  radial += microAmp;

  vec3 neckAxis = normalize(uAtlasNeckAxis + vec3(0.0001, 0.0, 0.0));
  float axisDot = dot(p, neckAxis);
  float waist = 1.0 - axisDot * axisDot;
  float neck = 1.0 - uAtlasLifeA.x;
  radial -= neck * waist * waist * (0.17 + uAtlasDisplacement * 0.05);
  radial += neck * axisDot * axisDot * (0.075 + uAtlasDisplacement * 0.03);

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
  microOut = atlasSat(microAmp * 8.0 + microCluster * 0.24 + microTip * 0.62);
  return displaced;
}

vec3 atlasFinalDisplacedNormal(vec3 source) {
  vec3 p = normalize(source);
  vec3 up = abs(p.y) < 0.82 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangentA = normalize(cross(up, p));
  vec3 tangentB = normalize(cross(p, tangentA));
  float ignoredStress = 0.0;
  float ignoredRoute = 0.0;
  float ignoredMicro = 0.0;
  float eps = 0.009;
  vec3 centre = atlasFinalDisplaced(p, ignoredStress, ignoredRoute, ignoredMicro);
  vec3 pa = atlasFinalDisplaced(normalize(p + tangentA * eps), ignoredStress, ignoredRoute, ignoredMicro);
  vec3 pb = atlasFinalDisplaced(normalize(p + tangentB * eps), ignoredStress, ignoredRoute, ignoredMicro);
  return normalize(cross(pa - centre, pb - centre));
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
    lifeA: new THREE.Vector4(1, 0, 0, 0),
    neckAxis: new THREE.Vector3(0, 1, 0),
    mesoDrive: new THREE.Vector4(0, 1, 0, 0),
  };
}

export function configureFinalMaterial(material, uniforms, perf) {
  material.customProgramCacheKey = () => "atlas-spectral-forge-final-form-gpu-v2";
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
    shader.uniforms.uAtlasLifeA = { value: uniforms.lifeA };
    shader.uniforms.uAtlasNeckAxis = { value: uniforms.neckAxis };
    shader.uniforms.uAtlasMesoDrive = { value: uniforms.mesoDrive };

    shader.vertexShader = replaceRequired(
      shader.vertexShader,
      "#include <common>",
      `#include <common>\n${shaderPrelude()}`,
    );
    shader.vertexShader = replaceRequired(
      shader.vertexShader,
      "#include <beginnormal_vertex>",
      `vec3 objectNormal = atlasFinalDisplacedNormal(position);`,
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
      `#include <color_fragment>\nvec3 atlasCool = vec3(0.014, 0.015, 0.026) * vAtlasStress + vec3(0.018, 0.018, 0.034) * vAtlasMicro;\ndiffuseColor.rgb += atlasCool;\nfloat atlasWound = clamp(vAtlasRoute, 0.0, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.074, 0.008), atlasWound * 0.3);`,
    );

    perf.shaderCompiled = true;
    perf.smoothNormals = true;
  };
}
