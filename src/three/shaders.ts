/* The universe's GLSL. Everything is additive light on a dark sky, drawn without tone mapping.

   - SKY: the painted nebula on the inside of a sphere.
   - DUST: the arms, bulge and field (decoration), dimmed outside a focused arm.
   - STAR: one camera-facing quad per model: a white-hot core, a halo that grows with downloads,
     and diffraction spikes on the brightest. Never smaller than a few pixels on screen.
   - ORBIT: one point per derivative model. The vertex shader solves Kepler's equation for its
     place at uTime (lib/kepler.ts does the same on the CPU), and comet points trail away from
     their star. */

export const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
  #include <colorspace_fragment>
}`;

/** Points sized in world units, never below uMinPx on screen; fainter when held at the minimum. */
const POINT_SIZE = /* glsl */ `
uniform float uProj;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uFadeFloor;
float pointSize(float worldSize, float depth, out float fade) {
  float px = worldSize * uProj / max(depth, 1e-3);
  fade = clamp(px / uMinPx, uFadeFloor, 1.0);
  return clamp(px, uMinPx, uMaxPx);
}`;

export const DUST_VERT = /* glsl */ `
attribute float aKind;
attribute float aBright;
uniform vec3 uArmColors[4];
uniform vec3 uBulge;
uniform vec3 uField;
uniform float uArmFocus;
uniform float uDim;
varying vec3 vColor;
varying float vAlpha;
${POINT_SIZE}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade;
  float size = 0.06 + 0.14 * aBright;
  gl_PointSize = pointSize(size, -mv.z, fade);
  vec3 c = aKind < 3.5 ? uArmColors[int(aKind + 0.5)] : (aKind < 4.5 ? uBulge : uField);
  // Lift the darker arm hues toward their own light so the dust glows rather than stains.
  vColor = mix(c, vec3(1.0, 0.95, 0.86), 0.04 + 0.26 * aBright);
  float focus = (uArmFocus < 0.0 || aKind > 3.5) ? 1.0 : (abs(aKind - uArmFocus) < 0.5 ? 1.0 : 0.22);
  float base = aKind < 3.5 ? 0.5 : (aKind < 4.5 ? 0.42 : 0.14);
  // Grains right in front of the camera would blur into large discs: let them go.
  float near = smoothstep(1.5, 9.0, -mv.z);
  vAlpha = (base + 0.6 * aBright) * fade * focus * uDim * near;
}`;

export const DUST_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}`;

export const BG_STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
}`;

export const BG_STAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}`;

export const STAR_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iColor;
attribute float iCore;
attribute float iGlow;
attribute float iArm;
attribute float iIndex;
uniform float uPxPerUnit;
uniform float uHaloScale;
uniform float uArmFocus;
uniform float uSelected;
uniform float uHover;
varying vec2 vUv;
varying vec3 vColor;
varying float vGlow;
varying float vCore;
varying float vDim;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float depth = max(-mv.z, 1e-3);
  // World units per screen pixel at this depth.
  float unit = depth / uPxPerUnit;
  float corePx = max(iCore, (1.7 + 2.3 * iGlow) * unit);
  float halo = max(iCore * (5.0 + 12.0 * iGlow) * uHaloScale, (9.0 + 26.0 * iGlow) * unit);
  float picked = (abs(iIndex - uSelected) < 0.5 || abs(iIndex - uHover) < 0.5) ? 1.0 : 0.0;
  halo *= 1.0 + 0.25 * picked;
  vCore = corePx / halo;
  vUv = position.xy;
  vColor = iColor;
  vGlow = iGlow;
  float focus = (uArmFocus < 0.0 || abs(iArm - uArmFocus) < 0.5) ? 1.0 : 0.3;
  vDim = max(focus, picked);
  mv.xy += position.xy * halo;
  gl_Position = projectionMatrix * mv;
}`;

export const STAR_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vGlow;
varying float vCore;
varying float vDim;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float core = smoothstep(vCore, vCore * 0.5, d);
  float halo = exp(-pow(d / (0.16 + 0.3 * vGlow), 2.0) * 2.6) * (0.4 + 0.6 * vGlow);
  float corona = exp(-d * 9.0) * 0.6;
  float sx = exp(-abs(vUv.y) * 120.0) * (1.0 - smoothstep(0.0, 1.0, abs(vUv.x)));
  float sy = exp(-abs(vUv.x) * 120.0) * (1.0 - smoothstep(0.0, 1.0, abs(vUv.y)));
  float spikes = (sx + sy) * smoothstep(0.45, 1.0, vGlow) * 0.85;
  vec3 hot = mix(vColor, vec3(1.0), 0.72);
  vec3 col = hot * core + vColor * (halo + corona + spikes);
  gl_FragColor = vec4(col * vDim, 1.0);
  #include <colorspace_fragment>
}`;

