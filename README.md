# Flotsam

A scavenger voyage across an endless WebGPU ocean: you sail a half-sunk sloop, salvage wreck and
strange islands for crew and supplies, and assemble the whole chart to find your way home. The sea
is real water — the raymarched **Seascape shader by TDM**, ported from GLSL to WGSL and rendered by
three.js `WebGPURenderer` — and your hull rides its waves (and carves its own wake into them).

**Original shader:** https://www.shadertoy.com/view/Ms2SD1
Her wake is an added wave layer; island and rock collision runs through cannon-es.

Licensed CC BY-NC-SA 3.0 — attribution required, non-commercial use only.

**Live demo:** https://gagatkaa.github.io/flotsam/

**Source & setup instructions:** [`flotsam/README.md`](flotsam/README.md) — the Vite + TypeScript app
lives in [`flotsam/`](flotsam/).

```bash
cd flotsam
npm install
npm run dev      # needs WebGPU: Chrome/Edge (or any WebGPU browser over https)
```

## How this answers the assignment

| Requirement | Where |
| --- | --- |
| A fragment shader from Shadertoy, ported to WebGPU | `flotsam/src/shaders/water/lib.wgsl` + `fragment.wgsl` — Seascape's GLSL rewritten as WGSL (raymarch, `map()`/`map_detailed()`, lighting, fog) |
| Embedded in ThreeJS with the `WebGPURenderer` | `flotsam/src/main.ts` — the shader is bound as `scene.backgroundNode` via three's TSL (`wgsl`, `wgslFn`) |
| The shader responds to user interaction | steering (`W/S/A/D`) moves the boat, and `uShipPos`/`uShipDir`/`uShipSpeed` uniforms carve a wake and raise the chop *inside the raymarch* |
| A working URL to submit | live demo URL above, deployed from `flotsam/dist` |
| Source code submitted separately, **no `node_modules`** | git repo; `flotsam/` has its own `.gitignore` for `node_modules/` and `dist/` |
| Original Shadertoy URL in the root README | first section of this file (+ the CC BY-NC-SA 3.0 licence notice) |

### Extra marks

| Extra | How it is covered |
| --- | --- |
| Interaction more than just looking around | a whole sailing-and-salvage loop: throttle, rudder, beaches, trade choices, a map to complete |
| Integration of physics | **cannon-es** — `flotsam/src/physics/Physics.ts` builds a contact world (hull spheres vs static islands/rocks) and feeds normals/damage back to the boat every frame |
| Integration of multiple shaders | the ported sea *plus* the ship wake, a second wave layer (a trench, a bow swell and chevron foam) merged into the same raymarched field on the GPU |
| Additional WebGPU libraries | three.js **TSL** shader nodes (`scene.backgroundNode`, `wgsl`, `wgslFn`, `uniform`) — the GLSL port is driven by TSL, not raw WebGPU boilerplate |

### If you have thirty seconds to explain it

> The ocean is a Shadertoy raymarcher called Seascape. I ported it line-by-line from GLSL to WGSL,
> and three's WebGPURenderer paints it as the scene background instead of a flat texture — so moving
> the camera really moves you through the water. The shader takes uniforms each frame: time, and the
> boat's position/direction/speed, so how fast you sail changes the waves and drags a wake through
> them. The boat rides the same math on the CPU so it floats on the surface you actually see, and a
> cannon-es world keeps islands and rocks solid without any hand-rolled distance checks.

**Ship controls:** `W`/`S` throttle, `A`/`D` rudder, `E` ashore, `Esc` pause/mouse.