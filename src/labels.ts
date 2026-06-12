import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export interface StructureLabel {
  object: CSS2DObject;
  /** Recolor the status dot (health indicator — red during errors). */
  setDot(hex: number): void;
}

/**
 * Floating name tag for a structure. DOM-based (CSS2DRenderer) so the text
 * stays crisp at any zoom and never participates in bloom. The status dot
 * starts in the structure's identity color; setDot flips it (cached — safe
 * to call every frame).
 */
export function makeLabel(text: string, accentHex: number): StructureLabel {
  const el = document.createElement("div");
  el.className = "label";

  const dot = document.createElement("span");
  dot.className = "label-dot";

  let current = -1;
  const setDot = (hex: number): void => {
    if (hex === current) return;
    current = hex;
    const css = `#${hex.toString(16).padStart(6, "0")}`;
    dot.style.background = css;
    dot.style.color = css; // drives the glow (box-shadow: currentColor)
  };
  setDot(accentHex);

  el.append(dot, text);
  return { object: new CSS2DObject(el), setDot };
}

/**
 * Holographic counter chip — a small value readout that floats with a
 * structure (req/min on the API, disk % on the tank, active jobs on the
 * furnace). Same CSS2D mechanism as labels: crisp, bloom-free.
 */
export function makeCounter(): {
  object: CSS2DObject;
  set: (text: string) => void;
} {
  const el = document.createElement("div");
  el.className = "counter";
  el.textContent = "—";
  return {
    object: new CSS2DObject(el),
    set: (text: string) => {
      el.textContent = text;
    },
  };
}
