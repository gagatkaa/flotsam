// "Seascape" by Alexander Alekseev aka TDM - 2014
// https://www.shadertoy.com/view/Ms2SD1
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
//
// Constants and helpers, injected ahead of the entry function in fragment.wgsl.
// The height field is mirrored on the CPU in src/objects/WaveField.ts.

const NUM_STEPS: i32 = 32;
const PI: f32 = 3.141592;
const EPSILON: f32 = 1e-3;

const ITER_GEOMETRY: i32 = 3;
const ITER_FRAGMENT: i32 = 5;
const SEA_HEIGHT: f32 = 0.6;
const SEA_SPEED: f32 = 0.8;
const SEA_FREQ: f32 = 0.16;
const SEA_BASE: vec3f = vec3f( 0.0, 0.09, 0.18 );
// GLSL vec3( 0.8, 0.9, 0.6 ) * 0.6, pre-scaled: vector * scalar is not a valid const expression everywhere
const SEA_WATER_COLOR: vec3f = vec3f( 0.48, 0.54, 0.36 );

fn hash( p: vec2f ) -> f32 {

	let h = dot( p, vec2f( 127.1, 311.7 ) );
	return fract( sin( h ) * 43758.5453123 );

}

fn noise( p: vec2f ) -> f32 {

	let i = floor( p );
	let f = fract( p );
	let u = f * f * ( 3.0 - 2.0 * f );

	return - 1.0 + 2.0 * mix(
		mix( hash( i + vec2f( 0.0, 0.0 ) ), hash( i + vec2f( 1.0, 0.0 ) ), u.x ),
		mix( hash( i + vec2f( 0.0, 1.0 ) ), hash( i + vec2f( 1.0, 1.0 ) ), u.x ),
		u.y
	);

}

fn diffuse( n: vec3f, l: vec3f, p: f32 ) -> f32 {

	return pow( dot( n, l ) * 0.4 + 0.6, p );

}

fn specular( n: vec3f, l: vec3f, e: vec3f, s: f32 ) -> f32 {

	let nrm = ( s + 8.0 ) / ( PI * 8.0 );
	return pow( max( dot( reflect( e, n ), l ), 0.0 ), s ) * nrm;

}

// `dusk` runs from 0 at noon to 1 at sunset
fn getSkyColor( e: vec3f, dusk: f32 ) -> vec3f {

	var dir = e; // WGSL parameters are immutable
	dir.y = ( max( dir.y, 0.0 ) * 0.8 + 0.2 ) * 0.8;

	let day = vec3f( pow( 1.0 - dir.y, 2.0 ), 1.0 - dir.y, 0.6 + ( 1.0 - dir.y ) * 0.4 ) * 1.1;

	let horizon = pow( 1.0 - clamp( e.y, 0.0, 1.0 ), 5.0 );
	let evening = mix( vec3f( 0.2, 0.24, 0.45 ), vec3f( 1.25, 0.58, 0.28 ), horizon );

	return mix( day, evening, dusk );

}

fn getSun( e: vec3f, l: vec3f, dusk: f32 ) -> vec3f {

	let d = max( dot( e, l ), 0.0 );

	let disc = smoothstep( 0.99955, 0.9998, d );
	let halo = pow( d, 900.0 ) * 0.9 + pow( d, 90.0 ) * 0.35;
	let glow = pow( d, 6.0 ) * mix( 0.18, 0.55, dusk );

	let discColor = mix( vec3f( 1.6, 1.5, 1.3 ), vec3f( 1.8, 1.0, 0.45 ), dusk );
	let haloColor = mix( vec3f( 1.0, 0.82, 0.55 ), vec3f( 1.0, 0.45, 0.18 ), dusk );

	return discColor * disc + haloColor * ( halo + glow );

}

fn sea_octave( uvIn: vec2f, choppy: f32 ) -> f32 {

	var uv = uvIn;
	uv += noise( uv );

	var wv = 1.0 - abs( sin( uv ) );
	let swv = abs( cos( uv ) );
	wv = mix( wv, swv, wv );

	return pow( 1.0 - pow( wv.x * wv.y, 0.65 ), choppy );

}

