// "Seascape" by Alexander Alekseev aka TDM - 2014
// https://www.shadertoy.com/view/Ms2SD1
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
//
// WGSL port, using the three.js camera instead of the shadertoy fly camera.
// Helpers live in ./lib.wgsl. main.ts calls this with named arguments, so the
// parameter names here must match the names used there.

fn seascape( rayDir: vec3f, rayOrigin: vec3f, iResolution: vec2f, iTime: f32, choppy: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32, sunDir: vec3f, dusk: f32 ) -> vec3f {

	let dir = normalize( rayDir );

	let seaTime = 1.0 + iTime * SEA_SPEED;
	let epsScale = 0.1 / iResolution.x;

	let color = getPixel( rayOrigin, dir, seaTime, choppy, epsScale, shipPos, shipDir, shipSpeed, normalize( sunDir ), dusk );

	return pow( color, vec3f( 0.65 ) );

}
