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

You start with three hands, a battered hull and a few rations. Nothing is free: every island takes a
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

In among the rocks between the islands, wreckage floats on the swell: crates of food, barrels of coin
and loose planks to patch the hull. Sail into them to haul them aboard. The crew eats a day's food
every 20 seconds at sea, and a hungry crew sails slowly and breaks things. Coin buys help at the Crab
Market, and what you do on one island can open a new choice on another. A glowing beacon stands over
every island you have not made a choice on yet, and you can always walk back to the boat and return
later.

Three of the islands greet you with their own sound as you land (the bell, the lighthouse door, the
market crowd), and picking up wreckage or a map piece has a sound of its own.

When the voyage ends, at home or on the bottom, you get a score and a title for the run. Before the
first voyage the game warns that the view rocks with the waves, and asks anyone who feels dizzy to stop.

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
| fixed `SEA_CHOPPY` | uniform, raised by the map pieces you hold — the sea chops up as the voyage goes on |
| (nothing) | `wake(p, shipPos, shipDir, shipSpeed)` — the boat carves a wake into the field: a trench behind her, a bow wave ahead, and a spreading chevron of foam |

The wake is not a separate shader: it is one extra function, `wake()`, added inside the ported
Seascape shader. It takes three extra uniforms (`uShipPos`, `uShipDir`, `uShipSpeed`) and is
subtracted from the height in `map()`, which both the raymarch and the surface normals use, so the
trench is real relief that the sun lights up rather than a flat texture. Each part of the wake only
exists on its own side of the boat and fades with distance. The hull rides the same dent in the CPU
mirror.

Everything else in the scene (the boat, islands, rocks, wreckage and beacons) uses three.js's
built-in node materials, not shaders of our own.

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

Collision uses **cannon-es** (`src/physics/Physics.ts`). The hull is three spheres on one body, and
each island and rock is a static body. cannon-es is used only to detect contact: each frame the hull
body is placed where the boat is, the world is stepped, and its contact list says which island or rock
the hull is overlapping. How far to push the boat back out, and in which direction, is then worked out
in our own code from the positions. The boat's movement comes from the sailing code in `Ship.ts`, not
from cannon-es. A rock costs a chunk of health once per hit (more the faster you hit it), and the
shore pushes the hull along instead of letting it sail through the island.

## Controls

| | |
| --- | --- |
| click | lock the mouse |
| `W` / `S` | fill the sail / back it to slow down (a sail cannot go astern) |
| `A` / `D` | rudder left / right |
| `E` | go ashore when an island waves you in |
| mouse | look around while the pointer is locked |
| `Esc` | release the mouse / close the pause / leave an island without choosing |

Sailing close to an island offers the landing; every choice ashore shows what it gives and what it costs. The health gauge in
the HUD is the hull — at zero, the sea keeps you.

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
├── index.html                   the HUD, panels and pause menu markup
└── src/
    ├── main.ts                  renderer, ocean background, game flow and the per-frame loop
    ├── style.css                HUD, compass, story panels, cards
    ├── audio/
    │   └── Soundscape.ts        sea loop, hull churn and collision sounds (Web Audio)
    ├── controls/
    │   └── BoatControls.ts      pointer-lock look, throttle + rudder from W/A/S/D
    ├── objects/
    │   ├── Ship.ts              boat model, sailing kinematics, riding the waves, damage
    │   └── WaveField.ts         CPU mirror of the shader's waves + wake
    ├── physics/
    │   └── Physics.ts           cannon-es world: islands, rocks, hull contacts
    ├── shaders/water/
    │   ├── lib.wgsl             ported constants + helpers + wake()
    │   └── fragment.wgsl        entry function called from TSL
    ├── ui/
    │   ├── compass.ts           the heading-up compass tape
    │   ├── story.ts             builders for the intro, island scenes, choice cards and score
    │   └── toasts.ts            pop-up messages for everything that changes
    └── game/
        ├── world.ts             island layout, rocks, flags, bearings
        ├── events.ts            the story on each island and its choices
        ├── flotsam.ts           floating wreckage to pick up between the islands
        ├── score.ts             the closing score, rating and best score
        ├── cards.ts             the upgrades a choice can give you
        ├── run.ts               the run state machine: sail, land, choose, sink or go home
        └── stats.ts             turns upgrades and cargo into the boat's handling numbers
```

## Extra marks

What the project does and does not cover, as it stands:

- **Interaction beyond looking around:** yes. Sailing with throttle and rudder, landing on islands,
  choices that cost and give things and unlock others, pickups, food, and a score.
- **Physics:** yes, through cannon-es, used for collision detection with the islands and rocks (see
  [The ship](#the-ship) for exactly what it does and does not do).
- **Multiple shaders:** no. There is one custom shader, the ported Seascape. The wake is an addition
  inside it, not a second shader.
- **Additional WebGPU libraries:** no. TSL is part of three.js, and cannon-es is not a WebGPU library.
- **Own Blender models with baking / Blender animations:** no. The boat is an FBX model loaded with
  three's `FBXLoader`; it has no baked textures and no animations.

## Credits

- Ocean shader: [Seascape by Alexander Alekseev (TDM), 2014](https://www.shadertoy.com/view/Ms2SD1) — CC BY-NC-SA 3.0
- three.js, cannon-es, Vite, TypeScript
