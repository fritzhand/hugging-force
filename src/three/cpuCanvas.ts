/* 2D canvases that keep their pixels in main memory.

   Chrome (Android especially) keeps 2D canvases on the GPU. If the GPU process is lost, those
   canvases come back blank, and three.js would re-upload blank textures when the WebGL context
   is restored. `willReadFrequently` keeps the canvas in main memory, out of the GPU's reach.
   Every canvas that backs a texture in the universe comes from here. */
export function cpuCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return [c, ctx];
}
