# Flotsam

Interactive WebGPU ocean shader: **Seascape by TDM**, ported from GLSL to WGSL and driven by a
first-person swim camera in three.js `WebGPURenderer`.

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
| fixed `SEA_CHOPPY` | uniform, raised by player speed — the sea chops up when you swim |

Porting gotchas worth knowing: WGSL function parameters are immutable (`getSkyColor` needs a local
copy), `out vec3 p` becomes a `vec4f` return, and `smoothstep(0.0, -0.02, y)` is rewritten with
ascending edges.

## Controls

| | |
| --- | --- |
| click | lock the mouse |
| `W` `A` `S` `D` | swim |
| mouse | look |
| `Space` / `Q` | rise |
| `Shift` / `Ctrl` / `E` | dive |
| `Esc` | release the mouse |

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
    ├── controls/SwimControls.ts   pointer-lock swim/fly
    ├── objects/FlotsamField.ts    floating debris (procedural bob for now)
    └── shaders/water/
        ├── lib.wgsl               ported constants + helper functions
        └── fragment.wgsl          entry function called from TSL
```

## TODO

- [x] WGSL port driven by the three.js camera
- [x] swim controls + shader reacting to player speed
- [ ] physics (cannon-es) for the debris, with buoyancy and drift
- [ ] second shader (caustics on a seafloor / underwater fog)
- [ ] own low-poly Blender models as GLB
- [ ] deployment URL

## Credits

- Ocean shader: [Seascape by Alexander Alekseev (TDM), 2014](https://www.shadertoy.com/view/Ms2SD1) — CC BY-NC-SA 3.0
- three.js, Vite, TypeScript
