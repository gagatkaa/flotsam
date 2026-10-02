fn waterMain(fragCoord: vec2f, iResolution: vec2f, iTime: f32, iMouse: vec4f, cameraPos: vec3f, worldPos: vec3f) -> vec4f {
  let uv = (fragCoord - 0.5 * iResolution) / iResolution.y;
  
  var color = vec3f(0.0, 0.3, 0.6);
  
  // Simple animated waves
  let wave = sin(uv.x * 10.0 + iTime * 0.5) * sin(uv.y * 8.0 + iTime * 0.3) * 0.1;
  color += vec3f(wave * 0.2, wave * 0.3, wave * 0.4);
  
  // Distance fade
  let dist = length(uv);
  color *= 1.0 - dist * 0.5;
  
  return vec4f(color, 0.8);
}
