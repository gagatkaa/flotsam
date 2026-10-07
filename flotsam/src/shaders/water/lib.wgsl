// "Seascape" by Alexander Alekseev aka TDM - 2014
// https://www.shadertoy.com/view/Ms2SD1
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
//
// GLSL -> WGSL port of the constants + helper functions.
// This chunk is injected into the shader module ahead of the entry function
// (see main.ts: `wgslFn(entry, [ wgsl( helpers ) ])`).

const NUM_STEPS: i32 = 32;
const PI: f32 = 3.141592;
const EPSILON: f32 = 1e-3;

// sea
const ITER_GEOMETRY: i32 = 3;
const ITER_FRAGMENT: i32 = 5;
const SEA_HEIGHT: f32 = 0.6;
const SEA_SPEED: f32 = 0.8;
const SEA_FREQ: f32 = 0.16;
const SEA_BASE: vec3f = vec3f( 0.0, 0.09, 0.18 );
// GLSL: vec3( 0.8, 0.9, 0.6 ) * 0.6 - pre-scaled, vector * scalar is not a
// valid const expression everywhere
const SEA_WATER_COLOR: vec3f = vec3f( 0.48, 0.54, 0.36 );

// math
fn fromEuler( ang: vec3f ) -> mat3x3f {

	let a1 = vec2f( sin( ang.x ), cos( ang.x ) );
	let a2 = vec2f( sin( ang.y ), cos( ang.y ) );
	let a3 = vec2f( sin( ang.z ), cos( ang.z ) );

	var m: mat3x3f;
	m[ 0 ] = vec3f( a1.y * a3.y + a1.x * a2.x * a3.x, a1.y * a2.x * a3.x + a3.y * a1.x, - a2.y * a3.x );
	m[ 1 ] = vec3f( - a2.y * a1.x, a1.y * a2.y, a2.x );
	m[ 2 ] = vec3f( a3.y * a1.x * a2.x + a1.y * a3.x, a1.x * a3.x - a1.y * a3.y * a2.x, a2.y * a3.y );

	return m;

}

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

// lighting
fn diffuse( n: vec3f, l: vec3f, p: f32 ) -> f32 {

	return pow( dot( n, l ) * 0.4 + 0.6, p );

}

fn specular( n: vec3f, l: vec3f, e: vec3f, s: f32 ) -> f32 {

	let nrm = ( s + 8.0 ) / ( PI * 8.0 );
	return pow( max( dot( reflect( e, n ), l ), 0.0 ), s ) * nrm;

}

// sky
// NOTE: WGSL function parameters are immutable, so the GLSL `e.y = ...` needs a local copy.
fn getSkyColor( e: vec3f ) -> vec3f {

	var dir = e;
	dir.y = ( max( dir.y, 0.0 ) * 0.8 + 0.2 ) * 0.8;

	return vec3f( pow( 1.0 - dir.y, 2.0 ), 1.0 - dir.y, 0.6 + ( 1.0 - dir.y ) * 0.4 ) * 1.1;

}

// sea
fn sea_octave( uvIn: vec2f, choppy: f32 ) -> f32 {

	var uv = uvIn;
	uv += noise( uv );

	var wv = 1.0 - abs( sin( uv ) );
	let swv = abs( cos( uv ) );
	wv = mix( wv, swv, wv );

	return pow( 1.0 - pow( wv.x * wv.y, 0.65 ), choppy );

}

