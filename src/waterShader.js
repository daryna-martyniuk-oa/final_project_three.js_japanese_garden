import * as THREE from 'three';

const vertexShader = `
  varying vec2 vWaterXZ;

  void main() {
    vWaterXZ = vec2(position.x, -position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uRipples[8];
  uniform float uRippleStrength[8];
  varying vec2 vWaterXZ;

  void main() {
    float ripple = 0.0;
    for (int i = 0; i < 8; i++) {
      float age = uTime - uRipples[i].z;
      if (age >= 0.0 && age <= 2.0) {
        float distanceToRipple = distance(vWaterXZ, uRipples[i].xy);
        float radius = age * mix(0.22, 1.35, uRippleStrength[i]);
        float ringWidth = mix(0.012, 0.045, uRippleStrength[i]);
        float primaryRing = exp(-pow((distanceToRipple - radius) / ringWidth, 2.0));
        float secondaryRing = exp(-pow((distanceToRipple - max(0.0, radius - ringWidth * 2.2)) / (ringWidth * 0.72), 2.0));
        float fade = exp(-age * 1.3) * (1.0 - smoothstep(1.45, 2.0, age));
        ripple += (primaryRing * 0.72 + secondaryRing * 0.28) * fade * uRippleStrength[i];
      }
    }

    vec3 hazeColor = vec3(0.42, 0.57, 0.54);
    vec3 rippleColor = vec3(0.72, 0.84, 0.81);
    vec3 color = mix(hazeColor, rippleColor, clamp(ripple * 0.85, 0.0, 1.0));
    gl_FragColor = vec4(color, 0.055 + ripple * 0.16);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWaterMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRipples: { value: new Float32Array(8 * 3).fill(0) },
      uRippleStrength: { value: new Float32Array(8) }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending
  });
  material.userData.nextRippleIndex = 0;
  return material;
}

export function triggerWaterRipple(material, x, z, time, strength = 1) {
  const index = material.userData.nextRippleIndex;
  const rippleIndex = index * 3;
  const ripples = material.uniforms.uRipples.value;
  ripples[rippleIndex] = x;
  ripples[rippleIndex + 1] = z;
  ripples[rippleIndex + 2] = time;
  material.uniforms.uRippleStrength.value[index] = strength;
  material.userData.nextRippleIndex = (index + 1) % material.uniforms.uRippleStrength.value.length;
}
