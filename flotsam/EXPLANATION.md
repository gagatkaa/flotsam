# How Flotsam works

This file explains the whole project: what it is built from, what each library gives us and how we
use it, how the files are connected, what happens every frame, and how the game moves from one
screen to the next. The last section is a short version you can use to present it.

- [1. The big picture](#1-the-big-picture)
- [2. What we use, where it comes from, what we use it for](#2-what-we-use-where-it-comes-from-what-we-use-it-for)
- [3. The files and how they connect](#3-the-files-and-how-they-connect)
- [4. Startup: what happens when the page loads](#4-startup-what-happens-when-the-page-loads)
- [5. The ocean shader](#5-the-ocean-shader)
- [6. The CPU copy of the waves](#6-the-cpu-copy-of-the-waves)
- [7. The boat](#7-the-boat)
- [8. Collisions with cannon-es](#8-collisions-with-cannon-es)
- [9. The world: islands, rocks, wreckage](#9-the-world-islands-rocks-wreckage)
- [10. The game rules: the run, choices, upgrades, score](#10-the-game-rules-the-run-choices-upgrades-score)
- [11. One frame, step by step](#11-one-frame-step-by-step)
- [12. The screens and the HUD](#12-the-screens-and-the-hud)
- [13. Sound](#13-sound)
- [14. Building and deploying](#14-building-and-deploying)
- [15. What the project does and does not cover](#15-what-the-project-does-and-does-not-cover)
- [16. Explaining it in two minutes](#16-explaining-it-in-two-minutes)

---

## 1. The big picture

Flotsam is a short sailing game in the browser. You steer a small boat between four islands, land
on each one, make a choice, and collect four map pieces to get home.

The project has three layers that talk to each other:

```
 ┌────────────────────────── GPU ───────────────────────────┐
 │  Seascape shader (WGSL): draws the whole ocean and sky    │
 │  three.js WebGPURenderer: draws the boat, islands, rocks  │
 └───────────────▲──────────────────────────────────────────┘
                 │ uniforms (time, roughness, boat position/heading/speed)
                 │ + 3D objects to draw
 ┌───────────────┴────────── CPU (TypeScript) ──────────────┐
 │  main.ts: the frame loop that connects everything         │
 │   ├─ WaveField: the same wave maths as the shader         │
 │   ├─ Ship: sailing, floating on the waves, damage         │
 │   ├─ Physics (cannon-es): which rock/island are we hitting│
 │   ├─ Run: the game rules and the state machine            │
 │   ├─ world / flotsam / events / cards / stats / score     │
 │   └─ Soundscape: Web Audio                                │
 └───────────────▲──────────────────────────────────────────┘
                 │ keyboard, mouse, clicks
 ┌───────────────┴────────── DOM (HTML + CSS) ──────────────┐
 │  index.html + style.css: HUD, compass, story panels,      │
 │  pause menu, pop-up messages                              │
 └───────────────────────────────────────────────────────────┘
```

The key idea: **the ocean only exists inside the shader on the GPU.** There is no ocean mesh. So
that the boat can float on the waves you see, the same wave maths is copied into TypeScript
(`WaveField.ts`) and run on the CPU as well.

---

## 2. What we use, where it comes from, what we use it for

| Thing | Where it comes from | What we use it for |
| --- | --- | --- |
| **Seascape** shader | Shadertoy, by Alexander Alekseev (TDM): https://www.shadertoy.com/view/Ms2SD1 (CC BY-NC-SA 3.0) | The ocean and sky. We rewrote it from GLSL to WGSL by hand. |
| **three.js** `WebGPURenderer` | npm package `three`, imported from `three/webgpu` | Draws everything with WebGPU: the shader as the background, plus the boat, islands, rocks, wreckage and beacons. |
| **TSL** (Three Shading Language) | part of three.js, imported from `three/tsl` | The glue between three.js and our WGSL: `wgslFn` and `wgsl` load the shader code, `uniform` makes values we can change from TypeScript, `positionWorld`, `cameraPosition`, `screenSize` give the shader its inputs. |
| `FBXLoader` | three.js addons, `three/addons/loaders/FBXLoader.js` | Loads our two Blender models, `boat.fbx` and `island.fbx`. |
| `PointerLockControls` | three.js addons, `three/addons/controls/PointerLockControls.js` | Mouse look. Our `BoatControls` class extends it and adds W/A/S/D. |
| **cannon-es** | npm package `cannon-es` | Collision detection between the boat and the islands/rocks. |
| **Web Audio API** | built into the browser | All sound: the sea loop, the water churning past the hull, hits, pickups, island sounds. |
| **Vite** | npm package `vite` | Dev server and production build. Its `?raw` import loads the `.wgsl` files as text; its `?url` import gives us URLs for the model and sound files. |
| **TypeScript** | npm package `typescript` | The language for all game code; `tsc` checks types before every build. |
| Fonts | npm packages `@fontsource-variable/fraunces`, `@fontsource/ibm-plex-mono` | The serif and monospace fonts of the HUD and story panels. |
| Boat and island models | `src/objects/boat.fbx`, `src/objects/island.fbx`, made in Blender and exported as FBX | The rowboat you sail (with mast, sail and ropes) and the island used for all four islands (sand, mountains, a palm tree, rocks). |
| Sounds | `src/sounds/*.wav`, `*.mp3` | Sea loop, hull hit, chest and map pickups, the bell, door and market. |
| **GitHub Actions + Pages** | `.github/workflows/deploy-pages.yml` in the repo root | Builds the game and puts it online on every push to `main`. |

---

## 3. The files and how they connect

```
flotsam/
├── index.html                the HTML for the HUD, compass, panels, pause menu
└── src/
    ├── main.ts               ENTRY POINT: creates everything, wires it together, runs the frame loop
    ├── style.css             all styling
    ├── shaders/water/
    │   ├── lib.wgsl          Seascape's helper functions (noise, waves, lighting, raymarch) + our wake()
    │   └── fragment.wgsl     the shader's entry function, seascape(...)
    ├── objects/
    │   ├── WaveField.ts      CPU copy of the shader's wave height (+ wake)
    │   ├── Ship.ts           the boat: sailing, floating, damage, sinking
    │   ├── models.ts         loads and fits the two Blender models
    │   ├── boat.fbx          the rowboat (Blender)
    │   └── island.fbx        the island (Blender)
    ├── physics/Physics.ts    cannon-es world: hull vs islands and rocks
    ├── controls/BoatControls.ts   mouse look + W/A/S/D → throttle and rudder
    ├── audio/Soundscape.ts   Web Audio: sea, churn, hits, pickups, island sounds
    ├── game/
    │   ├── run.ts            the game state machine (sailing, ashore, home, sunk) and its rules
    │   ├── events.ts         the story text and choices for each island (data)
    │   ├── cards.ts          the upgrades a choice can give you (data)
    │   ├── stats.ts          turns upgrades + cargo into the boat's handling numbers
    │   ├── world.ts          builds the islands, rocks, beacons, flags; bearings
    │   ├── flotsam.ts        floating wreckage: where it goes, what it gives
    │   └── score.ts          the final score, rating and best score
    └── ui/
        ├── story.ts          builds the HTML for the intro, warning, island pages, choice cards, score
        ├── compass.ts        draws the compass tape
        └── toasts.ts         the pop-up messages ("+ 2 food")
```

Who uses whom:

```
main.ts ──┬─> Ship ──────────> WaveField        (boat floats on the CPU waves)
          ├─> WaveField                          (islands, rocks, wreckage float too)
          ├─> Physics (cannon-es)
          ├─> BoatControls (three PointerLockControls)
          ├─> Soundscape
          ├─> Run ──────────> stats ──> cards
          │     │  └────────> world (CHART_PIECES)
          │     └─ calls back into main.ts through RunEvents (onTell, onDepart, onSunk, ...)
          ├─> world ────────> flotsam, WaveField (BASE_CHOPPY)
          ├─> events ───────> cards
          ├─> score
          └─> ui/story, ui/compass, ui/toasts   (only build HTML, never change the game)
```

Two design rules keep this tidy:

- **`game/` never touches the screen.** `Run` only changes numbers and then tells `main.ts` what
  happened through callbacks (`RunEvents`). `main.ts` decides what to show.
- **`ui/` never changes the game.** Those files only build HTML from the data they are given. When a
  button is clicked, they call a function that `main.ts` passed in.

---

## 4. Startup: what happens when the page loads

`index.html` loads `src/main.ts`. Top to bottom, `main.ts` does this once:

1. **Checks for WebGPU.** If `navigator.gpu` is missing it shows the "WebGPU is not available"
   screen and stops. (The shader is WGSL, so there is no WebGL fallback.)
2. **Creates the renderer** (`new THREE.WebGPURenderer`) and waits for `renderer.init()`. The pixel
   ratio is fixed at 1 because the shader is expensive.
3. **Creates the scene** with a light fog.
4. **Builds the ocean shader** (section 5) and sets it as `scene.backgroundNode`.
5. **Creates the `WaveField`**, the CPU copy of the waves.
6. **Creates the `Run`** (game rules), giving it the callbacks it uses to talk back.
7. **Creates the `Ship`**, adds it to the scene, and attaches the camera to its deck.
8. **Creates the controls and the `Soundscape`.** Sound only starts after the first click or key
   press, because browsers block audio until the user interacts.
9. **Adds the sun and sky lights.**
10. **Builds the world** with `buildWorld()` (section 9) and registers every island and rock with
    `Physics`.
11. **Finds the HUD elements** in the HTML, sets up the event listeners (E, Esc, pause, resize).
12. **Shows the intro page** and **starts the frame loop** (`animate()`).

---

## 5. The ocean shader

### Where it lives

- `src/shaders/water/lib.wgsl`: constants and helper functions (noise, wave octaves, the wake, sky
  colour, sea colour, the raymarch).
- `src/shaders/water/fragment.wgsl`: the entry function `seascape(rayDir, rayOrigin, iResolution,
  iTime, choppy, shipPos, shipDir, shipSpeed)` that returns a colour.

### How it gets into three.js

This follows the "Shadertoy shader in Three.js" approach from the course. In `main.ts`:

```ts
const seascape = wgslFn(seascapeEntry, [wgsl(seascapeHelpers)])

const seaColor = seascape({
  rayDir: normalize(positionWorld),
  rayOrigin: cameraPosition,
  iResolution: screenSize,
  iTime: uTime,
  choppy: uChoppy,
  shipPos: uShipPos,
  shipDir: uShipDir,
  shipSpeed: uShipSpeed,
})

scene.backgroundNode = colorSpaceToWorking(vec4(seaColor, 1), THREE.SRGBColorSpace)
```

- Vite's `?raw` import gives us the two `.wgsl` files as strings.
- `wgslFn(entry, ...)` reads the signature of the entry function and turns it into a function we can
  call. `wgsl(helpers)` adds the helper functions it uses to the same shader module.
- The call uses **named arguments**: each property name must match a parameter name in the WGSL
  function. The values are TSL nodes: built-in ones like `positionWorld` and `cameraPosition`, or
  `uniform()` nodes we update every frame.
- `scene.backgroundNode` is drawn by three.js on a big sphere around the camera. Because that sphere
  moves with the camera, `normalize(positionWorld)` is the direction this pixel looks in: the **view
  ray**. `cameraPosition` is where the ray starts. So the shader draws the ocean from wherever the
  game camera is.
- **Colour space:** like every Shadertoy shader, Seascape outputs colours that are already ready for
  the screen (sRGB). three.js lights the boat and islands in a linear colour space and converts the
  whole image to sRGB at the end. Without `colorSpaceToWorking(..., SRGBColorSpace)` that conversion
  would be applied to the sea a second time and wash it out to a pale blue. We can't switch the
  conversion off for the whole renderer, because the lit objects need it.

### What the shader does per pixel

1. **Raymarch** (`heightMapTracing`): step along the view ray until it crosses the water surface.
   The surface height comes from `map()`, which adds up several layers of noise-based waves.
2. **Normal** (`getNormal`): sample `map()` with more detail around the hit point to find which way
   the surface faces.
3. **Colour** (`getSeaColor`): mix a reflected sky colour and the deep water colour with a Fresnel
   term, add a little sun highlight.
4. **Sky**: if the ray points above the horizon, use `getSkyColor`.

### The inputs we send every frame (uniforms)

| Uniform | Set from | Effect |
| --- | --- | --- |
| `uTime` | the clock | animates the waves |
| `uChoppy` | `choppyForPieces(map pieces held)` in `world.ts` | the sea gets rougher as the voyage goes on |
| `uShipPos`, `uShipDir`, `uShipSpeed` | the boat | carve the boat's wake into the water |

This is how the shader responds to the player: steering the boat changes these values, and the
camera on the deck moves where the rays start.

### What we changed from the original

| Original GLSL (Shadertoy) | Our WGSL port |
| --- | --- |
| its own flying camera built from `fragCoord`, `iTime` and `iMouse` | the ray direction and origin come from the three.js camera |
| `#define SEA_TIME` | a `seaTime` value computed in the entry function |
| `#define EPSILON_NRM` | an `epsScale` value from the screen size |
| fixed `SEA_CHOPPY` | the `uChoppy` uniform |
| two near-identical `map` / `map_detailed` functions | one `map(p, iterations, ...)`, called with 3 octaves for the raymarch and 5 for normals |
| (nothing) | `wake()`: our addition, see below |
| `#ifdef AA` antialiasing | not ported (it is switched off in the original too) |

Things WGSL needed that GLSL did not:

- function parameters are read-only, so `getSkyColor` copies its input before changing it;
- GLSL's `out vec3 p` parameter became a `vec4f` return value (distance + hit position);
- GLSL's `uv *= octave_m` (vector × matrix) has no WGSL operator, so it is written out by hand;
- `smoothstep(0.0, -0.02, y)` is undefined in WGSL when the edges go downwards, so it is rewritten.

### The wake (our addition)

`wake()` in `lib.wgsl` is a small extra function inside the same shader. It looks at where a point
is relative to the boat and adds:

- a **trench** behind the boat,
- a **bow wave** in front,
- **chevron ripples** spreading out behind,
- and a calm patch right under the hull.

Each part only exists on its own side of the boat and fades with distance. Its result is subtracted
inside `map()`, so the raymarch and the lighting both "see" it as real waves. It grows with speed.

---

## 6. The CPU copy of the waves

`src/objects/WaveField.ts` is the same wave function as `map()` in the shader, rewritten in
TypeScript: same noise, same octaves, same rotation between octaves, same wake. Its
`height(x, z)` answers "how high is the water here, right now?"

Every frame `main.ts` copies the same values into it that it sends to the shader (`time`, `choppy`,
the boat's position, heading and speed). **If the two ever disagree, the boat floats above or below
the water you see.** That is why every function in it is marked as a mirror of the shader.

Who uses it:

- the boat samples it at the bow, stern and both sides to pitch and roll;
- islands sample it to heave and lean slowly;
- rocks and wreckage sit on it.

---

## 7. The boat

`src/objects/Ship.ts`.

### Structure

```
rig    (turns left/right: yaw)
 └─ deck   (tilts: pitch and roll from the waves)
     ├─ cameraMount ── camera   (so the view rocks with the boat)
     └─ boat model (boat.fbx, from loadBoat() in models.ts)
```

The camera sits just in front of the mast, low enough that you look out over the open foredeck to
the bow. Sideways it lines up with the tip of the bow, which `loadBoat()` finds in the hull's
vertices once the model has loaded, so the bow always points straight ahead.

### The models (`src/objects/models.ts`)

Both models were made in Blender and exported as FBX, in centimetres, with flat colours and no
textures. `models.ts` loads them with three's `FBXLoader` and fits them to the game:

- **Materials:** each FBX material is swapped for a `MeshStandardNodeMaterial` with the same colour
  and flat shading, so the WebGPU renderer lights them like everything else and they keep their
  low-poly look. Both sides of every face are drawn, because the sail and the palm leaves are
  single sheets that would vanish when seen from behind.
- **Wrapping:** the loader keeps Blender's own transform (its Z-up rotation and centimetre scale) on
  the model's root. Each model is put inside an empty group, and all fitting is done on that group,
  so Blender's transform is never overwritten.
- **The boat** (`loadBoat`): turned so its bow (towards +X in Blender) points down -Z, scaled to
  4.2 m long, and centred on its **hull**. Centring on the whole model would include the 3.7 m mast
  and sink the hull under water.
- **The island** (`loadIsland`): scaled so its sandy base is 1 unit from the centre to the edge,
  with the top of the sand at height 0. `buildWorld()` places a copy on each island, scaled to the
  island's size and turned at random, so the four islands don't all look the same from one side.

### Sailing (`sail()`)

- `W` fills the sail toward top speed; `S` backs the sail to slow down (a sail cannot go backwards);
  letting go makes her coast.
- `A`/`D` turn the rudder. The rudder grips better with speed; at a standstill it still turns slowly.
- Turning hard costs speed.
- Top speed, acceleration and turning come from `Stats` (section 10), so upgrades change handling.

### Floating (`rideWaves()`)

The boat asks `WaveField` for the height at five points (centre, bow, stern, left, right), smooths
the centre height for heave, and tilts the deck to the slope between bow/stern and left/right. She
also leans over with speed and into turns.

### Damage and sinking

`damage(amount)` lowers health (scaled by the `frailty` stat) and tints the hull red for a moment.
At 0 health she starts sinking: slowly lists over and goes under. `repair(amount)` patches health
back, up to the maximum.

---

## 8. Collisions with cannon-es

`src/physics/Physics.ts`. cannon-es is used **only to detect contact.**

- The hull is one body made of three spheres along its length.
- Each island is a static cylinder; each rock is a static sphere.
- Every frame `Physics.step()` puts the hull body where the boat is, steps the cannon-es world, and
  reads its contact list to see which island or rock the hull is touching.
- For each touched solid, our own code works out the direction away from it and how deep the hull
  is overlapping, from the positions.

Back in `main.ts` (`collide()`), each hit:

- pushes the boat back out of the solid, so she slides along shores instead of sailing through;
- plays the hull-hit sound once when contact starts;
- for rocks, takes a chunk of health **once per hit** (more for faster hits) and flashes the screen red.

The boat's movement itself is not simulated by cannon-es; it comes from the sailing code in `Ship.ts`.

---

## 9. The world: islands, rocks, wreckage

`src/game/world.ts`, `src/game/flotsam.ts`.

`buildWorld()` uses a **seeded random number generator** (mulberry32), so one seed always builds the
same world. Each new game picks a random seed.

1. **Islands** (four, defined in `ISLAND_SPECS`): each gets a random size and a spot on a ring around
   the start. A spot too close to another island is rejected and redrawn; if all tries fail, the
   island is pushed away from its nearest neighbour until there is room.
2. **Island looks:** a copy of the Blender island (`island.fbx`), sized to the island and turned at
   random. `main.ts` loads the model before building the world, because every island needs it.
3. **Beacons:** a tall glowing column over every island, so you can spot it from far away.
4. **Rocks:** placed along the lines between pairs of islands, never inside an island's landing area.
5. **Wreckage** (`scatterFlotsam`): 28 pieces, each placed 4 to 13 m from a rock, so collecting it
   means sailing close to the rocks. Each is a crate (+2 food), a coin barrel (+10 gold) or planks
   (+10 health).

When you make a choice on an island, `raiseFlag()` removes its beacon and puts a waving flag on its
beach, so you can see from a distance that it is done.

`bearingAndRange()` gives the compass direction and distance to a point, used by the HUD.

---

## 10. The game rules: the run, choices, upgrades, score

### The run (`src/game/run.ts`)

`Run` holds the game's state: the phase, the upgrades (the "deck" of cards), crew, rescued
passengers, gold, food, map pieces, flags set by choices, visited islands, the log of choices, and
time sailed.

It is a **state machine**:

```
 intro ──Start──> sailing ──E near island──> telling ──go ashore──> ashore
                    ^  ^                        │                     │
                    │  └──────leave (button/Esc)┴─────────────────────┤
                    │                                                 │ pick a choice
                    └───────────────────── not all pieces yet ────────┤
                                                                      │
                          all 4 pieces ──> charted ──sail home──> home
                          no crew left or hull at 0 ─────────────> dead
```

Every change of phase calls a callback in `RunEvents` (`onTell`, `onAshore`, `onVisited`,
`onDepart`, `onCharted`, `onHome`, `onSunk`, `onDamage`). `main.ts` supplies those callbacks, and
they show the right panel, update the boat, play sounds and so on.

`resolve(choice)` applies a choice: adds or removes upgrades, health damage, crew, passengers, gold,
food, map piece, flags. Then it checks whether the crew is gone (sunk), the map is complete
(charted), or you just sail on.

`canAfford(choice)` blocks choices that cost more gold or food than you have.

### The stories (`src/game/events.ts`)

Plain data: for each island a title, two paragraphs of story, and a list of choices. A choice can:

- give or take crew, rescued people, gold, food, health, an upgrade, a map piece;
- **set a flag** (for example `saved-sailor`, `opened-the-box`);
- **require a flag** to appear at all. That is how one island's choice unlocks a new option on another.

### Upgrades and stats (`src/game/cards.ts`, `src/game/stats.ts`)

`cards.ts` lists the upgrades a choice can give (thicker hull, more sails, spyglass, and so on).
Each one multiplies or adds to stats.

`resolve()` in `stats.ts` starts from the base stats, applies the **cargo** (passengers and gold
make her slower, more crew makes her quicker, little food makes the crew slow and clumsy), then
applies every upgrade. The result (`Stats`) goes into `ship.applyStats()`.

### Food

While you are at the helm, the crew eats one food every 20 seconds (`passTime()` in `main.ts`).
Low food changes the stats as described above.

### Score (`src/game/score.ts`)

At the end, `scoreVoyage()` adds up points for map pieces, crew, rescued, gold, food and health, plus
a time bonus if you made it home. It picks a rating ("Lucky Drifter" up to "Legend of the Reef", or a
"lost" title if you sank). `recordBest()` keeps the best score in the browser's `localStorage`.

---

## 11. One frame, step by step

`animate()` in `main.ts` runs about 60 times a second:

```
animate()
 1. delta = time since last frame (capped, so a lag spike cannot fling the boat)
 2. controls.update(delta)        W/A/S/D → smooth throttle and rudder values
 3. updateSea(elapsed)
      uTime, uChoppy           → shader
      waves.time, waves.choppy → CPU mirror
      sound.tick(...)          → sea gets louder as it gets rougher
      boat position/heading/speed → shader wake uniforms AND CPU mirror
 4. steerShip(...)
      if a panel is open: the boat is held in place
      ship.update(...)         → sail, float on WaveField, flash
      passTime(...)            → sailing clock, food
      if not at the helm: the wind slowly drifts the boat
 5. collide(delta)              → Physics.step → push out, hit sound, damage, red flash
 6. floatIslands(...)           → islands heave and lean, beacons pulse, flags wave,
                                  rocks and wreckage sit on the waves
 7. collectFlotsam(...)         → wreckage within reach: add cargo, repair, sound, message
 8. offerLanding(...)           → is an island close enough to show "E go ashore"?
 9. if the hull is gone → run.sink()
10. updateHud(delta)            → pop-up messages for anything that changed, map-piece sound,
                                  health bar, speed, map count, bearings, compass
11. renderer.render(scene, camera)
       GPU: Seascape draws ocean + sky, three.js draws the boat, islands, rocks, wreckage
12. requestAnimationFrame(animate)
```

### Example: you press D

1. `BoatControls` records the key and slowly moves `rudder` toward +1.
2. `Ship.sail()` turns the boat's heading, and the turn costs a little speed.
3. The camera on the deck turns with the boat, so the shader's rays now point a new way.
4. The new heading goes into `uShipDir` and `WaveField.shipDirX/Z`, so the wake turns with her.
5. The compass reads the camera's direction and redraws.

### Example: you sail onto a crate

1. `collectFlotsam()` sees the boat is within 3.4 m of it.
2. It hides the crate, calls `run.addCargo(2 food)`, updates the boat's stats and plays the chest sound.
3. Next frame, `updateHud()` sees food went up by 2 and shows "+ 2 food".

---

## 12. The screens and the HUD

All of it is normal HTML and CSS on top of the 3D canvas (`index.html`, `style.css`).

- **Intro page** and **motion-sickness warning**: built by `ui/story.ts`, shown in `#chart`.
- **Island pages, choices, endings**: built by `ui/story.ts`, shown in `#draft` through `openPanel()`.
  While one is open, the boat is held still and the mouse is released so you can click.
  Choices you cannot afford are greyed out.
- **"E go ashore" prompt**: appears in the middle of the screen when you are within 12 m of an
  island's beach.
- **HUD** (bottom left): health bar, map pieces, bearing to the nearest island (or all of them with
  a spyglass), upgrades, cargo.
- **Compass** (top): `ui/compass.ts` draws degree ticks and island marks relative to where you look.
- **Pop-up messages** (right): `ui/toasts.ts`. Each frame `main.ts` compares health, map pieces,
  crew, rescued, gold and food with the last frame, and shows a message for each change.
- **Pause**: releasing the mouse (Esc) while sailing opens the pause menu.

---

## 13. Sound

`src/audio/Soundscape.ts`, built on the browser's Web Audio API.

```
sea_sounds.wav (looping) ──> sea volume ──┐   (a slow wave makes the volume breathe)
generated noise ──> bandpass filter ──> churn volume ──┤   (louder and brighter with speed)
boat_hit.wav, pickups, island sounds ─────────────────┼──> master volume ──> speakers
                                                       │   (quieter while paused)
```

- Nothing starts until the first click or key press (browser rule).
- `tick()` runs every frame: churn follows speed, the sea grows with roughness.
- `bump()` plays the hull hit, louder for harder hits.
- `play('chest' | 'map')` for pickups.
- `arrive('bell' | 'door' | 'market')` when you land on the wreck, the lighthouse or the market;
  `leave()` fades it out when you leave, choose or the voyage ends.

---

## 14. Building and deploying

```bash
npm install       # gets three, cannon-es, vite, typescript, fonts
npm run dev       # local dev server with live reload
npm run build     # tsc type-checks everything, then vite builds into dist/
npm run preview   # serve the built dist/ locally
```

- `vite.config.ts` sets `base: './'` so the built files work from any folder, including GitHub Pages.
- `.github/workflows/deploy-pages.yml` (repo root): on every push to `main`, GitHub installs
  everything in `flotsam/`, runs `npm run build`, and publishes `flotsam/dist` to
  https://gagatkaa.github.io/flotsam/.
- `node_modules/` and `dist/` are in `.gitignore`, so they are never committed.
- WebGPU needs a secure page (https or localhost) and a supporting browser such as Chrome or Edge.

---

## 15. What the project does and does not cover

| Extra | Covered? |
| --- | --- |
| Interaction beyond looking around | **Yes.** Sailing, landing, choices with costs and consequences, pickups, food, score. |
| Physics | **Yes.** cannon-es for collision detection (section 8 says exactly what it does). |
| Multiple shaders | **No.** One custom shader, the ported Seascape. The wake is a function inside it. Everything else uses three.js's built-in materials. |
| Additional WebGPU libraries | **No.** TSL is part of three.js, and cannon-es is not a WebGPU library. |
| Own Blender models, including baking | **Partly.** The boat and the island are our own Blender models, exported as FBX. They use flat colours, with no baked textures. |
| Controlling animations from a Blender model | **No.** The models have no animations. |

---

## 16. Explaining it in two minutes

> **What it is:** a short sailing game. You collect four map pieces from four islands and sail home.
>
> **The shader:** the ocean is Seascape from Shadertoy. I rewrote it from GLSL to WGSL. three.js's
> WebGPURenderer draws it as the scene background using TSL's `wgslFn`, so every pixel casts a ray
> from the game camera into the water. There is no ocean mesh at all.
>
> **Interaction with the shader:** every frame I send it the time, how rough the sea should be, and
> the boat's position, heading and speed. I added a `wake()` function inside the shader that uses
> those to carve a trench behind the boat and a bow wave in front, so steering changes the water.
>
> **Floating:** because the ocean only exists on the GPU, I copied the same wave maths into
> TypeScript. The boat samples it at five points to heave, pitch and roll on the waves you see.
>
> **Physics:** cannon-es detects when the hull touches an island or rock. My code then pushes the
> boat back out and takes damage on rocks.
>
> **The game:** a state machine in `Run` handles sailing, landing, choices and endings. Choices
> change crew, food, gold and upgrades, which change the boat's handling. Some choices unlock
> options on other islands, and there is a score at the end.
>
> **Deploying:** a GitHub Actions workflow builds it with Vite and publishes it to GitHub Pages.