/** Kepler's equation by Newton's method, as in lib/kepler.ts. */
const KEPLER = /* glsl */ `
float eccentricAnomaly(float M, float e) {
  float m = mod(M, 6.28318530718);
  float E = e > 0.8 ? 3.14159265359 : m;
  for (int k = 0; k < 7; k++) {
    E -= (E - e * sin(E) - m) / (1.0 - e * cos(E));
  }
  return E;
}`;

export const MAX_SYSTEMS = 64;

export const ORBIT_VERT = /* glsl */ `
// position: P, the perifocal frame's first axis (three.js needs a position attribute to draw).
attribute vec3 aQ;
attribute vec4 aOrbit;   // a, e, M0, n
attribute vec4 aMeta;    // family (0-3), system, arm, tail (0 = a body, 1-6 = a comet's tail)
uniform vec3 uCenters[${MAX_SYSTEMS}];
uniform vec3 uFamilyColors[4];
uniform float uTime;
uniform float uSelected;
uniform float uFamilyFocus;
uniform float uArmFocus;
uniform float uSizes[4];
uniform float uAlphas[4];
varying vec3 vColor;
varying float vAlpha;
${POINT_SIZE}
${KEPLER}
void main() {
  float e = aOrbit.y;
  float E = eccentricAnomaly(aOrbit.z + aOrbit.w * uTime, e);
  vec3 rel = aOrbit.x * ((cos(E) - e) * position + sqrt(1.0 - e * e) * sin(E) * aQ);
  int fam = int(aMeta.x + 0.5);
  float tail = aMeta.w;
  if (tail > 0.5) {
    // A comet's tail points away from its star, longer near periapsis.
    float r = max(length(rel), 1e-4);
    rel += (rel / r) * tail * 0.045 * aOrbit.x * clamp(aOrbit.x / r, 0.6, 3.0);
  }
  vec3 world = uCenters[int(aMeta.y + 0.5)] + rel;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade;
  float size = uSizes[fam] * (tail > 0.5 ? max(0.25, 1.0 - tail * 0.13) : 1.0);
  gl_PointSize = pointSize(size, -mv.z, fade);
  bool mine = abs(aMeta.y - uSelected) < 0.5;
  float sel = uSelected < 0.0 ? 1.0 : (mine ? 1.0 : 0.3);
  float focus = (uFamilyFocus < 0.0 || !mine) ? 1.0 : (abs(aMeta.x - uFamilyFocus) < 0.5 ? 1.25 : 0.16);
  float arm = (uArmFocus < 0.0 || abs(aMeta.z - uArmFocus) < 0.5) ? 1.0 : 0.25;
  float trail = tail > 0.5 ? (1.0 - tail / 7.0) * 0.8 : 1.0;
  vColor = uFamilyColors[fam];
  vAlpha = uAlphas[fam] * fade * sel * focus * arm * trail;
}`;

export const ORBIT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}`;

/** The named members of the selected system: larger bodies with a lit face and a dark limb. */
export const PLANET_VERT = /* glsl */ `
attribute vec3 aQ;
attribute vec4 aOrbit;
attribute vec4 aMeta;    // family, system, size (world units), index among the named
uniform vec3 uCenters[${MAX_SYSTEMS}];
uniform vec3 uFamilyColors[4];
uniform float uTime;
uniform float uSelected;
uniform float uFamilyFocus;
uniform float uHover;
varying vec3 vColor;
varying float vAlpha;
varying float vHover;
${POINT_SIZE}
${KEPLER}
void main() {
  float e = aOrbit.y;
  float E = eccentricAnomaly(aOrbit.z + aOrbit.w * uTime, e);
  vec3 rel = aOrbit.x * ((cos(E) - e) * position + sqrt(1.0 - e * e) * sin(E) * aQ);
  vec3 world = uCenters[int(aMeta.y + 0.5)] + rel;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  bool mine = abs(aMeta.y - uSelected) < 0.5;
  float fade;
  gl_PointSize = mine ? pointSize(aMeta.z, -mv.z, fade) : 0.0;
  float focus = (uFamilyFocus < 0.0 || abs(aMeta.x - uFamilyFocus) < 0.5) ? 1.0 : 0.25;
  vHover = abs(aMeta.w - uHover) < 0.5 ? 1.0 : 0.0;
  vColor = uFamilyColors[int(aMeta.x + 0.5)];
  vAlpha = mine ? focus : 0.0;
}`;

export const PLANET_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vHover;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float body = smoothstep(0.62, 0.52, d);
  float ring = smoothstep(0.98, 0.9, d) * smoothstep(0.78, 0.86, d) * vHover;
  // Lit from the upper left, darker toward the limb.
  float lit = 0.55 + 0.45 * clamp(dot(normalize(vec3(p.x, -p.y, sqrt(max(0.0, 1.0 - d * d)))), normalize(vec3(-0.5, 0.6, 0.7))), 0.0, 1.0);
  vec3 col = mix(vColor, vec3(1.0), 0.25) * lit * body + vec3(1.0, 0.96, 0.84) * ring;
  float glow = exp(-d * 4.0) * 0.25;
  gl_FragColor = vec4((col + vColor * glow) * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;
