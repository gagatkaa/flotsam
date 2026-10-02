PLAN FOR FLOTSAM - Interactive WebGPU Shader Experience
========================================================

ASSIGNMENT REQUIREMENTS (From user)
- Find a fragment shader you like on Shadertoy.com and port it to WebGPU (WGSL)
- Embed it in a ThreeJS environment with the WebGPURenderer
- Make sure the shader responds to user interaction
- Submit a URL (deployed) + source code separately
- Mention original shader URL in a README.md at root
- Do not submit node_modules

EXTRA MARKS: Interaction > just looking around, Integration of physics,
Integration of multiple shaders, Integration of additional WebGPU libraries,
Integration of your own Blender models (including baking) - but user says no baking,
Controlling animations from Blender model, MUST be fully functional online.

USER PREFERENCES
- No baking
- Can make simple Blender models or use made ones
- Want to be able to walk around / swim / fly depending on concept
- Maybe have some physics
- Use multiple cool shaders to show what can be done
- Some additional WebGPU libraries
- Don't make it too complicated

CONCEPT: "FLOTSAM - Underwater Exploration"
---------------------------------------------
Matching the project name "flotsam" (floating debris in water), create an underwater scene:
- Movement: "Swim" mode - fly/swim through water (first-person with WASD + space/crouch or just free-fly). Use PointerLockControls or custom FPS controls. Can toggle between swim/fly.
- Environment: Submerged area with water, caustics, floating objects
- Physics: Floating debris (wood planks, bottles, cans, leaves) that drift slowly, maybe react to player movement/water currents. Simple rigid body physics.
- Multiple shaders: Water/ocean shader, caustics, debris/particles, volumetric fog, maybe seafloor terrain shader
- Models: Simple low-poly Blender models (planks, rocks, bottles) - no baking needed. Can use basic geometries + shaders
- Interaction: Player can move around, look, maybe push objects, trigger currents, or interact with light


SHADERTOY CANDIDATES (Good for water/ocean)
--------------------------------------------
Recommended:
1. "Seascape" by TDM - https://www.shadertoy.com/view/Ms2SD1
   - Classic ocean shader, good depth, foam, lighting. Has Image pass. Can be ported to WGSL.
   - Interaction: can pass mouse/time/camera direction
2. "Ocean" or "Water Caustics" - https://www.shadertoy.com/view/MdKXDm (Water Caustics) 
   - Caustics shader could be used on seafloor or projected
3. "Volumetric Light Rays" or "God Rays" - https://www.shadertoy.com/view/XdBGRK
   - For underwater god rays
4. "Clouds" / "Volumetric Clouds" - https://www.shadertoy.com/view/Xds3zN (IQ's Clouds)
   - Could use for caustics/fog

Suggested pick: Seascape (Ms2SD1) as main shader applied to water plane, + simpler caustics as second shader (maybe fullscreen quad or projected on seafloor). That gives multiple shaders + strong visual impact.


TECH STACK & DEPENDENCIES
-------------------------
Add to flotsam/package.json (starting from current Vite+TS):
- three@0.160+ or 0.170+ (has WebGPURenderer & TSL)
  - For WebGPU: use three/webgpu build and three/tsl
- @types/three (dev)
- Physics: cannon-es (simple, lightweight, works well in browser) OR rapier3d-compat (Rapier is performant). Cannon-es easier to integrate.
- Additional WebGPU libs? Maybe "three/examples/jsm" addons (PointerLockControls, FlyControls) or "postprocessing" if supporting WebGPU? Or just use built-in Three addons from unpkg via importmap or node_modules (Vite handles). 
- Maybe gltfjsx not needed - just GLTFLoader for simple models. Can load GLB/GLTF.

Also need to add three dependency. Current project has no three.


FILE STRUCTURE PLAN
-------------------
flotsam/
├── README.md (mention original Shadertoy URL + deployment + credits)
├── public/
│   ├── models/ (simple GLB models - self-made low-poly)
│   └── env/ or textures if needed
├── src/
│   ├── main.ts (entry - setup scene, renderer, controls, physics)
│   ├── style.css (canvas full-screen)
│   ├── shaders/
│   │   ├── water/
│   │   │   └── fragment.wgsl (ported from Shadertoy Seascape/Ms2SD1)
│   │   ├── caustics/
│   │   │   └── fragment.wgsl (second shader)
│   │   └── fog/ or particles.wgsl (third shader if desired)
│   ├── objects/
│   │   ├── Flotsam.ts (debris with physics)
│   │   ├── Water.ts (water mesh with shader material)
│   │   └── Seafloor.ts
│   ├── controls/
│   │   └── PlayerControls.ts (FPS/swim controls)
│   └── physics/
│       └── PhysicsWorld.ts (cannon-es setup)
└── vite.config.ts (optional)
└── index.html (already exists, uses /src/main.ts)


