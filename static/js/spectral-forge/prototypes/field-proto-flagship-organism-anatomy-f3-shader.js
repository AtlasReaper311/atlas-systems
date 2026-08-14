"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";

export const F3_FIELD_COUNT = 6;

function shaderPrelude() {
  return `
#define ATLAS_FIELD_COUNT ${F3_FIELD_COUNT}
uniform vec4 uAtlasFields[ATLAS_FIELD_COUNT];
uniform vec4 uAtlasFieldParams[ATLAS_FIELD_COUNT];
uniform float uAtlasPhase;
uniform float uAtlasActivity;
uniform float uAtlasDamage;
uniform float uAtlasDisplacement;
uniform float uAtlasInstability;
uniform float uAtlasMicrostructure;
uniform float uAtlasBrilliance;
uniform float uAtlasEmission;
uniform float uAtlasAudioEnergy;
uniform float uAtlasRouteEnabled;
uniform float uAtlasRouteCenter;
uniform float uAtlasRouteWidth;
varying float vAtlasStress;
varying float vAtlasRoute;
varying float vAtlasMicro;

float atlasSat(float value) {
  return clamp(value, 0.0, 1.0);
}

float atlasInfluence(float distance2, float extent) {
  float q = atlasSat(1.0 - distance2 / max(0.0001, extent));
  return q * q * (3.0 - 2.0 * q);
}

float atlasRouteValue(vec3 p) {
  if (uAtlasRouteEnabled < 0.5) return 0.0;
  float coord = p.x * 0.5 + 0.5;
  float falloff = atlasSat(1.0 - abs(coord - uAtlasRouteCenter) / max(0.035, uAtlasRouteWidth));
  float bend = p.y + sin(p.z * 2.25 + uAtlasPhase * 0.19) * 0.105;
  float latitude = 1.0 / (1.0 + bend * bend * 8.2);
  return falloff * falloff * latitude;
}

vec3 atlasDisplaced(vec3 source, out float stressOut, out float routeOut, out float microOut) {
  vec3 p = normalize(source);
  float radial = (sin(dot(p, vec3(2.15, 1.72, -1.31)) + 0.7) * 0.012)
    + (cos(dot(p, vec3(1.18, -2.31, 1.84)) - 1.1) * 0.009);
  vec3 flow = vec3(0.0);
  float stress = 0.0;
  float overlap = 0.0;
  float ridge = 0.0;

  for (int i = 0; i < ATLAS_FIELD_COUNT; i++) {
    vec4 field = uAtlasFields[i];
    vec4 params = uAtlasFieldParams[i];
    vec3 centre = field.xyz;
    float dotValue = clamp(dot(p, centre), -1.0, 1.0);
    float distance2 = max(0.0, 2.0 - 2.0 * dotValue);
    float influence = atlasInfluence(distance2, params.x);
    if (influence <= 0.0001) continue;

    float ring = influence * (1.0 - influence) * 4.0;
    float signedStrength = field.w;
    radial += influence * signedStrength * 0.78 * uAtlasAudioEnergy;
    stress += influence * abs(signedStrength) * 3.4;
    overlap += influence * influence;

    float tangentSq = max(0.0025, 1.0 - dotValue * dotValue);
    vec3 tangent = (centre - p * dotValue) * inversesqrt(tangentSq);
    flow += tangent * ring * params.y * sign(signedStrength) * uAtlasAudioEnergy;

    vec3 swirlAxis = cross(p, centre);
    float travelling = sin(
      dotValue * (8.7 + float(i) * 1.35)
      + params.z
      + uAtlasPhase * (0.91 + float(i) * 0.11)
    );
    flow += swirlAxis * influence * travelling * (0.014 + uAtlasInstability * 0.026) * uAtlasAudioEnergy;
    ridge += ring * travelling * (0.01 + uAtlasDisplacement * 0.018 + uAtlasDamage * 0.012);

    float crestGate = smoothstep(0.018, 0.11, max(0.0, signedStrength));
    float crestWave = pow(max(0.0, 0.5 + 0.5 * travelling), 4.0);
    radial += influence * influence * crestGate * crestWave * params.w * 0.62 * uAtlasAudioEnergy;
  }

  stress = atlasSat(stress + overlap * 0.17 + uAtlasInstability * 0.28 + uAtlasDamage * 0.32);

  float mesoA = sin(dot(p, vec3(9.3, -7.6, 8.4)) + uAtlasPhase * (0.73 + uAtlasActivity * 0.24));
  float mesoB = cos(dot(p, vec3(-6.8, 10.7, 7.1)) - uAtlasPhase * 0.57);
  float mesoC = sin(dot(p, vec3(12.4, 5.1, -9.2)) + uAtlasPhase * 0.41 + mesoA * 0.75);
  float meso = mesoA * mesoB * 0.58 + mesoC * 0.42;
  float mesoGate = 0.34 + stress * 0.66;
  radial += ridge * (0.72 + stress * 0.38);
  radial += meso * mesoGate * (0.012 + uAtlasDisplacement * 0.023 + uAtlasDamage * 0.022);

  float clusterA = 0.5 + 0.5 * sin(dot(p, vec3(5.2, -4.6, 6.1)) + uAtlasPhase * 0.46);
  float clusterB = 0.5 + 0.5 * cos(dot(p, vec3(-4.1, 6.7, 3.9)) - uAtlasPhase * 0.31 + clusterA * 1.7);
  float cluster = smoothstep(0.42, 0.79, clusterA * 0.62 + clusterB * 0.38 + stress * 0.34);

  float s1 = 0.5 + 0.5 * sin(dot(p, vec3(24.7, 31.3, -27.1)) + uAtlasPhase * (1.35 + uAtlasEmission * 0.55));
  float s2 = 0.5 + 0.5 * sin(dot(p, vec3(-35.9, 22.6, 29.4)) - uAtlasPhase * 1.11 + meso * 0.9);
  float s3 = 0.5 + 0.5 * cos(dot(p, vec3(28.2, -39.7, 18.5)) + uAtlasPhase * 0.83);
  float cellular = s1 * s2 * s3;
  float spike = smoothstep(0.18, 0.64, cellular + stress * 0.13 + uAtlasMicrostructure * 0.08);
  spike = spike * spike * (3.0 - 2.0 * spike);
  spike *= spike;

  float f1 = 0.5 + 0.5 * sin(dot(p, vec3(43.0, -47.0, 36.0)) + uAtlasPhase * 1.74);
  float f2 = 0.5 + 0.5 * cos(dot(p, vec3(-52.0, 34.0, 41.0)) - uAtlasPhase * 1.43);
  float fineCell = f1 * f2;
  float fineSpike = smoothstep(0.34, 0.79, fineCell + stress * 0.11);
  fineSpike = fineSpike * fineSpike * fineSpike;

  float microGate = cluster * (0.28 + stress * 0.72);
  float microAmp = (
    spike * (0.022 + uAtlasMicrostructure * 0.055 + uAtlasDamage * 0.045)
    + fineSpike * (0.008 + uAtlasMicrostructure * 0.023 + uAtlasDamage * 0.018)
  ) * microGate * uAtlasAudioEnergy;

  float softTide = sin(dot(p, vec3(2.7, 3.3, -2.1)) + uAtlasPhase * 0.54)
    * cos(dot(p, vec3(-3.4, 2.1, 2.8)) - uAtlasPhase * 0.37)
    * (0.009 + uAtlasActivity * 0.009);
  radial += softTide + microAmp;

  routeOut = atlasRouteValue(p);
  if (routeOut > 0.0) {
    float pulse = 0.5 + 0.5 * sin(uAtlasPhase * (2.2 + uAtlasEmission * 2.5) + p.z * 5.4);
    radial -= routeOut * (0.01 + pulse * 0.008);
    flow += vec3(-p.y, p.x, 0.0) * routeOut * (0.006 + pulse * 0.008);
  }

  float scaleX = 1.055 + uAtlasDisplacement * 0.025 + uAtlasDamage * 0.012;
  float scaleY = 0.965 - uAtlasDamage * 0.012;
  float scaleZ = 0.985 + uAtlasActivity * 0.012;
  vec3 displaced = p * (1.0 + radial);
  displaced *= vec3(scaleX, scaleY, scaleZ);
  displaced += flow * (0.74 + uAtlasActivity * 0.19 + uAtlasDamage * 0.12);

  stressOut = stress;
  microOut = atlasSat(microAmp * 8.0 + spike * microGate * 0.62);
  return displaced;
}
`;
}

