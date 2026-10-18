# Flotsam

**A short sailing game on a raymarched WebGPU ocean.**

Eleven days lost at sea, and the map home is torn into four pieces, each one waiting on an island.
Sail a small wooden boat through rocky water, land on the islands, decide what each one is worth to
you, and put the map back together before your hull or your crew gives out.

**Play it:** https://gagatkaa.github.io/flotsam/ (needs a browser with WebGPU, such as Chrome or Edge)

The ocean is [**Seascape** by Alexander Alekseev (TDM)](https://www.shadertoy.com/view/Ms2SD1),
ported from GLSL to WGSL and rendered with three.js `WebGPURenderer`.

## The voyage

- **Four islands, four map pieces.** A wreck that won't sink, a lighthouse with no light, a crab
  market and the bones of a giant. Each one has its own story and several ways to deal with it.
- **Every choice costs something.** Health, crew, food or gold, and you always see the price before
  you pick. Some choices only appear because of what you did on another island.
- **Wreckage among the rocks.** Crates of food, barrels of coin and planks to patch the hull float
  between the islands, right next to the rocks that will tear your hull open.
- **The crew gets hungry.** Food runs down while you sail, and a hungry crew sails slowly and breaks
  things.
- **A score at the end.** Make it home or go down trying, and you get a points breakdown, a title for
  the run and your best score.

## Controls

| | |
| --- | --- |
| `W` / `S` | speed up / slow down |
| `A` / `D` | steer left / right |
| `E` | go ashore when you are close to an island |
| mouse | look around (click to grab the mouse) |
| `Esc` | pause, or leave an island without choosing |

The view rides the deck of a rocking boat. If you start to feel dizzy, stop and take a break.

## How it works

The Seascape shader is drawn as the scene's background, with its rays starting from the game camera,
so sailing really moves you through the water. It gets a few extra inputs each frame: the boat's
position, heading and speed, which carve a wake into the waves, and a "choppiness" value that makes
the sea rougher as you collect map pieces. The wave maths is mirrored on the CPU so the boat, the
islands and the wreckage float on the same surface you see.

Collisions with islands and rocks are detected with cannon-es. More detail, including how the shader
was ported, is in [`flotsam/README.md`](flotsam/README.md).

## Run it locally

```bash
cd flotsam
npm install
npm run dev
```

Built with three.js (WebGPU + TSL), cannon-es, TypeScript and Vite.

## Credits

- Ocean shader: [Seascape by Alexander Alekseev (TDM), 2014](https://www.shadertoy.com/view/Ms2SD1),
  licensed CC BY-NC-SA 3.0. This project is non-commercial and keeps the attribution.