IMPLEMENTATION STEPS (Plan - No Execution Now)
----------------------------------------------
1. **Setup deps**: Install three, @types/three, cannon-es. Update package.json.
2. **Basic ThreeJS + WebGPURenderer**: Replace main.ts starter with minimal WebGPU scene. Use THREE.WebGPURenderer, scene, camera, resize, animation loop.
3. **Choose + port Shadertoy shader**: Pick Seascape (Ms2SD1). Read its Image tab GLSL. Port to WGSL. Use TSL's wgslFn with MeshBasicNodeMaterial or appropriate node material. Pass uniforms: iTime, iResolution, iMouse, camera/view vectors as needed.
4. **Add interaction**: Make shader respond to mouse (iMouse) and time. Also could respond to player position (pass player position uniform) for extra interaction.
5. **Movement controls**: Implement PointerLockControls (from three/examples/jsm/controls/PointerLockControls) for FPS feel, or FlyControls. For "swim" mode, reduce gravity/inertia, allow free 3D movement (space up, ctrl down). Good balance of simple but interactive.
6. **Physics**: Add cannon-es world. Create simple physics bodies for flotsam debris (boxes/cylinders), ground/seafloor (static plane), maybe player (capsule) if we want collision. Let debris float/drift.
7. **Multiple shaders**: 
   - Main: Water surface using ported Seascape shader (or applied to large plane)
   - Second: Caustics projected onto seafloor (can be a separate mesh with caustics WGSL shader)
   - Third (optional): Simple particle system for bubbles with custom WGSL or just sprites
8. **Simple Blender models**: Create low-poly planks, bottle, rock in Blender (or use primitives). Export as GLB. Load with GLTFLoader. No UV baking - use vertex colors or simple materials + shader effects. This meets "your own Blender models" requirement without baking complexity.
9. **Environment**: Add directional light (sun), fog for underwater depth, seafloor mesh, sky dome or just dark background.
10. **Polish + README**: Include original shader URL prominently in README.md at root. Add controls explanation, credits, deployment URL.
11. **Deploy**: Build with Vite (tsc + vite build), deploy to Netlify/Vercel/GitHub Pages. Ensure fully functional online.


DETAILED SHADER PORTING NOTES (Seascape Ms2SD1)
----------------------------------------------
- Shadertoy uniforms: iTime (float), iResolution (vec2), iMouse (vec4)
- Image tab contains main frag shader. Port vec2/vec3/vec4 → vec2f/vec3f/vec4f, float→f32
- Move helper functions as-is (WGSL similar to GLSL for math: sin, cos, fract, mix, clamp)
- In TSL + wgslFn: pass params by name matching function signature. Return vec4f color.
- For ThreeJS plane, we can apply shader to a large water plane. Also might need camera pos/view - Seascape uses camera, can pass as uniform (camera position/world matrix).
- Interaction: mouse moves light/camera, time animates waves. Also player movement changes view - that's good interaction.


EXTRA MARKS STRATEGY
--------------------
1. Interaction > looking around: Player moves (WASD), looks (mouse with PointerLock), can swim up/down (space/C), objects react to movement (physics). Shader also responds to mouse + time + player position.
2. Physics: cannon-es for rigid bodies - floating debris, collision with player/seafloor. Objects bob/wave naturally.
3. Multiple shaders: ≥3 - water (main Seascape), caustics on seafloor, maybe bubble particles or underwater fog post-shader. Easy to achieve.
4. Additional WebGPU libs: Using Three's WebGPURenderer + TSL (three/tsl) is WebGPU-focused. Could also add postprocessing with WebGPU-aware passes or small utility. Or mention TSL as WebGPU library integration. Alternatively could add 'three-mesh-bvh' if doing complex geometry - optional, keep simple.
5. Own Blender models: Create 2-3 simple low-poly models (wood plank, glass bottle, rock). Export GLB, load without baking. Meets requirement.
6. Controlling animations from Blender model: Simple - maybe bottle gently rocks (keyframed rotation) driven by time, or just let physics control. Or add simple animation clip exported from Blender. Easy to add a subtle bob animation.
7. Online deployment: Vite build → Netlify (drag/drop dist or connect repo) or Vercel - both free, easy.

KEEPING IT SIMPLE
-----------------
- Focus on solid core: one strong Shadertoy port (Seascape) as water, good movement, some physics, 2-3 simple models. Don't over-engineer. Meets all requirements + extras without being complicated.


README STRUCTURE (Required)
---------------------------
# Flotsam - Interactive WebGPU Shader Experience

[Live Demo](DEPLOYED_URL_HERE)

## About
This is an interactive underwater scene built with Three.js + WebGPURenderer, featuring a ported fragment shader from Shadertoy rendered in WGSL.

**Original Shader:** [Seascape by TDM](https://www.shadertoy.com/view/Ms2SD1) on Shadertoy.com

## Features
- WebGPU (WGSL) fragment shader ported from Shadertoy
- Three.js WebGPURenderer with TSL node materials
- First-person swim/fly controls (PointerLock)
- Physics integration (cannon-es) for floating debris
- Multiple shaders (water, caustics, particles)
- Custom low-poly Blender models (GLB, no baking)
- Real-time shader interaction based on time, mouse, and player movement

## Controls
- WASD: Move/swim
- Mouse: Look around
- Space: Swim up
- Shift/Ctrl: Swim down
- Esc: Release mouse

## Tech Stack
- Three.js (WebGPURenderer + TSL)
- TypeScript + Vite
- cannon-es (physics)
- WGSL shaders

## Development
```bash
npm install
npm run dev
npm run build
npm run preview
```

## Deployment
Built with `vite build`, deployed on [Netlify/Vercel] at [URL]

## Credits
- Original water shader: Seascape by TDM (https://www.shadertoy.com/view/Ms2SD1)
- Three.js, cannon-es, etc.