// the hollow the boat drags behind her and the water she piles ahead, sampled in
// world space so it rides along with her. Mirrored on the CPU in WaveField.ts.
fn wake( p: vec3f, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> f32 {

	let to = p.xz - shipPos;
	let along = dot( to, shipDir );
	let perp = vec2f( - shipDir.y, shipDir.x );
	let across = dot( to, perp );
	let dist = length( to );

	let v = clamp( shipSpeed / 8.0, 0.0, 1.6 );

	// calm the surface right under the keel so the hull is not buried in its
	// own wake: 1.0 at the hull, ~0 a few metres out. Wide enough to swallow the
	// whole boat, or the trench/bow seam at the beam shows as a crease in front
	// of the camera's eye line.
	let hull = exp( - dist * dist * 0.10 );

	// ramp the wake in over the bow and out over the stern instead of starting
	// it at full strength at along=0 — the hard start turned the seam into a
	// visible fold in the water a step ahead of the hull.
	let behind = smoothstep( 0.0, 0.8, - along );
	let ahead = smoothstep( 0.0, 0.8, along );

	// a rolling trench astern that wakes with speed and dies with distance
	let trench = - 0.4 * v * exp( - behind * 0.16 ) * exp( - across * across * 0.08 );

	// the bow piles water up ahead of her, a swell that shoves the seas apart
	let bow = 0.3 * v * exp( - ahead * 0.2 ) * exp( - across * across * 0.1 );

	// chevrons: standing waves shed off the transom and spreading behind
	let chevron = 0.16 * v * sin( behind * 1.7 - abs( across ) * 2.4 )
		* exp( - behind * 0.06 ) * exp( - abs( across ) * 0.22 );

	return ( trench + bow + chevron ) * ( 1.0 - hull * 0.85 );

}

fn map( p: vec3f, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> f32 {

	var freq = SEA_FREQ;
	var amp = SEA_HEIGHT;
	var choppy = choppy0;

	var uv = p.xz;
	uv.x *= 0.75;

	var h: f32 = 0.0;

	for ( var i = 0; i < ITER_GEOMETRY; i ++ ) {

		let d = sea_octave( ( uv + seaTime ) * freq, choppy )
			+ sea_octave( ( uv - seaTime ) * freq, choppy );

		h += d * amp;

		// GLSL `uv *= octave_m` is a row-vector times matrix product, which WGSL has no
		// operator for, so the octave rotation is spelled out per component
		let rotated = vec2f( uv.x * 1.6 + uv.y * 1.2, uv.x * - 1.2 + uv.y * 1.6 );
		uv = rotated;

		freq *= 1.9;
		amp *= 0.22;
		choppy = mix( choppy, 1.0, 0.2 );

	}

	return p.y - h - wake( p, shipPos, shipDir, shipSpeed );

}

fn map_detailed( p: vec3f, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> f32 {

	var freq = SEA_FREQ;
	var amp = SEA_HEIGHT;
	var choppy = choppy0;

	var uv = p.xz;
	uv.x *= 0.75;

	var h: f32 = 0.0;

	for ( var i = 0; i < ITER_FRAGMENT; i ++ ) {

		let d = sea_octave( ( uv + seaTime ) * freq, choppy )
			+ sea_octave( ( uv - seaTime ) * freq, choppy );

		h += d * amp;

		// GLSL `uv *= octave_m` is a row-vector times matrix product, which WGSL has no
		// operator for, so the octave rotation is spelled out per component
		let rotated = vec2f( uv.x * 1.6 + uv.y * 1.2, uv.x * - 1.2 + uv.y * 1.6 );
		uv = rotated;

		freq *= 1.9;
		amp *= 0.22;
		choppy = mix( choppy, 1.0, 0.2 );

	}

	return p.y - h - wake( p, shipPos, shipDir, shipSpeed );

}

fn getSeaColor( p: vec3f, n: vec3f, l: vec3f, eye: vec3f, dist: vec3f ) -> vec3f {

	var fresnel = clamp( 1.0 - dot( n, - eye ), 0.0, 1.0 );
	fresnel = min( fresnel * fresnel * fresnel, 0.5 );

	let reflected = getSkyColor( reflect( eye, n ) );
	let refracted = SEA_BASE + diffuse( n, l, 80.0 ) * SEA_WATER_COLOR * 0.12;

	var color = mix( refracted, reflected, fresnel );

	let atten = max( 1.0 - dot( dist, dist ) * 0.001, 0.0 );
	color += SEA_WATER_COLOR * ( p.y - SEA_HEIGHT ) * 0.18 * atten;

	color += specular( n, l, eye, 600.0 * inverseSqrt( dot( dist, dist ) ) );

	return color;

}

// tracing
fn getNormal( p: vec3f, eps: f32, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> vec3f {

    var n: vec3f;
    n.y = map_detailed( p, seaTime, choppy0, shipPos, shipDir, shipSpeed );
    n.x = map_detailed( vec3f( p.x + eps, p.y, p.z ), seaTime, choppy0, shipPos, shipDir, shipSpeed ) - n.y;
    n.z = map_detailed( vec3f( p.x, p.y, p.z + eps ), seaTime, choppy0, shipPos, shipDir, shipSpeed ) - n.y;
	n.y = eps;

	return normalize( n );

}

// returns vec4f( distance along ray, hit position )
fn heightMapTracing( ori: vec3f, dir: vec3f, seaTime: f32, choppy0: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> vec4f {

    var tm: f32 = 0.0;
    var tx: f32 = 1000.0;

    var hx = map( ori + dir * tx, seaTime, choppy0, shipPos, shipDir, shipSpeed );
    if ( hx > 0.0 ) {
        return vec4f( tx, ori + dir * tx );
    }

    var hm = map( ori, seaTime, choppy0, shipPos, shipDir, shipSpeed );

    for ( var i = 0; i < NUM_STEPS; i ++ ) {

        let tmid = mix( tm, tx, hm / ( hm - hx ) );
        let p = ori + dir * tmid;
        let hmid = map( p, seaTime, choppy0, shipPos, shipDir, shipSpeed );

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

// `dir` replaces the shadertoy's built-in fly camera, `ori` is the real camera position.
fn getPixel( ori: vec3f, dir: vec3f, seaTime: f32, choppy0: f32, epsScale: f32, shipPos: vec2f, shipDir: vec2f, shipSpeed: f32 ) -> vec3f {

    let hit = heightMapTracing( ori, dir, seaTime, choppy0, shipPos, shipDir, shipSpeed );
    let p = hit.yzw;
    let dist = p - ori;

    let n = getNormal( p, dot( dist, dist ) * epsScale, seaTime, choppy0, shipPos, shipDir, shipSpeed );
	let l = normalize( vec3f( 0.0, 1.0, 0.8 ) );

	return mix(
		getSkyColor( dir ),
		getSeaColor( p, n, l, dir, dist ),
		// GLSL: pow( smoothstep( 0.0, -0.02, dir.y ), 0.2 ) - written with ascending
		// edges because WGSL leaves smoothstep() undefined when low >= high
		pow( 1.0 - smoothstep( - 0.02, 0.0, dir.y ), 0.2 )
	);

}