// the boat's wake: a trench astern, a swell at the bow and chevrons behind
fn wake( p: vec3f, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> f32 {

	let to = p.xz - shipPos;
	let along = dot( to, shipDir );
	let perp = vec2f( - shipDir.y, shipDir.x );
	let across = dot( to, perp );
	let dist = length( to );

	let v = clamp( shipSpeed / 8.0, 0.0, 1.6 );

	// calm the water under the whole hull, or the trench/bow seam shows as a crease in view
	let hull = exp( - dist * dist * 0.10 );

	let behind = max( - along, 0.0 );
	let ahead = max( along, 0.0 );
	let astern = smoothstep( - 0.8, 0.8, - along );

	let trench = - 0.4 * v * astern * exp( - behind * 0.16 ) * exp( - across * across * 0.08 );

	let bow = 0.3 * v * ( 1.0 - astern ) * exp( - ahead * 0.2 ) * exp( - across * across * 0.1 );

	let chevron = 0.16 * v * astern * sin( behind * 1.7 - abs( across ) * 2.4 )
		* exp( - behind * 0.06 ) * exp( - abs( across ) * 0.22 );

	return ( trench + bow + chevron ) * ( 1.0 - hull * 0.85 );

}

// height of p above the sea, negative below the surface
fn map( p: vec3f, iterations: i32, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> f32 {

	var freq = SEA_FREQ;
	var amp = SEA_HEIGHT;
	var choppy = choppy0;

	var uv = p.xz;
	uv.x *= 0.75;

	var h: f32 = 0.0;

	for ( var i = 0; i < iterations; i ++ ) {

		let d = sea_octave( ( uv + seaTime ) * freq, choppy )
			+ sea_octave( ( uv - seaTime ) * freq, choppy );

		h += d * amp;

		// GLSL `uv *= octave_m` (row vector times matrix), spelled out per component
		uv = vec2f( uv.x * 1.6 + uv.y * 1.2, uv.x * - 1.2 + uv.y * 1.6 );

		freq *= 1.9;
		amp *= 0.22;
		choppy = mix( choppy, 1.0, 0.2 );

	}

	return p.y - h - wake( p, shipPos, shipDir, shipSpeed );

}

fn getSeaColor( p: vec3f, n: vec3f, l: vec3f, eye: vec3f, dist: vec3f, dusk: f32 ) -> vec3f {

	var fresnel = clamp( 1.0 - dot( n, - eye ), 0.0, 1.0 );
	fresnel = min( fresnel * fresnel * fresnel, 0.5 );

	let reflected = getSkyColor( reflect( eye, n ), dusk );
	let refracted = SEA_BASE + diffuse( n, l, 80.0 ) * SEA_WATER_COLOR * 0.12;

	var color = mix( refracted, reflected, fresnel );

	let atten = max( 1.0 - dot( dist, dist ) * 0.001, 0.0 );
	color += SEA_WATER_COLOR * ( p.y - SEA_HEIGHT ) * 0.18 * atten;

	let glint = mix( vec3f( 1.0 ), vec3f( 1.3, 0.75, 0.4 ), dusk );
	color += glint * specular( n, l, eye, 600.0 * inverseSqrt( dot( dist, dist ) ) );

	return color;

}

fn getNormal( p: vec3f, eps: f32, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> vec3f {

	let h = map( p, ITER_FRAGMENT, seaTime, choppy0, shipPos, shipDir, shipSpeed );
	let hx = map( vec3f( p.x + eps, p.y, p.z ), ITER_FRAGMENT, seaTime, choppy0, shipPos, shipDir, shipSpeed );
	let hz = map( vec3f( p.x, p.y, p.z + eps ), ITER_FRAGMENT, seaTime, choppy0, shipPos, shipDir, shipSpeed );

	return normalize( vec3f( hx - h, eps, hz - h ) );

}

// returns vec4f( distance along ray, hit position )
fn heightMapTracing( ori: vec3f, dir: vec3f, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> vec4f {

	var tm: f32 = 0.0;
	var tx: f32 = 1000.0;

	var hx = map( ori + dir * tx, ITER_GEOMETRY, seaTime, choppy0, shipPos, shipDir, shipSpeed );
	if ( hx > 0.0 ) {
		return vec4f( tx, ori + dir * tx );
	}

	var hm = map( ori, ITER_GEOMETRY, seaTime, choppy0, shipPos, shipDir, shipSpeed );

	for ( var i = 0; i < NUM_STEPS; i ++ ) {

		let tmid = mix( tm, tx, hm / ( hm - hx ) );
		let p = ori + dir * tmid;
		let hmid = map( p, ITER_GEOMETRY, seaTime, choppy0, shipPos, shipDir, shipSpeed );

		if ( hmid < 0.0 ) {
			tx = tmid;
			hx = hmid;
		} else {
			tm = tmid;
			hm = hmid;
		}

		if ( abs( hmid ) < EPSILON ) {
			break;
		}

	}

	let t = mix( tm, tx, hm / ( hm - hx ) );

	return vec4f( t, ori + dir * t );

}

fn getPixel( ori: vec3f, dir: vec3f, seaTime: f32, choppy0: f32, epsScale: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32, l: vec3f, dusk: f32 ) -> vec3f {

	let hit = heightMapTracing( ori, dir, seaTime, choppy0, shipPos, shipDir, shipSpeed );
	let p = hit.yzw;
	let dist = p - ori;

	let n = getNormal( p, dot( dist, dist ) * epsScale, seaTime, choppy0, shipPos, shipDir, shipSpeed );

	return mix(
		getSkyColor( dir, dusk ) + getSun( dir, l, dusk ),
		getSeaColor( p, n, l, dir, dist, dusk ),
		// GLSL pow( smoothstep( 0.0, -0.02, dir.y ), 0.2 ), flipped because WGSL
		// leaves smoothstep() undefined when low >= high
		pow( 1.0 - smoothstep( - 0.02, 0.0, dir.y ), 0.2 )
	);

}
