import * as THREE from 'three';

// The uploaded texture contains baked shadows. Preserve that engraving detail,
// while restoring the distinct reflectance of silver and warm yellow gold.
export const finish = Object.freeze({
  goldStart: .20,
  goldEnd: .50,
  goldBlend: .85,
  goldTint: [1, .58, .18],
  goldGamma: .70,
  silverNeutral: .78,
  silverGamma: .78,
  gain: 1.18,
  metalBase: .35,
  metalDetail: .65,
  roughBase: .26,
  roughDetail: .50,
  goldRoughBase: .19,
  goldRoughDetail: .28,
  normalStrength: .22,
  detailFill: .08,
});

export function finishMetal(material, decorateShader) {
  material.color.set(0xffffff);
  material.metalness = 1;
  material.roughness = 1;
  material.normalScale.setScalar(finish.normalStrength);
  material.envMapIntensity = 1;
  if (material.specularColor) material.specularColor.set(0xffffff);
  if ('specularIntensity' in material) material.specularIntensity = 1;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec3 sourceMetal = max(diffuseColor.rgb, vec3(0.001));
      float warmth = (sourceMetal.r - sourceMetal.b) / max(sourceMetal.r, 0.03);
      float goldRegion = smoothstep(${finish.goldStart}, ${finish.goldEnd}, warmth);
      float metalLuminance = dot(sourceMetal, vec3(0.2126, 0.7152, 0.0722));
      vec3 silverFinish = mix(sourceMetal, vec3(metalLuminance), ${finish.silverNeutral});
      silverFinish = pow(silverFinish, vec3(${finish.silverGamma})) * ${finish.gain};
      vec3 goldFinish = vec3(1.0, ${finish.goldTint[1]}, ${finish.goldTint[2]})
        * pow(sourceMetal.r, ${finish.goldGamma}) * ${finish.gain};
      diffuseColor.rgb = clamp(mix(silverFinish, goldFinish, goldRegion * ${finish.goldBlend}), 0.0, 0.98);
      totalEmissiveRadiance += diffuseColor.rgb * ${finish.detailFill};
    `).replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      metalnessFactor = clamp(max(${finish.metalBase} + metalnessFactor * ${finish.metalDetail}, goldRegion * 0.94), 0.0, 1.0);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(${finish.roughBase} + roughnessFactor * ${finish.roughDetail}, ${finish.goldRoughBase} + roughnessFactor * ${finish.goldRoughDetail}, goldRegion), 0.2, 0.52);
    `);
    decorateShader?.(shader);
  };
  material.customProgramCacheKey = () => 'silver-gold-studio-v4' + (decorateShader ? '-flames' : '');
  material.needsUpdate = true;
}

// Broad neutral studio panels give polished metal readable, moving reflections.
// The navy gallery backdrop is kept out of these reflections to avoid blue silver.
export const studioPanels = [
  {position:[-4,3.5,4],size:[2.5,5],strength:3.2},
  {position:[4,1.5,3],size:[2,4.5],strength:2.4},
  {position:[0,.8,6],size:[6,4.5],strength:1.65},
  {position:[0,5,0],size:[4,3],strength:2.8},
  {position:[-3,2,-4],size:[2,4],strength:2.2},
  {position:[3,.5,-5],size:[3,3.5],strength:1.4},
];

export function createStudioEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color().setScalar(.3);
  const panels = [];
  for (const {position,size,strength} of studioPanels) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(strength),side:THREE.DoubleSide}),
    );
    panel.position.set(...position);
    panel.lookAt(0,0,0);
    studio.add(panel);
    panels.push(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(studio, .025);
  for (const panel of panels) { panel.geometry.dispose(); panel.material.dispose(); }
  generator.dispose();
  return target;
}
