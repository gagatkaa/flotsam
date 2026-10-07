# Flotsam

A scavenger voyage across an endless WebGPU ocean. You sail a half-sunk sloop that is all that is
left of your old ship, salvaging wreck and strange islands for crew and supplies until you have
assembled the whole chart — and then you simply sail home. The sea is real water: it is the
raymarched **Seascape shader by TDM**, ported from GLSL to WGSL and rendered by three.js
`WebGPURenderer`, and your hull rides its waves.

**Original shader:** https://www.shadertoy.com/view/Ms2SD1
(Mirror of the author's own copy: https://github.com/tdmaav/shadertoy/blob/master/Seascape.shader)

> Seascape is licensed **CC BY-NC-SA 3.0** — free for this non-commercial school project, keep the
> attribution, and don't reuse it commercially.

Live demo: https://gagatkaa.github.io/flotsam/

## The voyage

You start crewless, with a broken hull and a few rations. Nothing is free: every island takes a
trade — provisions for hands, hands for supplies, unmarked salvage for an unmarked castaway. Guard
your timber; grind against the rocks too long and the sea takes you.

- **The Ship That Wouldn't Sink** — a wreck drifting in circles with nobody on deck and a bell
  ringing below. Follow the sound and a sailor comes up; strip her timber and she may take a hand with her.
- **The Lighthouse With No Light** — abandoned for twelve years, but the mirror still turns and the
  door slams behind you. Take the glass, gut the machinery for the helm, or break the locked box.
- **The Crab Market** — a fishing dock turned into a shouting market. Trade provisions for plating
  and two who want passage, help catch a giant crab, or shoplift and pay for it.
- **The Sleeping Giant** — the island is the bones of something enormous, with a shrine in its rib
  cage. Take the chart and the helm upgrade, cut a rib for your hull, or find the castaway in the skull.

Four islands, four chart pieces. The whole chart is a map home: there is no homeward island to find —
finish the map and you can sail for port whenever you like.

## How it works

The shader is raymarched and painted directly into the scene as `scene.backgroundNode` (three draws
it on a skybox sphere whose translation is stripped from the view matrix, so
`normalize(positionWorld)` gives the world-space view ray). Raymarching starts at `cameraPosition` —
swimming around really does move you *through* the water — and the shadertoy original's own
fly-camera is dropped in favour of the pointer-locked game camera.

| Original GLSL | This port |
| --- | --- |
| internal fly camera (`ang`, `ori`, `dir` from `fragCoord`) | `dir` = view ray, `ori` = three.js camera position |
| `#define SEA_TIME` | `seaTime` parameter |
| `#define EPSILON_NRM` | `epsScale` parameter, from `screenSize` |
| `iMouse` steering | dropped, pointer-lock mouse look drives the camera instead |
| `#ifdef AA` | not ported (disabled upstream) |
| fixed `SEA_CHOPPY` | uniform, raised by ship speed — the sea chops up as you accelerate |
| (nothing) | `wake(p, shipPos, shipDir, shipSpeed)` — the boat carves a wake into the field: a trench behind her, a bow wave ahead, and a spreading chevron of foam |

The wake takes three extra uniforms (`uShipPos`, `uShipDir`, `uShipSpeed`) into the raymarch, merged
into both the coarse `map()` and the detail `map_detailed()`, so the trench is real relief that the
sun and the fog light up — not a flat texture. The hull rides the same dent in the CPU mirror.

Porting gotchas worth knowing: WGSL function parameters are immutable (`getSkyColor` needs a local
copy), `out vec3 p` becomes a `vec4f` return, `let` is reassigned inside the raymarch loop so it has
to be `var`, GLSL's `uv *= octave_m` is a row-vector times matrix product that WGSL has no operator
for (spelled out per component), and `smoothstep(0.0, -0.02, y)` is rewritten with ascending edges.

## The ship

The ocean only exists on the GPU, so `src/objects/WaveField.ts` mirrors the shader's wave function on
the CPU (same hash/noise/octave math, `Math.fround` on the hash to stay near f32) — and now mirrors
the wake too. The hull samples that surface at bow, stern and both sides for pitch and roll, and the
rocks use it to keep their heads above water. Keep `WaveField.time` and `.choppy` and the ship wake
fields in sync with the `iTime`, choppy and ship uniforms or the boat will drift off the visible
waves.

Collision is real: `src/physics/Physics.ts` wraps **cannon-es**, with the hull as three spheres on a
dynamic body and each island and rock as static bodies. cannon's closest-point solver reports the
contacts — rocks grind the hull and add damage when you hit them fast, and the shore slides the hull
along instead of letting you sail through the island.

## Controls

| | |
| --- | --- |
| click | lock the mouse |
| `W` / `S` | throttle ahead / astern |
| `A` / `D` | rudder left / right |
| `E` | go ashore when an island waves you in |
| mouse | look around while the pointer is locked |
| `Esc` | release the mouse / close the pause |

Sailing into an island offers the landing; choosing a coarse card comes at a price. The red gauge at
the bow is the hull — at zero, the sea keeps you.

## Stack

- three.js — `WebGPURenderer` + TSL (`wgslFn`, `wgsl`, `scene.backgroundNode`)
- WGSL shaders in `src/shaders/water/` (ported GLSL)
- cannon-es — collision for islands and rocks
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
    ├── main.ts                  renderer, ocean background, uniforms, loop
    ├── style.css                HUD: compass, cards, hull, bins
    ├── controls/
    │   └── BoatControls.ts      pointer-lock look, throttle + rudder, sail/anchors
    ├── objects/
    │   ├── Ship.ts              hull, sail, wave-following kinematics, damage
    │   └── WaveField.ts         CPU mirror of the shader's waves + wake
    ├── physics/
    │   └── Physics.ts           cannon-es world: islands, rocks, hull contacts
    ├── shaders/water/
    │   ├── lib.wgsl             ported constants + helpers + wake()
    │   └── fragment.wgsl        entry function called from TSL
    └── game/
        ├── world.ts             islands, hazards, island tints, world seed
        ├── events.ts            the island trades and what they cost
        ├── cards.ts             coarse vs fine choices
        ├── run.ts               phases and the run pipeline
        └── stats.ts             voyage persistence across reloads
```

## Extra marks

- **Ship wake** — a third wave layer added to the original seascape: a hull-bound trench, bow ridge
  and chevron foam, identical on the raymarched GPU surface and the CPU collision surface.
- **cannon-es physics** — the boat no longer vacuums up obstacles with distance checks; a dedicated
  physics world resolves contact normals, grind damage, and shore-sliding each frame.

## Credits

- Ocean shader: [Seascape by Alexander Alekseev (TDM), 2014](https://www.shadertoy.com/view/Ms2SD1) — CC BY-NC-SA 3.0
- three.js, cannon-es, Vite, TypeScript