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