import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

/**
 * Floating name tag for a structure. DOM-based (CSS2DRenderer) so the text
 * stays crisp at any zoom and never participates in bloom. `accentHex`
 * colors the little status dot — it doubles as a health indicator later
 * (milestone 4 flips it red on errors).
 */
export function makeLabel(text: string, accentHex: number): CSS2DObject {
  const el = document.createElement("div");
  el.className = "label";

  const dot = document.createElement("span");
  dot.className = "label-dot";
  const css = `#${accentHex.toString(16).padStart(6, "0")}`;
  dot.style.background = css;
  dot.style.color = css; // drives the glow (box-shadow: currentColor)

  el.append(dot, text);
  return new CSS2DObject(el);
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
