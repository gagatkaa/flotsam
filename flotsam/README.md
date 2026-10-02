# Flotsam

Sail a small boat across a WebGPU ocean: **Seascape by TDM**, ported from GLSL to WGSL and rendered
by three.js `WebGPURenderer`. The boat rides the shader's own wave field, and you collect the flotsam
drifting on it.

**Original shader:** https://www.shadertoy.com/view/Ms2SD1
(Mirror of the author's own copy: https://github.com/tdmaav/shadertoy/blob/master/Seascape.shader)

> Seascape is licensed **CC BY-NC-SA 3.0** — free for this non-commercial school project, keep the
> attribution, and don't reuse it commercially.

Live demo: _add deployment URL here_ (e.g. Netlify / Vercel drop of `flotsam/dist`)

## How it works

The shader is a raymarched ocean, so it is not applied to a mesh — it renders as
`scene.backgroundNode`. three draws that background on a skybox sphere whose translation is stripped
from the view matrix, which means `normalize(positionWorld)` is the world-space view ray of the
fragment. Raymarching therefore starts at `cameraPosition`: swimming around really does move you
through the water, and the internal fly-camera that ships with the shadertoy original is dropped.

| Original GLSL | This port |
| --- | --- |
| internal fly camera (`ang`, `ori`, `dir` from `fragCoord`) | `dir` = view ray, `ori` = three.js camera position |
| `#define SEA_TIME` | `seaTime` parameter |
| `#define EPSILON_NRM` | `epsScale` parameter, from `screenSize` |
| `iMouse` steering | dropped, pointer-lock mouse look drives the camera instead |
| `#ifdef AA` | not ported (disabled upstream) |
| fixed `SEA_CHOPPY` | uniform, raised by boat speed — the sea chops up as you accelerate |

Porting gotchas worth knowing: WGSL function parameters are immutable (`getSkyColor` needs a local
copy), `out vec3 p` becomes a `vec4f` return, `let` is reassigned inside the raymarch loop so it has
to be `var`, GLSL's `uv *= octave_m` is a row-vector times matrix product that WGSL has no operator
for (spelled out per component), and `smoothstep(0.0, -0.02, y)` is rewritten with ascending edges.

## The boat

The ocean only exists on the GPU, so `src/objects/WaveField.ts` mirrors the shader's wave function on
the CPU (same hash/noise/octave math, `Math.fround` on the hash to stay near f32). The hull samples
that surface at bow, stern and both sides for pitch and roll, and the debris uses it to sit *on* the
water instead of floating at a guessed sea level. Keep `WaveField.time` and `.choppy` in sync with
the `iTime` / choppy uniforms or the boat will drift off the visible waves.

## Controls

| | |
| --- | --- |
| click | lock the mouse |
| `W` / `S` | throttle ahead / astern |
| `A` / `D` | rudder left / right |
| mouse | look around |
| `Esc` | release the mouse |

Sail into a piece of flotsam to collect it; it shrinks away and new debris drifts in ahead of you.
The counter is bottom-right, next to the speed in knots.

## Stack

- three.js 0.186 — `WebGPURenderer` + TSL (`wgslFn`, `wgsl`, `scene.backgroundNode`)
- WGSL shaders in `src/shaders/water/`
- TypeScript + Vite

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 - WebGPU needs Chrome/Edge (or https)
npm run build
npm run preview
```

## Layout

```
flotsam/
├── index.html
└── src/
    ├── main.ts                    renderer, ocean background, lights, loop
    ├── controls/BoatControls.ts   pointer-lock look, throttle + rudder
    ├── objects/Boat.ts            hull, sail, wave-following kinematics
    ├── objects/WaveField.ts       CPU mirror of the shader's wave function
    ├── objects/FlotsamField.ts    collectible debris on the surface
    └── shaders/water/
        ├── lib.wgsl               ported constants + helper functions
        └── fragment.wgsl          entry function called from TSL
```

## TODO

- [x] WGSL port driven by the three.js camera
- [x] boat that rides the shader's waves, shader reacting to boat speed
- [x] collectible flotsam
- [ ] physics (cannon-es) so the boat can ram debris instead of vacuuming it up
- [ ] second shader (caustics on a seafloor / underwater fog)
- [ ] own low-poly Blender models as GLB
- [ ] deployment URL

## Credits

- Ocean shader: [Seascape by Alexander Alekseev (TDM), 2014](https://www.shadertoy.com/view/Ms2SD1) — CC BY-NC-SA 3.0
- three.js, Vite, TypeScript
