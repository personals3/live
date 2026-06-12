import * as THREE from "three";

/** Brand palette — the scene's color language (see README). */
export const COLORS = {
  cyan: 0x00e5ff, // data-in
  magenta: 0xff2ec4, // transcode
  green: 0x2bff88, // healthy
  amber: 0xffb020, // queued work
  red: 0xff3344, // errors
  ice: 0x9fd4ff, // postgres crystal
  fill: 0x21f3c4, // storage fill level
} as const;

// Bloom thresholds on Rec. 709 luminance, which is ~72% green — so at equal
// emissiveIntensity, magenta (no green) sits at ~0.27 relative luminance
// while cyan/amber sit at ~0.64 and never reads as glowing. Compensate by
// scaling each color's intensity to cyan's luminance.
const REF_LUMINANCE = luminance(COLORS.cyan);

function luminance(hex: number): number {
  // THREE.Color converts hex from sRGB to the linear working space, which
  // is what the bloom pass measures.
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * Standard material for glowing parts: dark body, emissive in `hex`, with
 * the intensity luminance-compensated so every palette color blooms with
 * the same strength. `intensity` is in "cyan units" — 1.6 cyan and 1.6
 * magenta produce equally strong halos.
 */
export function neonMaterial(
  hex: number,
  intensity = 1.6,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  // Floor the divisor so deep blues/reds can't explode the multiplier.
  const compensation = REF_LUMINANCE / Math.max(luminance(hex), 0.08);
  return new THREE.MeshStandardMaterial({
    color: 0x0a0d14,
    emissive: hex,
    emissiveIntensity: intensity * compensation,
    roughness: 0.4,
    metalness: 0.1,
    ...extra,
  });
}

/**
 * Inject a view-dependent fresnel rim into any MeshStandardMaterial: faces
 * seen edge-on pick up a faint glow in `hex`. This is what keeps dark
 * bodies readable against the dark background from every orbit angle —
 * the rule of the scene is "identity through rim light and pads, drama
 * through bloom". Intensities stay below the bloom luminance threshold
 * (0.25), so rims never halo.
 */
export function applyRim(
  mat: THREE.MeshStandardMaterial,
  hex: number,
  intensity = 0.15,
): THREE.MeshStandardMaterial {
  const rimColor = new THREE.Color(hex);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimIntensity = { value: intensity };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimIntensity;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float rimFresnel = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
        totalEmissiveRadiance += uRimColor * rimFresnel * uRimIntensity;`,
      );
  };
  // Identical GLSL for every rim material — share one program; the
  // color/intensity differences live in per-material uniforms.
  mat.customProgramCacheKey = () => "ps3-rim";
  return mat;
}

/** Structure body — dark and matte, but rimmed in the structure's identity
 *  color so its silhouette always reads against the night. */
export function bodyMaterial(
  rimHex: number,
  rimIntensity = 0.15,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return applyRim(
    new THREE.MeshStandardMaterial({
      color: 0x10141d,
      roughness: 0.65,
      metalness: 0.2,
      ...extra,
    }),
    rimHex,
    rimIntensity,
  );
}
