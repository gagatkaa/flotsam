// "Seascape" by Alexander Alekseev aka TDM - 2014
// https://www.shadertoy.com/view/Ms2SD1
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
//
// Entry point of the port. Helpers live in ./lib.wgsl and are injected ahead of
// this function by main.ts.
//
// Deviations from the original GLSL:
//  - the shadertoy's internal fly camera is replaced by the three.js camera:
//    `rayDir` is the world-space view ray, `rayOrigin` the camera position
//  - `#define SEA_TIME (1.0 + iTime * SEA_SPEED)` becomes the `seaTime` local
//  - `#define EPSILON_NRM (0.1 / iResolution.x)` becomes the `epsScale` local
//  - the fixed `SEA_CHOPPY` becomes the `choppy` argument
//  - `shipPos`, `shipDir` and `shipSpeed` drive the boat's wake (our addition)
//  - `iMouse` is dropped: pointer-lock mouse look already drives the camera
//  - the `#ifdef AA` variant is not ported (it is disabled upstream)
//
// main.ts calls this with named arguments, so the parameter names here must
// match the names used there.

fn seascape( rayDir: vec3f, rayOrigin: vec3f, iResolution: vec2f, iTime: f32, choppy: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> vec3f {

	let dir = normalize( rayDir );

	let seaTime = 1.0 + iTime * SEA_SPEED;
	let epsScale = 0.1 / iResolution.x;

	let color = getPixel( rayOrigin, dir, seaTime, choppy, epsScale, shipPos, shipDir, shipSpeed );

	// post
	return pow( color, vec3f( 0.65 ) );

}
