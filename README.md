# Flotsam

A short sailing game on a WebGPU ocean. You sail a small boat between four islands, make a choice on
each one, and collect the four pieces of a map to find your way home. The sea is the raymarched
**Seascape shader by TDM**, ported from GLSL to WGSL and rendered by three.js `WebGPURenderer`, and the
boat floats on its waves and carves a wake into them.

**Original shader:** https://www.shadertoy.com/view/Ms2SD1

Seascape is licensed CC BY-NC-SA 3.0: attribution required, non-commercial use only.

**Live demo:** https://gagatkaa.github.io/flotsam/ (needs a browser with WebGPU, such as Chrome or Edge)

**Source & setup instructions:** [`flotsam/README.md`](flotsam/README.md). The Vite + TypeScript app
lives in [`flotsam/`](flotsam/).

```bash
cd flotsam
npm install
npm run dev
```

## How this answers the assignment

| Requirement | Where |
| --- | --- |
| A fragment shader from Shadertoy, ported to WebGPU | `flotsam/src/shaders/water/lib.wgsl` + `fragment.wgsl`: Seascape's GLSL rewritten as WGSL (raymarch, waves, lighting) |
| Embedded in three.js with the `WebGPURenderer` | `flotsam/src/main.ts`: the shader is bound as `scene.backgroundNode` through three's TSL (`wgsl`, `wgslFn`) |
| The shader responds to user interaction | steering the boat (`W`/`S`/`A`/`D`) changes the `uShipPos`, `uShipDir` and `uShipSpeed` uniforms, which carve the boat's wake into the waves inside the raymarch; the camera rides the boat, so sailing moves the point the rays start from; and the `uChoppy` uniform makes the sea rougher as you collect map pieces |
| A working URL | the live demo above, built from `flotsam/` by the GitHub Pages workflow in `.github/workflows/` |
| Source code without `node_modules` | `flotsam/.gitignore` excludes `node_modules/` and `dist/` |
| Original Shadertoy URL in the root README | the top of this file |

### Extra marks

| Extra | Covered? |
| --- | --- |
| Interaction which is more than just looking around | **Yes.** Sailing with throttle and rudder, landing on islands, choices with costs that unlock other choices, wreckage to pick up, food that runs out, and a final score. |
| Integration of physics | **Yes.** cannon-es (`flotsam/src/physics/Physics.ts`) detects when the hull touches an island or rock. The push-out and damage are then worked out in our own code; the boat's movement itself is not simulated by cannon-es. |
| Integration of multiple shaders | **No.** There is one custom shader, the ported Seascape. The boat's wake is an extra function added inside that same shader, not a second shader. Everything else uses three.js's built-in materials. |
| Integration of additional WebGPU libraries | **No.** TSL is part of three.js itself, and cannon-es is not a WebGPU library. |
| Own Blender models, including baking | **No.** The boat is an FBX model loaded with three's `FBXLoader`, with no baked textures. |
| Controlling animations from a Blender model | **No.** |

**Controls:** `W`/`S` speed up / slow down, `A`/`D` steer, `E` go ashore, mouse to look, `Esc` to
pause or leave an island.
