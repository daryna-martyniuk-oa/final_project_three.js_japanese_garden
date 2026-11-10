import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uRipplePos;
  uniform vec2 uRippleScale;
  uniform float uRippleTime;
  varying vec2 vUv;

  void main() {
    float age = uTime - uRippleTime;
    if (age < 0.0 || age > 3.8) discard;

    vec2 rippleOffset = (vUv - uRipplePos) * uRippleScale;
    float distanceToRipple = length(rippleOffset);
    float radius = age * 1.35;
    float primaryRing = exp(-pow((distanceToRipple - radius) / 0.045, 2.0));
    float secondaryRing = exp(-pow((distanceToRipple - radius * 0.78 + 0.08) / 0.035, 2.0));
    float fade = exp(-age * 0.62) * (1.0 - smoothstep(3.1, 3.8, age));
    float ripple = (primaryRing * 0.72 + secondaryRing * 0.28) * fade;
    if (ripple < 0.015) discard;

    gl_FragColor = vec4(vec3(0.72, 0.84, 0.81), ripple * 0.56);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRipplePos: { value: new THREE.Vector2(-10, -10) },
      uRippleScale: { value: new THREE.Vector2(10.3, 6.2) },
      uRippleTime: { value: -1000 }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}
