// Hero scene: an "eclipse" core inside a geodesic lattice, wrapped in a network of nodes with
// data pulses walking its edges. Loaded lazily, only when WebGL is available.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const BG = 0x08090b;
const SILVER = new THREE.Color(0xc9d5e3);
const ACCENT = new THREE.Color(0xaebdd0);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const pointVS = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixel;
  uniform float uWave;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float r = length(position);
    // a scanning wave that leaves the core and travels outward
    float front = mod(uTime * 0.55, 9.0);
    float band = smoothstep(1.1, 0.0, abs(r - front)) * uWave;
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0);
    float depth = smoothstep(26.0, 7.0, -mv.z);
    vAlpha = (0.35 + 0.65 * tw + band * 1.2) * depth;
    gl_PointSize = aSize * uPixel * (1.0 + band * 0.9) * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const pointFS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float a = pow(core, 1.8) * vAlpha * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function createHero(canvas, opts = {}) {
  const { reduced = false, mobile = false } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(BG, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 10, 24);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 0.35, 13);
  camera.position.copy(camBase);

  const world = new THREE.Group();
  scene.add(world);
  const rand = rng(7);

  // ── core: black occluder + fresnel rim whose bright side follows the light ──
  const rimUniforms = {
    uColor: { value: SILVER },
    uLight: { value: new THREE.Vector3(0.6, 0.4, 0.7).normalize() },
    uGain: { value: 1 },
  };
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), new THREE.MeshBasicMaterial({ color: BG }));
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: rimUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = normalize(mat3(modelMatrix) * normal);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uLight; uniform float uGain;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main() {
          float f = pow(1.0 - max(dot(vN, vV), 0.0), 4.0);
          float lit = 0.35 + 0.65 * pow(max(dot(vW, uLight), 0.0), 1.5);
          gl_FragColor = vec4(uColor, f * lit * 1.35 * uGain);
        }`,
    }),
  );
  world.add(core, rim);

  // halo sprite behind the core
  const haloTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    grd.addColorStop(0, "rgba(174,189,208,0.08)");
    grd.addColorStop(0.45, "rgba(174,189,208,0.02)");
    grd.addColorStop(1, "rgba(174,189,208,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.setScalar(7.5);
  halo.renderOrder = -1;
  world.add(halo);

  // ── lattice ──
  const lattice = new THREE.Group();
  const icoGeo = new THREE.IcosahedronGeometry(1.75, 1);
  const latLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(icoGeo),
    new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.13, depthWrite: false }),
  );
  lattice.add(latLines);
  world.add(lattice);
  const latVerts = [];
  {
    const p = icoGeo.attributes.position;
    const seen = new Set();
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = v.toArray().map((x) => x.toFixed(3)).join();
      if (!seen.has(k)) { seen.add(k); latVerts.push(v); }
    }
  }

  // orbit hairlines
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.07, depthWrite: false });
  for (const [r, rx, rz] of [[3.1, 1.25, 0.2], [4.4, 1.38, -0.35]]) {
    const pts = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat);
    loop.rotation.set(rx, 0, rz);
    world.add(loop);
  }

  // ── network ──
  const N = mobile ? 80 : 130;
  const nodes = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = golden * i;
    const radius = 2.4 + Math.pow(rand(), 0.8) * 3.2;
    nodes.push(new THREE.Vector3(Math.cos(th) * rr * radius, y * radius * 0.72, Math.sin(th) * rr * radius));
  }
  const edges = [];
  const adj = Array.from({ length: N + latVerts.length }, () => []);
  const key = new Set();
  const link = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || key.has(k)) return;
    key.add(k);
    adj[a].push(edges.length); adj[b].push(edges.length);
    edges.push([a, b]);
  };
  nodes.forEach((p, i) => {
    const near = nodes.map((q, j) => [p.distanceToSquared(q), j]).sort((x, y) => x[0] - y[0]);
    link(i, near[1][1]);
    if (rand() < 0.65) link(i, near[2][1]);
  });
  // a few trunks into the lattice: the investigation converges on the core
  const allPts = nodes.concat(latVerts);
  const trunkStart = nodes.length;
  for (let i = 0; i < (mobile ? 10 : 18); i++) {
    const a = Math.floor(rand() * N);
    let best = 0, bd = Infinity;
    latVerts.forEach((v, j) => { const d = v.distanceToSquared(nodes[a]); if (d < bd) { bd = d; best = j; } });
    link(a, trunkStart + best);
  }
  const edgePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => { allPts[a].toArray(edgePos, i * 6); allPts[b].toArray(edgePos, i * 6 + 3); });
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.075, depthWrite: false });
  world.add(new THREE.LineSegments(edgeGeo, edgeMat));

  const mkPoints = (positions, sizes, color, opacity, wave = 1) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const seeds = new Float32Array(sizes.length).map(() => rand());
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixel: { value: dpr }, uColor: { value: color }, uOpacity: { value: opacity }, uWave: { value: wave } },
      vertexShader: pointVS, fragmentShader: pointFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(g, m);
  };

  const nodePos = new Float32Array(N * 3);
  const nodeSize = new Float32Array(N);
  nodes.forEach((p, i) => { p.toArray(nodePos, i * 3); nodeSize[i] = rand() < 0.08 ? 9 : 3.4 + rand() * 2.6; });
  const nodePts = mkPoints(nodePos, nodeSize, new THREE.Color(0xf0f0f0), 0.95);
  world.add(nodePts);

  const latPos = new Float32Array(latVerts.length * 3);
  latVerts.forEach((v, i) => v.toArray(latPos, i * 3));
  const latPts = mkPoints(latPos, new Float32Array(latVerts.length).fill(3.2), new THREE.Color(0xf0f0f0), 0.7);
  lattice.add(latPts);

  // dust
  const D = mobile ? 700 : 1600;
  const dustPos = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) {
    const r = 6 + rand() * 14, a = rand() * Math.PI * 2, y = (rand() - 0.5) * 12;
    dustPos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
  }
  const dust = mkPoints(dustPos, new Float32Array(D).map(() => 1 + rand() * 1.6), new THREE.Color(0xf0f0f0), 0.35, 0);
  scene.add(dust);

  // pulses walking the graph
  const P = mobile ? 22 : 46;
  const pulses = Array.from({ length: P }, () => ({ e: Math.floor(rand() * edges.length), t: rand(), dir: rand() < 0.5 ? 1 : -1, v: 0.18 + rand() * 0.35 }));
  const pulsePos = new Float32Array(P * 3);
  const pulsePts = mkPoints(pulsePos, new Float32Array(P).map(() => 6 + rand() * 4), ACCENT, 1, 0);
  pulsePts.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  world.add(pulsePts);
  const tmp = new THREE.Vector3();
  function stepPulses(dt) {
    for (let i = 0; i < P; i++) {
      const p = pulses[i];
      p.t += p.v * dt * p.dir;
      if (p.t > 1 || p.t < 0) {
        const end = edges[p.e][p.t > 1 ? 1 : 0];
        const next = adj[end] && adj[end].length ? adj[end][Math.floor(rand() * adj[end].length)] : Math.floor(rand() * edges.length);
        p.e = next;
        p.dir = edges[next][0] === end ? 1 : -1;
        p.t = p.dir === 1 ? 0 : 1;
      }
      const [a, b] = edges[p.e];
      tmp.lerpVectors(allPts[a], allPts[b], p.t).toArray(pulsePos, i * 3);
    }
    pulsePts.geometry.attributes.position.needsUpdate = true;
  }

  // ── layout, input, loop ──
  let W = 1, H = 1, offsetX = 0;
  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const wide = W / H > 1.15 && W > 900;
    offsetX = wide ? Math.min(4.4, 2.35 * camera.aspect) : 0;
    world.position.set(offsetX, wide ? 0 : 2.9, 0);
    world.scale.setScalar(wide ? 1 : 0.7);
  }
  resize();

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scroll = 0;
  let running = false, raf = 0, last = performance.now(), time = 0;
  const lookAt = new THREE.Vector3();

  function render() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduced) time += dt;

    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    camera.position.set(
      camBase.x + pointer.x * 0.9,
      camBase.y + pointer.y * 0.55 + scroll * 0.6,
      camBase.z - scroll * 4.2,
    );
    lookAt.set(offsetX * 0.12, scroll * 0.4, 0);
    camera.lookAt(lookAt);

    world.rotation.y = time * 0.045 + scroll * 0.9;
    world.rotation.x = Math.sin(time * 0.07) * 0.06 + scroll * 0.18;
    lattice.rotation.y = -time * 0.09;
    lattice.rotation.z = time * 0.035;
    dust.rotation.y = time * 0.008;

    // the light on the rim follows the cursor
    rimUniforms.uLight.value.set(pointer.x * 1.4 + 0.3, pointer.y * 1.2 + 0.45, 0.8).normalize();
    rimUniforms.uGain.value = 1 - scroll * 0.5;
    const fade = 1 - scroll * 0.6;
    edgeMat.opacity = 0.075 * fade;
    latLines.material.opacity = 0.13 * fade;

    for (const pts of [nodePts, latPts, dust, pulsePts]) pts.material.uniforms.uTime.value = time;
    if (!reduced) stepPulses(dt);
    renderer.render(scene, camera);
  }

  function loop() {
    render();
    if (running) raf = requestAnimationFrame(loop);
  }

  if (reduced) stepPulses(0);

  return {
    start() {
      if (running) return;
      if (reduced) { render(); return; }
      running = true; last = performance.now(); raf = requestAnimationFrame(loop);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { resize(); if (!running) render(); },
    setPointer(nx, ny) { if (!reduced) { pointer.tx = nx; pointer.ty = ny; } },
    setScroll(p) { scroll = p; if (!running) render(); },
    renderOnce: render,
  };
}
