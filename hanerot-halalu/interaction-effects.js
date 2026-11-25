import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Measured on the supplied model, after the viewer normalizes its height to 2.5.
// These narrow regions start above the metal rims; the cups never deform.
export const candleRegions = Array.from({ length: 9 }, (_, i) => ({
  x: (i - 4) * .2725,
  base: i === 4 ? 1.100 : .980,
  height: i === 4 ? .150 : .133,
  phase: i * 2.39996,
}));

export function createFlameMotion(model, reducedMotion = false) {
  const uniforms = {
    uFlameTime: { value: 0 },
    uFlameMotion: { value: reducedMotion ? 0 : 1 },
    uFlameWind: { value: new THREE.Vector3() },
  };
  const previousView = new THREE.Vector3();
  const view = new THREE.Vector3();
  const windTarget = new THREE.Vector3();
  let hasPreviousView = false;
  const decorators = new Map();
  const point = new THREE.Vector3();
  model.updateMatrixWorld(true);

  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position');
    const data = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      if (point.y <= .980 || Math.abs(point.z) > .05) continue;
      const index = THREE.MathUtils.clamp(Math.round(point.x / .2725) + 4, 0, 8);
      const region = candleRegions[index];
      if (Math.abs(point.x - region.x) > .045 || point.y <= region.base) continue;
      data[i * 2] = THREE.MathUtils.clamp((point.y - region.base) / region.height, 0, 1);
      data[i * 2 + 1] = region.phase;
    }
    mesh.geometry.setAttribute('aFlame', new THREE.BufferAttribute(data, 2));
    const worldToLocal = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).invert();
    decorators.set(mesh, shader => {
      Object.assign(shader.uniforms, uniforms, { uFlameWorldToLocal: { value: worldToLocal } });
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        attribute vec2 aFlame;
        varying vec2 vFlame;
        uniform float uFlameTime;
        uniform float uFlameMotion;
        uniform vec3 uFlameWind;
        uniform mat3 uFlameWorldToLocal;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vFlame = aFlame;
        float flameBend = aFlame.x * aFlame.x;
        float flameWave = sin(uFlameTime * 3.1 + aFlame.y)
          + 0.35 * sin(uFlameTime * 5.3 + aFlame.y * 1.7);
        vec3 flameOffset = vec3(
          0.0032 * flameWave,
          0.0023 * sin(uFlameTime * 3.9 + aFlame.y),
          0.0022 * sin(uFlameTime * 2.7 + aFlame.y * 1.3)
        ) + uFlameWind;
        transformed += uFlameWorldToLocal * flameOffset * flameBend * uFlameMotion;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        varying vec2 vFlame;
        uniform float uFlameTime;
        uniform float uFlameMotion;
      `).replace('#include <lights_physical_fragment>', `
        float livingFlame = smoothstep(0.04, 0.28, vFlame.x);
        float flamePulse = 1.0 + uFlameMotion * (
          0.035 * sin(uFlameTime * 3.9 + vFlame.y)
          + 0.018 * sin(uFlameTime * 6.1 + vFlame.y * 1.8)
        );
        vec3 flameColor = mix(vec3(1.0, 0.43, 0.075), vec3(1.0, 0.88, 0.59), smoothstep(0.12, 0.65, vFlame.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, flameColor * 0.22, livingFlame);
        metalnessFactor = mix(metalnessFactor, 0.0, livingFlame);
        roughnessFactor = mix(roughnessFactor, 0.9, livingFlame);
        totalEmissiveRadiance += flameColor * 1.45 * flamePulse * livingFlame;
        #include <lights_physical_fragment>
      `);
    });
  });

  return {
    decorate: mesh => decorators.get(mesh),
    uniforms,
    update(time, delta, camera, target) {
      if (reducedMotion) return false;
      uniforms.uFlameTime.value = time;
      view.copy(camera.position).sub(target).normalize();
      windTarget.set(0, 0, 0);
      if (hasPreviousView && delta > 0) {
        // A small delayed lean opposite the orbit, bounded even after a reset.
        windTarget.copy(view).sub(previousView).multiplyScalar(-.018 / delta);
        windTarget.y = 0;
        windTarget.clampLength(0, .014);
      }
      uniforms.uFlameWind.value.lerp(windTarget, 1 - Math.exp(-delta * 7));
      previousView.copy(view);
      hasPreviousView = true;
      return true;
    },
  };
}

export function createPointerLight(scene, camera, element, model, reducedMotion = false) {
  RectAreaLightUniformsLib.init();
  // A real neutral softbox: the existing PBR materials determine the color and
  // spread of its reflection on silver, gold, engravings and curved surfaces.
  const light = new THREE.RectAreaLight(0xffffff, 0, .72, 1.05);
  light.name = 'Pointer softbox';
  scene.add(light);
  const pointer = new THREE.Vector2();
  const smoothPointer = new THREE.Vector2();
  const normal = new THREE.Vector3();
  const surface = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  const plane = new THREE.Plane();
  const raycaster = new THREE.Raycaster();
  let inside = false, trackingTouch = false, positioned = false;

  function follow(event) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || !event.isPrimary) return;
    pointer.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2,
    );
    inside = Math.abs(pointer.x) <= 1 && Math.abs(pointer.y) <= 1;
    if (!positioned) smoothPointer.copy(pointer);
    if (event.pointerType === 'touch') trackingTouch = true;
  }
  function leave(event) {
    if (event.pointerType === 'touch') trackingTouch = false;
    inside = false;
  }
  function release(event) {
    if (event.pointerType === 'touch' || trackingTouch) leave(event);
  }
  element.addEventListener('pointerenter', follow);
  element.addEventListener('pointermove', follow);
  element.addEventListener('pointerdown', follow);
  element.addEventListener('pointerleave', leave);
  element.addEventListener('pointercancel', leave);
  window.addEventListener('pointerup', release);
  window.addEventListener('blur', () => { inside = false; });

  return {
    light,
    update(delta, blocked = false) {
      const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 10);
      smoothPointer.lerp(pointer, blend);
      camera.updateMatrixWorld();
      // Project through the cursor onto the model's center plane. This keeps
      // tracking stable through orbit, zoom and pan without per-frame mesh picking.
      camera.getWorldDirection(normal).negate();
      plane.setFromNormalAndCoplanarPoint(normal, center);
      raycaster.setFromCamera(smoothPointer, camera);
      const intersects = raycaster.ray.intersectPlane(plane, surface);
      const active = inside && !blocked && intersects !== null;
      if (intersects) {
        desired.copy(surface).addScaledVector(normal, 1.65);
        if (!positioned) { light.position.copy(desired); positioned = true; }
        light.position.lerp(desired, blend);
        light.up.copy(camera.up).applyQuaternion(camera.quaternion);
        light.lookAt(surface);
      }
      const previousIntensity = light.intensity;
      light.intensity = THREE.MathUtils.lerp(light.intensity, active ? 2.5 : 0, blend);
      if (!active && light.intensity < .001) light.intensity = 0;
      return light.position.distanceToSquared(desired) > 1e-8
        || smoothPointer.distanceToSquared(pointer) > 1e-8
        || Math.abs(previousIntensity - light.intensity) > .0001;
    },
  };
}
