/* Can this browser draw the universe? three.js needs WebGL 2. The probe context is released at
   once, so it does not count against the browser's limit on live contexts. */
export function hasWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
