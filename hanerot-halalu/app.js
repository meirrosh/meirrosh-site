import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { finishMetal, createStudioEnvironment } from './metal-finish.js?v=4';
import { createFlameMotion, createPointerLight } from './interaction-effects.js?v=4';

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');
const gestureCue = $('gesture-cue');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, scene, camera, controls, model, shadow, flames, pointerLight;
let ready = false, dragging = false, dirty = true, toastTimer;
let gestureHandled = false, gestureTimer;
let homeDistance = 5, lastFrame = 0, lastRender = 0, effectTime = 0;
let dialogOpen = false;
const modelSize = new THREE.Vector3();
const homeTarget = new THREE.Vector3(0, 0, 0);
const homeDirection = new THREE.Vector3(0, .045, 1).normalize();

function dismissGestureCue() {
  gestureHandled = true;
  clearTimeout(gestureTimer);
  gestureCue.hidden = true;
}

function showGestureCue() {
  if (!ready || gestureHandled || document.hidden || dialogOpen) return;
  gestureHandled = true;
  gestureCue.hidden = false;
  gestureTimer = setTimeout(dismissGestureCue, 2800);
}

// The same pointer event that dismisses the cue still reaches OrbitControls.
for (const event of ['pointerdown', 'wheel', 'keydown', 'click']) {
  $('experience').addEventListener(event, dismissGestureCue, { once: true, capture: true, passive: true });
}

function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
}

function setAutoRotate(active) {
  if (!controls) return;
  controls.autoRotate = active;
  $('rotate').setAttribute('aria-pressed', String(active));
  $('rotate-label').textContent = active ? 'עצירת הסיבוב' : 'סיבוב אוטומטי';
  $('rotate-icon').firstElementChild.setAttribute('href', active ? '#i-pause' : '#i-play');
  dirty = true;
}

function home() {
  if (!ready) return;
  setAutoRotate(false);
  controls.reset();
  controls.target.copy(homeTarget);
  camera.position.copy(homeDirection).multiplyScalar(homeDistance).add(homeTarget);
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.update();
  dirty = true;
}

function resize() {
  if (!renderer) return;
  const { width, height } = viewer.getBoundingClientRect();
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  if (ready) {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const nextDistance = Math.max(modelSize.y / (2 * tanHalf), modelSize.x / (2 * tanHalf * camera.aspect)) * 1.08 + modelSize.z * .42;
    const ratio = homeDistance ? nextDistance / homeDistance : 1;
    camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
    homeDistance = nextDistance;
    controls.minDistance = Math.max(modelSize.length() * .13, .4);
    controls.maxDistance = homeDistance * 2.6;
    controls.update();
    controls.saveState();
  }
  dirty = true;
}

function zoom(factor) {
  if (!ready) return;
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update();
  dirty = true;
}

function showError(message) {
  dismissGestureCue();
  $('loading').hidden = true;
  $('error').hidden = false;
  if (message) $('error-message').textContent = message;
  viewer.setAttribute('aria-busy', 'false');
}

function addShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,3,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.58)');
  gradient.addColorStop(.5,'rgba(0,0,0,.25)');
  gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,128,128);
  shadow = new THREE.Mesh(new THREE.PlaneGeometry(modelSize.x * 1.7, modelSize.z * 2.5), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false, opacity:.7 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -modelSize.y / 2 - .02;
  scene.add(shadow);
}

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
  } catch (error) {
    console.error(error);
    showError('הדפדפן הזה לא הצליח לפתוח תצוגת תלת־ממד. נסו לפתוח את הקישור ב־Chrome או ב־Safari מעודכנים.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'מודל תלת־ממדי של החנוכייה. גררו לסיבוב, גללו לזום. ניתן להשתמש גם במקשי החצים ובפלוס ומינוס.');
  viewer.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ready = false;
    showError('תצוגת התלת־ממד נעצרה. לחצו על לנסות שוב כדי לפתוח אותה מחדש.');
  });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
  camera.position.set(0, .2, homeDistance);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .08;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .8;
  controls.panSpeed = .65;
  controls.autoRotateSpeed = .65;
  controls.minPolarAngle = .05;
  controls.maxPolarAngle = Math.PI - .05;
  controls.maxTargetRadius = 2;
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', () => {
    dragging = true;
    setAutoRotate(false);
  });
  controls.addEventListener('end', () => { dragging = false; });
  const studio = createStudioEnvironment(renderer);
  scene.environment = studio.texture;
  scene.environmentIntensity = 1;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x85858c, .35));
  const key = new THREE.DirectionalLight(0xfff7e8, .9); key.position.set(3,5,5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .45); fill.position.set(-4,2,3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(1,4,-4); scene.add(rim);
  new ResizeObserver(resize).observe(viewer);
  resize();

  const draco = new DRACOLoader();
  draco.setDecoderPath('./vendor/draco/');
  draco.setWorkerLimit(2);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load('./assets/menorah-polished.glb', gltf => {
    model = gltf.scene;
    model.rotation.x = Math.PI / 2;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const dimensions = box.getSize(new THREE.Vector3());
    const scale = 2.5 / dimensions.y;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    model.position.sub(box.getCenter(new THREE.Vector3()));
    model.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(model).getSize(modelSize);
    flames = createFlameMotion(model, reducedMotion);
    model.traverse(obj => {
      if (!obj.isMesh) return;
      finishMetal(obj.material, flames.decorate(obj));
      if (obj.material.map) obj.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    });
    scene.add(model);
    pointerLight = createPointerLight(scene, camera, renderer.domElement, model, reducedMotion);
    addShadow();
    ready = true;
    resize(); home(); controls.saveState();
    renderer.render(scene, camera);
    $('progress').style.width = '100%';
    $('loading').hidden = true;
    viewer.setAttribute('aria-busy', 'false');
    for (const id of ['rotate','reset','zoom-in','zoom-out']) $(id).disabled = false;
    showGestureCue();
    draco.dispose();
    dirty = true;
  }, event => {
    if (event.total) {
      const percent = Math.min(95, Math.round(event.loaded / event.total * 95));
      $('progress').style.width = percent + '%';
      $('loading-text').textContent = percent < 95 ? `טוענים את החנוכייה… ${percent}%` : 'מוסיפים את הפרטים האחרונים…';
    }
  }, error => {
    console.error('Model loading failed', error);
    draco.dispose();
    showError();
  });

  renderer.domElement.addEventListener('keydown', event => {
    if (!ready) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); setAutoRotate(false);
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= .12;
      if (event.key === 'ArrowRight') spherical.theta += .12;
      if (event.key === 'ArrowUp') spherical.phi -= .12;
      if (event.key === 'ArrowDown') spherical.phi += .12;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi,.05,Math.PI-.05);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update(); dirty = true;
    } else if (['+','=','-','Home'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') home(); else zoom(event.key === '-' ? 1.15 : 1/1.15);
    }
  });

  function animate(time) {
    requestAnimationFrame(animate);
    const delta = Math.min((time - lastFrame) / 1000, .1); lastFrame = time;
    if (document.hidden || !ready) return;
    controls.update(delta);
    if (!dialogOpen) effectTime += delta;
    const flameActive = !dialogOpen && flames.update(effectTime, delta, camera, controls.target);
    const lightActive = pointerLight.update(delta, dialogOpen);
    // Keep the quiet flame shimmer at 30 fps; direct interaction remains smooth.
    if (dirty || controls.autoRotate || dragging || lightActive || (flameActive && time - lastRender >= 1000 / 30)) {
      renderer.render(scene,camera);
      lastRender = time;
      dirty = false;
    }
  }
  requestAnimationFrame(animate);
}

$('rotate').addEventListener('click', () => setAutoRotate(!controls.autoRotate));
$('reset').addEventListener('click', home);
$('zoom-in').addEventListener('click', () => zoom(1/1.18));
$('zoom-out').addEventListener('click', () => zoom(1.18));
$('retry').addEventListener('click', () => window.location.reload());
document.addEventListener('visibilitychange', () => {
  dirty = true;
  if (!document.hidden) showGestureCue();
});

function setFullscreenUI(active) {
  document.body.classList.toggle('immersive', active);
  $('fullscreen').setAttribute('aria-pressed', String(active));
  $('fullscreen').setAttribute('aria-label', active ? 'יציאה ממסך מלא' : 'מסך מלא');
  $('fullscreen').title = active ? 'יציאה ממסך מלא' : 'מסך מלא';
  $('fullscreen').firstElementChild.firstElementChild.setAttribute('href',active ? '#i-close' : '#i-full');
  requestAnimationFrame(resize);
}
$('fullscreen').addEventListener('click', async () => {
  const active = document.body.classList.contains('immersive');
  if (active) {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setFullscreenUI(false);
  } else {
    setFullscreenUI(true);
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => setFullscreenUI(Boolean(document.fullscreenElement)));
document.addEventListener('keydown', event => { if (event.key==='Escape' && !document.fullscreenElement) setFullscreenUI(false); });

$('reference').addEventListener('click', () => {
  setAutoRotate(false);
  dialogOpen = true;
  $('reference-dialog').showModal();
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', () => { dialogOpen = false; dirty = true; });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close();
  });
}
const shareUrl = () => window.location.origin + window.location.pathname;
async function copyLink() {
  try { await navigator.clipboard.writeText(shareUrl()); notify('הקישור הועתק — אפשר לשלוח לחברים'); return true; }
  catch { return false; }
}
$('share').addEventListener('click', async () => {
  if (navigator.share) {
    try { await navigator.share({ title:'הנרות הללו — חנוכייה בתלת־ממד', text:'סובבו את החנוכייה וגלו אותה מכל זווית', url:shareUrl() }); return; }
    catch (error) { if (error.name==='AbortError') return; }
  }
  if (!await copyLink()) {
    $('share-url').value = shareUrl(); dialogOpen = true; $('share-dialog').showModal(); $('share-url').select();
  }
});
$('copy-link').addEventListener('click', async () => {
  if (await copyLink()) $('share-dialog').close();
  else { $('share-url').select(); notify('הקישור מסומן — העתיקו אותו מתיבת הטקסט'); }
});
init().catch(error => { console.error(error); showError(); });