function replaceRequired(source, anchor, replacement) {
  if (!source.includes(anchor)) {
    throw new Error(`Anatomy F3 shader anchor missing: ${anchor}`);
  }
  return source.replace(anchor, replacement);
}

export function createF3UniformState() {
  return {
    fields: Array.from({ length: F3_FIELD_COUNT }, () => new THREE.Vector4()),
    fieldParams: Array.from({ length: F3_FIELD_COUNT }, () => new THREE.Vector4()),
    phase: { value: 0 },
    activity: { value: 0 },
    damage: { value: 0 },
    displacement: { value: 0 },
    instability: { value: 0 },
    microstructure: { value: 0 },
    brilliance: { value: 0 },
    emission: { value: 0 },
    audioEnergy: { value: 1 },
    routeEnabled: { value: 0 },
    routeCenter: { value: 0.5 },
    routeWidth: { value: 0.1 },
  };
}

export function configureF3Material(material, uniforms, perf) {
  material.customProgramCacheKey = () => "atlas-spectral-forge-anatomy-f3-gpu-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlasFields = { value: uniforms.fields };
    shader.uniforms.uAtlasFieldParams = { value: uniforms.fieldParams };
    shader.uniforms.uAtlasPhase = uniforms.phase;
    shader.uniforms.uAtlasActivity = uniforms.activity;
    shader.uniforms.uAtlasDamage = uniforms.damage;
    shader.uniforms.uAtlasDisplacement = uniforms.displacement;
    shader.uniforms.uAtlasInstability = uniforms.instability;
    shader.uniforms.uAtlasMicrostructure = uniforms.microstructure;
    shader.uniforms.uAtlasBrilliance = uniforms.brilliance;
    shader.uniforms.uAtlasEmission = uniforms.emission;
    shader.uniforms.uAtlasAudioEnergy = uniforms.audioEnergy;
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
      `float atlasStressValue = 0.0;\nfloat atlasRouteValueOut = 0.0;\nfloat atlasMicroValue = 0.0;\nvec3 transformed = atlasDisplaced(normalize(position), atlasStressValue, atlasRouteValueOut, atlasMicroValue);\nvAtlasStress = atlasStressValue;\nvAtlasRoute = atlasRouteValueOut;\nvAtlasMicro = atlasMicroValue;`,
    );

    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      "#include <common>",
      `#include <common>\nvarying float vAtlasStress;\nvarying float vAtlasRoute;\nvarying float vAtlasMicro;`,
    );
    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>\nnormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif`,
    );
    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      "#include <color_fragment>",
      `#include <color_fragment>\nvec3 atlasPressureTint = vec3(0.012, 0.011, 0.03) * vAtlasStress + vec3(0.018, 0.021, 0.052) * vAtlasMicro;\ndiffuseColor.rgb += atlasPressureTint;\nfloat atlasWound = clamp(vAtlasRoute, 0.0, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.115, 0.012), atlasWound * 0.54);`,
    );

    perf.shaderCompiled = true;
  };
}
