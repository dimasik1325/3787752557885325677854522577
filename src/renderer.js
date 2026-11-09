import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from './config.js';
import { AIR, getBlock, ID } from './blocks.js';
import { buildChunkGeometry, disposeGeometry } from './mesher.js';
import { buildTextureAtlas } from './textures.js';
import { chunkKey } from './world.js';
import { clamp, lerp } from './utils.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.atlas = buildTextureAtlas();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87ceeb);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.fog = new THREE.Fog(0xbfe0ff, 40, 140);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1200);
    this.camera.rotation.order = 'YXZ';

    this.texture = new THREE.CanvasTexture(this.atlas.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.materials = this.createMaterials();
    this.chunkObjects = new Map();
    this.dayLight = 1;

    this.initSky();
    this.initClouds();
    this.initHighlight();
    this.initParticles();
    this.initOverlayScene();

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
  }

  createMaterials() {
    const mk = (opts) =>
      new THREE.MeshBasicMaterial({
        map: this.texture,
        vertexColors: true,
        fog: opts.fog !== false,
        side: opts.side ?? THREE.FrontSide,
        transparent: !!opts.transparent,
        opacity: opts.opacity ?? 1,
        alphaTest: opts.alphaTest ?? 0,
        depthWrite: opts.depthWrite !== false,
      });

    return {
      solid: mk({}),
      cutout: mk({ alphaTest: 0.5, side: THREE.DoubleSide }),
      water: mk({ transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      emissive: mk({}),
    };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setRenderDistance(distance) {
    this.lastRenderDistance = distance;
    const far = Math.max(70, distance * CHUNK_SIZE * 1.02);
    this.scene.fog.near = far * 0.55;
    this.scene.fog.far = far;
    this.camera.far = 1200;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Небо ----------
  initSky() {
    const geometry = new THREE.SphereGeometry(700, 32, 24);
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x3a7bd5) },
      bottomColor: { value: new THREE.Color(0xbfe3ff) },
      sunColor: { value: new THREE.Color(0xfff3c4) },
      sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() },
      sunStrength: { value: 1 },
      night: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        uniform float sunStrength;
        uniform float night;
        varying vec3 vWorldDir;

        void main() {
          float h = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(h, 0.85));

          float d = dot(normalize(vWorldDir), normalize(sunDir));
          float glow = pow(max(d, 0.0), 5.0) * 0.45;
          float disc = smoothstep(0.9970, 0.9990, d);
          float moon = smoothstep(0.9979, 0.9992, -d);
          col += sunColor * (glow * sunStrength);
          col += vec3(1.0, 0.96, 0.85) * disc * sunStrength * 1.6;
          col = mix(col, vec3(0.85, 0.9, 1.0), moon * night * 0.9);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geometry, material);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Звёзды
    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize().multiplyScalar(600);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })
    );
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  initClouds() {
    // Блочный «облачный» шум: редкие крупные кластеры, как в Minecraft
    const cells = 48;
    const px = 2; // пикселей на ячейку
    const size = cells * px;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    // Детерминированный генератор значений
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const lattice = 12;
    const grid = new Float32Array(lattice * lattice);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const sample = (gx, gy) => grid[((gy % lattice) + lattice) % lattice * lattice + (((gx % lattice) + lattice) % lattice)];
    const smooth = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));
    const valueNoise = (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const tx = x - x0;
      const ty = y - y0;
      const v00 = sample(x0, y0);
      const v10 = sample(x0 + 1, y0);
      const v01 = sample(x0, y0 + 1);
      const v11 = sample(x0 + 1, y0 + 1);
      return smooth(smooth(v00, v10, tx), smooth(v01, v11, tx), ty);
    };

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        // тайлящийся шум с периодом lattice
        const n =
          valueNoise((cx / cells) * lattice, (cy / cells) * lattice) * 0.65 +
          valueNoise((cx / cells) * lattice * 2, (cy / cells) * lattice * 2) * 0.35;
        if (n > 0.56) {
          ctx.fillStyle = n > 0.63 ? 'rgba(255,255,255,0.95)' : 'rgba(244,250,255,0.88)';
          ctx.fillRect(cx * px, cy * px, px, px);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.repeat.set(4, 4);
    tex.anisotropy = 4;

    const geo = new THREE.PlaneGeometry(1600, 1600);
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(geo, this.cloudMaterial);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 128;
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
    this.cloudTex = tex;
    this.cloudOffset = 0;
  }

  initHighlight() {
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: true })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    geo.dispose();
  }

  initParticles() {
    this.maxParticles = 400;
    const geo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleColors = new Float32Array(this.maxParticles * 3);
    this.particleSizes = new Float32Array(this.maxParticles);
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));

    // Текстура квадратика
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(1, 1, 6, 6);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 320.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a < 0.4) discard;
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.particles.geometry.setDrawRange(0, 0);
    this.scene.add(this.particles);

    this.particleData = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particleData.push({ life: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, size: 0.15 });
    }
    this.particleCursor = 0;
  }

  spawnBlockParticles(x, y, z, blockId, count = 12) {
    const def = getBlock(blockId);
    const textureName = def.topTexture || def.faces?.[2] || 'stone';
    const tex = this.atlas.uv(textureName);
    // берём цвет с атласа
    const col = this.sampleAtlasColor(textureName);
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      const p = this.particleData[idx];
      p.life = 0.6 + Math.random() * 0.5;
      p.maxLife = p.life;
      p.x = x + 0.15 + Math.random() * 0.7;
      p.y = y + 0.15 + Math.random() * 0.7;
      p.z = z + 0.15 + Math.random() * 0.7;
      p.vx = (Math.random() - 0.5) * 2.4;
      p.vy = Math.random() * 3 + 0.6;
      p.vz = (Math.random() - 0.5) * 2.4;
      p.r = col.r * (0.8 + Math.random() * 0.4);
      p.g = col.g * (0.8 + Math.random() * 0.4);
      p.b = col.b * (0.8 + Math.random() * 0.4);
      p.size = 0.07 + Math.random() * 0.08;
      p.active = true;
    }
    void tex;
  }

  spawnBurstParticle(x, y, z, vx, vy, vz, colorHex) {
    const idx = this.particleCursor;
    this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
    const p = this.particleData[idx];
    p.life = 0.4 + Math.random() * 0.7;
    p.maxLife = p.life;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    const c = new THREE.Color(colorHex);
    c.convertSRGBToLinear();
    p.r = c.r;
    p.g = c.g;
    p.b = c.b;
    p.size = 0.08 + Math.random() * 0.12;
    p.active = true;
  }

  sampleAtlasColor(name) {
    if (!this.colorCache) this.colorCache = new Map();
    if (this.colorCache.has(name)) return this.colorCache.get(name);
    const idx = this.atlas.names.indexOf(name);
    const cols = this.atlas.cols;
    const tile = this.atlas.tile;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const ctx = this.atlas.canvas.getContext('2d');
    const data = ctx.getImageData(col * tile, row * tile, tile, tile).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 10) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    const res = n
      ? new THREE.Color(r / n / 255, g / n / 255, b / n / 255)
      : new THREE.Color(0.6, 0.6, 0.6);
    res.convertSRGBToLinear();
    this.colorCache.set(name, res);
    return res;
  }

  initOverlayScene() {
    this.heldScene = new THREE.Scene();
    this.heldCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    this.heldCamera.position.set(0, 0, 2.2);
    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    this.heldScene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(1, 2, 2);
    this.heldScene.add(dir);

    this.heldMaterial = new THREE.MeshLambertMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    // Рука Стива
    this.armMaterial = new THREE.MeshLambertMaterial({ color: 0xc99a6b });
    this.armSleeveMaterial = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    this.heldArm = new THREE.Group();
    const armGeo = new THREE.BoxGeometry(0.26, 0.26, 0.9);
    const armMesh = new THREE.Mesh(armGeo, this.armMaterial);
    armMesh.position.set(0, 0, 0.35);
    const sleeveGeo = new THREE.BoxGeometry(0.28, 0.28, 0.42);
    const sleeve = new THREE.Mesh(sleeveGeo, this.armSleeveMaterial);
    sleeve.position.set(0, 0, -0.2);
    this.heldArm.add(armMesh, sleeve);
    this.heldArm.position.set(0.72, -0.78, -0.55);
    this.heldArm.rotation.set(0.32, -0.42, 0.34);
    this.heldScene.add(this.heldArm);
    this.heldArm.visible = false;

    this.heldMesh = null;
    this.heldSwing = 0;
    this.heldAction = 0;
    this.swingTimer = 0;
  }

  setHeldBlock(blockId) {
    if (this.heldMesh) {
      this.heldScene.remove(this.heldMesh);
      this.heldMesh.geometry.dispose();
      this.heldMesh = null;
    }
    if (!blockId) {
      if (this.heldArm) this.heldArm.visible = true;
      return;
    }
    if (this.heldArm) this.heldArm.visible = false;
    const def = getBlock(blockId);
    const geo = def.cross ? this.crossGeometry(def) : this.blockGeometry(def);
    this.heldMesh = new THREE.Mesh(geo, this.heldMaterial);
    this.heldMesh.position.set(0.62, -0.42, 0);
    this.heldMesh.rotation.set(0.18, -0.7, 0.12);
    this.heldMesh.scale.setScalar(def.cross ? 0.95 : 0.72);
    this.heldScene.add(this.heldMesh);
  }

  faceUV(name) {
    const [u0, v0, u1, v1] = this.atlas.uv(name);
    return { u0, v0, u1, v1 };
  }

  blockGeometry(def) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uvAttr = geo.attributes.uv;
    const uvs = [];
    for (let f = 0; f < 6; f++) {
      const { u0, v0, u1, v1 } = this.faceUV(def.faces[f]);
      const cornerUV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      uvs.push(...cornerUV);
    }
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvs[i][0], uvs[i][1]);
    }
    uvAttr.needsUpdate = true;
    return geo;
  }

  crossGeometry(def) {
    const { u0, v0, u1, v1 } = this.faceUV(def.faces[0]);
    const positions = [];
    const uvs = [];
    const quads = [
      [[0.1, 0, 0.1], [0.1, 1, 0.1], [0.9, 1, 0.9], [0.9, 0, 0.9]],
      [[0.9, 0, 0.1], [0.9, 1, 0.1], [0.1, 1, 0.9], [0.1, 0, 0.9]],
    ];
    const indices = [];
    quads.forEach((q, qi) => {
      q.forEach((p) => {
        positions.push(p[0] - 0.5, p[1] - 0.5, p[2] - 0.5);
        uvs.push(qi === 0 ? u0 : u1, p[1] === 1 ? v1 : v0);
      });
      const b = qi * 4;
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  // ---------- Чанки ----------
  rebuildChunk(world, chunk) {
    const key = chunkKey(chunk.cx, chunk.cz);
    const existing = this.chunkObjects.get(key);
    if (existing) this.disposeChunkObject(existing, chunk);

    const data = buildChunkGeometry(world, chunk, this.atlas);
    const group = new THREE.Group();
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    const add = (geometry, material, renderOrder = 0) => {
      if (!geometry) return;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(ox, 0, oz);
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = true;
      group.add(mesh);
    };

    add(data.solid, this.materials.solid);
    add(data.cutout, this.materials.cutout);
    add(data.emissive, this.materials.emissive);
    add(data.water, this.materials.water, 1);

    chunk.solidGeo = data.solid;
    chunk.cutoutGeo = data.cutout;
    chunk.waterGeo = data.water;
    chunk.emissiveGeo = data.emissive;
    chunk.dirty = false;

    this.scene.add(group);
    this.chunkObjects.set(key, group);
  }

  disposeChunkObject(group, chunk) {
    this.scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    if (chunk) disposeGeometry(chunk);
  }

  removeChunk(key, chunk) {
    const group = this.chunkObjects.get(key);
    if (group) {
      this.disposeChunkObject(group, chunk);
      this.chunkObjects.delete(key);
    }
  }

  // ---------- Кадр ----------
  updateEnvironment(dt, timeOfDay, playerPos, underwater) {
    // timeOfDay: 0..1 (0.25 = полдень)
    const sunAngle = (timeOfDay - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle) * 0.6, Math.sin(sunAngle), Math.cos(sunAngle) * 0.35).normalize();
    const height = clamp(sunDir.y, -1, 1);
    const dayFactor = clamp((height + 0.12) / 0.45, 0, 1);
    const nightFactor = 1 - dayFactor;

    this.skyUniforms.sunDir.value.copy(sunDir);
    this.skyUniforms.sunStrength.value = clamp(0.2 + dayFactor, 0, 1.2);
    this.skyUniforms.night.value = nightFactor;

    const dayTop = new THREE.Color(0x3f86dd);
    const dayBottom = new THREE.Color(0xcfe9ff);
    const duskTop = new THREE.Color(0x2d3f86);
    const duskBottom = new THREE.Color(0xff9a52);
    const nightTop = new THREE.Color(0x050a18);
    const nightBottom = new THREE.Color(0x101a33);

    const dusk = Math.max(0, 1 - Math.abs(height) * 2.6) * (height > -0.36 ? 1 : 0);
    const top = nightTop.clone().lerp(dayTop, dayFactor).lerp(duskTop, dusk * 0.9);
    const bottom = nightBottom.clone().lerp(dayBottom, dayFactor).lerp(duskBottom, dusk * 1.0);
    // на закате горизонт светлее, чем «ночной» — иначе сцена выглядит грязной
    const duskGlow = new THREE.Color(0xffb066);
    bottom.lerp(duskGlow, dusk * 0.6);

    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.bottomColor.value.copy(bottom);

    const fogColor = bottom.clone().lerp(top, 0.28 - dusk * 0.1);
    if (underwater) {
      fogColor.setHex(0x2a5fa8).lerp(new THREE.Color(0x1b3f78), 0.5);
    }
    this.scene.fog.color.copy(fogColor);
    this.renderer.setClearColor(fogColor);
    this.sky.position.set(playerPos.x, 0, playerPos.z);
    this.stars.position.set(playerPos.x, 0, playerPos.z);
    this.stars.material.opacity = clamp(nightFactor * 1.6 - 0.75, 0, 1);

    this.clouds.position.x = playerPos.x;
    this.clouds.position.z = playerPos.z;
    this.cloudOffset += dt * 0.0018;
    this.cloudTex.offset.x = this.cloudOffset;
    const duskTint = clamp(dusk * 1.15, 0, 1);
    this.cloudMaterial.opacity = 0.12 + dayFactor * 0.72;
    const cb = 0.24 + dayFactor * 0.76;
    this.cloudMaterial.color.setRGB(
      clamp(cb * (1 + duskTint * 0.55), 0, 1),
      clamp(cb * (1 - duskTint * 0.02), 0, 1),
      clamp(cb * (0.98 - duskTint * 0.42), 0, 1)
    );

    // Дневной свет мира (лунная ночь — чуть синеватая, но не чёрная)
    const brightness = 0.27 + dayFactor * 0.73;
    this.dayLight = brightness;
    const r = brightness * (0.88 + dayFactor * 0.12);
    const g = brightness * (0.9 + dayFactor * 0.1);
    const b = brightness * (0.92 + dayFactor * 0.13);
    this.materials.solid.color.setRGB(r, g, b);
    this.materials.cutout.color.setRGB(r, g, b);
    this.materials.water.color.setRGB(r * 0.9, g * 0.95, b);
    this.materials.emissive.color.setRGB(1, 1, 1);

    this.underwater = underwater;
  }

  updateParticles(dt) {
    const pos = this.particlePositions;
    const col = this.particleColors;
    const sizes = this.particleSizes;
    let count = 0;
    let any = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particleData[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.94;
      p.vz *= 0.94;
      const o = count * 3;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      const fade = clamp(p.life / (p.maxLife || 1), 0, 1);
      const dim = (0.35 + 0.65 * this.dayLight) * (0.4 + 0.6 * fade);
      col[o] = p.r * dim;
      col[o + 1] = p.g * dim;
      col[o + 2] = p.b * dim;
      sizes[count] = p.size;
      count++;
      any = true;
    }
    const geo = this.particles.geometry;
    geo.setDrawRange(0, count);
    if (any) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    }
  }

  updateHeld(dt, player) {
    if (!this.heldMesh && !this.heldArm) return;
    this.heldSwing += dt * 1;
    const moving = player.isMoving && player.onGround;
    const bobSpeed = player.sprinting ? 11 : 8;
    const bobAmount = moving ? (player.sprinting ? 0.05 : 0.03) : 0.008;
    const bob = Math.sin(performance.now() * 0.001 * bobSpeed) * bobAmount;
    const bobX = Math.cos(performance.now() * 0.0005 * bobSpeed) * bobAmount * 0.6;

    // Анимация удара
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt * 4.2);
    const swing = Math.sin((1 - this.swingTimer) * Math.PI) * (this.swingTimer > 0 ? 1 : 0);

    if (this.heldMesh) {
      this.heldMesh.position.set(0.52 + bobX - swing * 0.3, -0.3 + bob + swing * 0.24, 0.1 - swing * 0.3);
      this.heldMesh.rotation.set(0.18 + swing * 0.95, -0.7 + swing * 0.5, 0.12);
    }
    if (this.heldArm) {
      const armSwing = swing * 0.85;
      this.heldArm.position.set(0.7 + bobX * 1.4 - armSwing * 0.3, -0.76 + bob * 1.6 + armSwing * 0.34, -0.5 - armSwing * 0.36);
      this.heldArm.rotation.set(0.34 + armSwing * 0.6, -0.42 + armSwing * 0.3, 0.34 - armSwing * 0.2);
    }
  }

  swing() {
    this.swingTimer = 1;
  }

  renderHeld() {
    if (this.heldHidden) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // рука чуть больше блока — ей нужен отдельный проход
    const hasBlock = !!this.heldMesh;

    const vh = h * (hasBlock ? 0.52 : 0.56);
    const vy = h * 0.1;
    const vw = w * 0.4;
    const drawPass = (sizeW) => {
      this.renderer.setViewport(sizeW, vy, vw, vh);
      this.renderer.setScissor(sizeW, vy, vw, vh);
      this.renderer.setScissorTest(true);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.heldCamera.aspect = vw / vh;
      this.heldCamera.updateProjectionMatrix();
      this.renderer.render(this.heldScene, this.heldCamera);
    };

    this.renderer.autoClear = false;
    drawPass(w * 0.62);
    this.renderer.setScissorTest(false);
    this.renderer.autoClear = true;
    this.renderer.setViewport(0, 0, w, h);
    void drawPass;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.renderHeld();
  }

  setHighlight(hit, enabled = true) {
    if (!hit || !enabled) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const pulse = 0.35 + Math.sin(performance.now() * 0.006) * 0.15;
    this.highlight.material.opacity = pulse;
  }
}
