import * as THREE from 'three';
import { ID } from './blocks.js';
import { GRAVITY } from './config.js';
import { clamp } from './utils.js';

/** Материал «как в Minecraft»: плоские цвета, ламберт */
function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Модель Стива/зомби (используется и для игрока от 3-го лица) */
export function buildHumanoid({ skin = 0xc99a6b, shirt = 0x2e8b57, pants = 0x2b4a8b, isZombie = false } = {}) {
  const group = new THREE.Group();
  const skinMat = mat(isZombie ? 0x6a9c4a : skin);
  const shirtMat = mat(isZombie ? 0x3f7f6a : shirt);
  const pantsMat = mat(isZombie ? 0x3a3a5a : pants);

  const head = box(0.5, 0.5, 0.5, skinMat, 0, 0.62, 0);
  group.add(head);

  // глаза и волосы
  const eyeWhite = mat(0xffffff);
  const eyeDark = mat(0x2a2a3a);
  const leftEye = box(0.12, 0.1, 0.02, eyeWhite, -0.11, 0.66, 0.25);
  const rightEye = box(0.12, 0.1, 0.02, eyeWhite, 0.11, 0.66, 0.25);
  const lPupil = box(0.06, 0.08, 0.02, eyeDark, -0.11, 0.65, 0.26);
  const rPupil = box(0.06, 0.08, 0.02, eyeDark, 0.11, 0.65, 0.26);
  group.add(leftEye, rightEye, lPupil, rPupil);

  const hairMat = mat(isZombie ? 0x2a3a22 : 0x3a2a1a);
  const hair = box(0.52, 0.16, 0.52, hairMat, 0, 0.82, 0);
  group.add(hair);

  const body = box(0.5, 0.62, 0.28, shirtMat, 0, 0.12, 0);
  group.add(body);

  // руки с «шарниром» у плеча
  const armL = new THREE.Group();
  armL.position.set(-0.36, 0.36, 0);
  const armLMesh = box(0.18, 0.6, 0.18, skinMat, 0, -0.28, 0);
  armL.add(armLMesh);
  const armR = new THREE.Group();
  armR.position.set(0.36, 0.36, 0);
  const armRMesh = box(0.18, 0.6, 0.18, skinMat, 0, -0.28, 0);
  armR.add(armRMesh);
  group.add(armL, armR);

  const legL = new THREE.Group();
  legL.position.set(-0.12, -0.2, 0);
  legL.add(box(0.19, 0.62, 0.19, pantsMat, 0, -0.3, 0));
  const legR = new THREE.Group();
  legR.position.set(0.12, -0.2, 0);
  legR.add(box(0.19, 0.62, 0.19, pantsMat, 0, -0.3, 0));
  group.add(legL, legR);

  if (isZombie) {
    armL.rotation.x = -1.4;
    armR.rotation.x = -1.4;
  }

  return { group, armL, armR, legL, legR, head };
}

/** Четвероногое (свинья, овца, корова) */
export function buildQuadruped({ body, head, leg, scale = 1, hasHorns = false, wool = false }) {
  const group = new THREE.Group();
  const bodyMat = mat(body);
  const headMat = mat(head);
  const legMat = mat(leg);

  const torso = box(0.75, 0.62, 1.1, bodyMat, 0, 0.5, 0);
  group.add(torso);

  if (wool) {
    const woolMat = mat(0xf0f0e8);
    const fleece = box(0.86, 0.7, 1.2, woolMat, 0, 0.54, 0);
    group.add(fleece);
  }

  const headMesh = box(0.55, 0.55, 0.55, headMat, 0, 0.66, 0.72);
  group.add(headMesh);
  const snout = box(0.34, 0.26, 0.14, mat(0xd8a0a0), 0, 0.58, 1.02);
  group.add(snout);

  if (hasHorns) {
    const hornMat = mat(0xe8e0c0);
    group.add(box(0.1, 0.1, 0.18, hornMat, -0.2, 0.94, 0.66));
    group.add(box(0.1, 0.1, 0.18, hornMat, 0.2, 0.94, 0.66));
  }

  const legs = [];
  const legPositions = [
    [-0.26, 0.44],
    [0.26, 0.44],
    [-0.26, -0.42],
    [0.26, -0.42],
  ];
  for (const [x, z] of legPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.28, z);
    pivot.add(box(0.2, 0.4, 0.2, legMat, 0, -0.2, 0));
    group.add(pivot);
    legs.push(pivot);
  }

  group.scale.setScalar(scale);
  return { group, legs, head: headMesh };
}

/** Курица */
export function buildChicken() {
  const group = new THREE.Group();
  const white = mat(0xf2f2ee);
  const body = box(0.42, 0.42, 0.5, white, 0, 0.42, 0);
  group.add(body);
  const head = box(0.26, 0.3, 0.26, white, 0, 0.68, 0.2);
  group.add(head);
  const beak = box(0.12, 0.08, 0.14, mat(0xf0b030), 0, 0.64, 0.36);
  group.add(beak);
  const comb = box(0.1, 0.1, 0.18, mat(0xd04030), 0, 0.86, 0.18);
  group.add(comb);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.24, 0.5, 0);
    wing.add(box(0.06, 0.3, 0.36, mat(0xe2e2dc), 0, -0.1, 0));
    group.add(wing);
    wings.push(wing);
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.1, 0.22, 0);
    pivot.add(box(0.06, 0.22, 0.06, mat(0xf0b030), 0, -0.11, 0));
    group.add(pivot);
    legs.push(pivot);
  }
  return { group, legs, wings, head };
}

export const MOB_TYPES = {
  pig: {
    label: 'Свинья',
    health: 10,
    speed: 1.5,
    scale: 1,
    hitbox: { w: 0.9, h: 0.9 },
    build: () => buildQuadruped({ body: 0xe8a0a0, head: 0xf0b0b0, leg: 0xd89090 }),
    drops: [['wool_white', 1]],
    sound: 300,
  },
  cow: {
    label: 'Корова',
    health: 10,
    speed: 1.3,
    scale: 1.15,
    hitbox: { w: 1.1, h: 1.2 },
    build: () => buildQuadruped({ body: 0x4a3a2a, head: 0x5a4632, leg: 0x3a2c20, hasHorns: true }),
    drops: [['dirt', 2]],
    sound: 180,
  },
  sheep: {
    label: 'Овца',
    health: 8,
    speed: 1.4,
    scale: 1,
    hitbox: { w: 0.9, h: 1.0 },
    build: () => buildQuadruped({ body: 0xc8b8a0, head: 0xd8c8b0, leg: 0xb0a088, wool: true }),
    drops: [['wool_white', 2]],
    sound: 420,
  },
  chicken: {
    label: 'Курица',
    health: 4,
    speed: 2.0,
    scale: 1,
    hitbox: { w: 0.5, h: 0.6 },
    build: () => buildChicken(),
    drops: [['flower_yellow', 1]],
    sound: 700,
  },
  zombie: {
    label: 'Зомби',
    health: 20,
    speed: 2.1,
    scale: 1,
    hostile: true,
    hitbox: { w: 0.6, h: 1.8 },
    build: () => buildHumanoid({ isZombie: true }),
    drops: [['iron_ore', 1]],
    sound: 120,
  },
};

let mobIdCounter = 1;

export class Mob {
  constructor(type, x, y, z) {
    this.id = mobIdCounter++;
    this.typeName = type;
    this.def = MOB_TYPES[type];
    this.health = this.def.health;
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.onGround = false;
    this.wanderTimer = Math.random() * 3;
    this.moving = false;
    this.animTime = 0;
    this.hurtTimer = 0;
    this.attackCooldown = 0;
    this.dead = false;
    this.idleTimer = 0;

    const built = this.def.build();
    this.model = built.group;
    this.legs = built.legs || [];
    this.arms = [built.armL, built.armR].filter(Boolean);
    this.head = built.head;
    this.parts = built;
    this.model.position.copy(this.position);
    this.legSwing = 0;
    this.jumpCooldown = 0;
  }

  get halfWidth() {
    return this.def.hitbox.w / 2;
  }

  get height() {
    return this.def.hitbox.h;
  }

  update(dt, world, player, distanceToPlayer) {
    if (this.dead) return;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);

    const hostile = this.def.hostile;
    const dist = distanceToPlayer;

    if (hostile && dist < 18) {
      // Преследование
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      this.targetYaw = Math.atan2(dx, dz);
      this.moving = dist > 1.1;
      if (dist < 1.6 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.2;
        player.damage(3, 'зомби');
        return 'attack';
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 4;
        this.moving = Math.random() < 0.62;
        this.targetYaw = Math.random() * Math.PI * 2;
      }
    }

    // плавный поворот
    let diff = ((this.targetYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.yaw += diff * Math.min(1, dt * 6);

    const speed = this.moving ? this.def.speed : 0;
    const dirX = Math.sin(this.yaw);
    const dirZ = Math.cos(this.yaw);

    // не идём в блок / с обрыва
    if (this.moving && this.onGround) {
      const aheadX = Math.floor(this.position.x + dirX * 0.7);
      const aheadZ = Math.floor(this.position.z + dirZ * 0.7);
      const feetY = Math.floor(this.position.y + 0.1);
      if (world.isSolid(aheadX, feetY, aheadZ)) {
        if (!world.isSolid(aheadX, feetY + 1, aheadZ) && this.jumpCooldown <= 0) {
          this.velocity.y = 7.5;
          this.jumpCooldown = 1.2;
        } else {
          this.targetYaw += Math.PI * (0.5 + Math.random());
          this.moving = false;
        }
      }
    }

    this.velocity.x = dirX * speed;
    this.velocity.z = dirZ * speed;
    this.velocity.y -= GRAVITY * dt;

    // Коллизии по осям (простая AABB-проверка)
    const hw = this.halfWidth;
    const h = this.height;
    const collides = (px, py, pz) => {
      const minX = Math.floor(px - hw + 0.001);
      const maxX = Math.floor(px + hw - 0.001);
      const minY = Math.floor(py + 0.001);
      const maxY = Math.floor(py + h - 0.001);
      const minZ = Math.floor(pz - hw + 0.001);
      const maxZ = Math.floor(pz + hw - 0.001);
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          for (let x = minX; x <= maxX; x++) if (world.isSolid(x, y, z)) return true;
      return false;
    };

    const pos = this.position;
    if (this.velocity.x !== 0) {
      pos.x += this.velocity.x * dt;
      if (collides(pos.x, pos.y, pos.z)) {
        pos.x -= this.velocity.x * dt;
        this.velocity.x = 0;
      }
    }
    if (this.velocity.z !== 0) {
      pos.z += this.velocity.z * dt;
      if (collides(pos.x, pos.y, pos.z)) {
        pos.z -= this.velocity.z * dt;
        this.velocity.z = 0;
      }
    }

    this.onGround = false;
    if (this.velocity.y !== 0) {
      pos.y += this.velocity.y * dt;
      if (collides(pos.x, pos.y, pos.z)) {
        pos.y -= this.velocity.y * dt;
        if (this.velocity.y < 0) this.onGround = true;
        this.velocity.y = 0;
      }
    }

    // Утопание в воде — всплываем
    if (world.isLiquid(Math.floor(pos.x), Math.floor(pos.y + 0.3), Math.floor(pos.z))) {
      this.velocity.y = Math.min(this.velocity.y + 22 * dt, 2.2);
    }

    // Падение в пустоту
    if (pos.y < -6) {
      this.dead = true;
    }

    // Анимация
    const movingFast = Math.hypot(this.velocity.x, this.velocity.z) > 0.3;
    this.animTime += dt * (movingFast ? 7 : 1.4);
    this.model.position.copy(pos);
    this.model.rotation.y = this.yaw;

    if (this.legs.length) {
      this.legs.forEach((leg, i) => {
        const phase = i === 0 || i === 3 ? 0 : Math.PI;
        leg.rotation.x = movingFast ? Math.sin(this.animTime * 2 + phase) * 0.75 : 0;
      });
    }
    if (this.arms.length) {
      this.arms.forEach((arm, i) => {
        arm.rotation.x = movingFast ? Math.sin(this.animTime * 2 + i * Math.PI) * 0.7 : -1.35;
      });
    }
    if (this.parts.wings) {
      this.parts.wings.forEach((wing, i) => {
        wing.rotation.z = Math.sin(this.animTime * 3) * 0.5 * (i === 0 ? 1 : -1);
      });
    }
    if (this.head) {
      this.head.position.y = (this.head.userData.baseY ??= this.head.position.y) + (movingFast ? Math.sin(this.animTime * 2) * 0.02 : 0);
    }

    // Красная вспышка при уроне
    const flash = this.hurtTimer > 0;
    this.model.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.color) {
        if (!obj.userData.baseColor) obj.userData.baseColor = obj.material.color.clone();
        if (flash) obj.material.color.copy(obj.userData.baseColor).lerp(new THREE.Color(0xff3b30), 0.6);
        else obj.material.color.copy(obj.userData.baseColor);
      }
    });

    return null;
  }

  damage(amount) {
    this.health -= amount;
    this.hurtTimer = 0.28;
    // отбрасывание
    if (this.health <= 0) this.dead = true;
    return this.dead;
  }

  dispose() {
    this.model.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      }
    });
    if (this.model.parent) this.model.parent.remove(this.model);
  }
}

export class MobManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.mobs = [];
    this.maxMobs = 26;
    this.spawnTimer = 0;
  }

  spawnMob(typeName, x, y, z) {
    if (this.mobs.length >= this.maxMobs) return null;
    const mob = new Mob(typeName, x, y, z);
    this.scene.add(mob.model);
    this.mobs.push(mob);
    return mob;
  }

  /** Спавн в радиусе вокруг игрока на поверхности */
  trySpawn(player, isNight) {
    const types = ['pig', 'sheep', 'cow', 'chicken'];
    let type;
    if (isNight && Math.random() < 0.75) {
      type = 'zombie';
    } else {
      type = types[Math.floor(Math.random() * types.length)];
    }
    const angle = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 26;
    const x = Math.floor(player.position.x + Math.cos(angle) * dist);
    const z = Math.floor(player.position.z + Math.sin(angle) * dist);
    if (!this.world.isGenerated(x, z)) return null;

    const h = this.world.heightAt(x, z);
    if (h < 60) return null; // в воду не спавним
    const groundBlock = this.world.getBlock(x, h, z);
    if (groundBlock === ID.water || groundBlock === ID.ice) return null;
    if (this.world.isSolid(x, h + 1, z) || this.world.isSolid(x, h + 2, z)) return null;
    // не спавним вплотную к игроку
    if (Math.hypot(x - player.position.x, z - player.position.z) < 14) return null;

    return this.spawnMob(type, x + 0.5, h + 1.05, z + 0.5);
  }

  update(dt, player, isNight) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.2;
      if (this.mobs.length < this.maxMobs) this.trySpawn(player, isNight);
    }

    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dist = mob.position.distanceTo(player.position);
      if (dist > 90) {
        mob.dead = true;
        continue;
      }
      // мобы обновляются только вблизи
      if (dist < 70) {
        const result = mob.update(dt, this.world, player, dist);
        if (result === 'attack') {
          if (this.onPlayerAttacked) this.onPlayerAttacked(mob);
        }
      }
    }

    let removed = false;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (mob.dead) {
        if (mob.drops && this.onMobDeath) this.onMobDeath(mob);
        mob.dispose();
        this.mobs.splice(i, 1);
        removed = true;
      }
    }
    return removed;
  }

  /** Поиск моба по лучу взгляда (для атаки) */
  raycastMob(origin, direction, maxDistance = 4) {
    let best = null;
    let bestT = maxDistance;
    const ray = new THREE.Ray(origin, direction.clone().normalize());

    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const center = mob.position.clone();
      center.y += mob.height * 0.5;
      const half = new THREE.Vector3(
        mob.halfWidth + 0.15,
        mob.height * 0.5 + 0.1,
        mob.halfWidth + 0.15
      );
      const min = center.clone().sub(half);
      const max = center.clone().add(half);
      const box3 = new THREE.Box3(min, max);
      const hit = new THREE.Vector3();
      if (box3.containsPoint(origin)) {
        best = mob;
        bestT = 0;
        continue;
      }
      if (ray.intersectBox(box3, hit)) {
        const t = hit.distanceTo(origin);
        if (t < bestT) {
          bestT = t;
          best = mob;
        }
      }
    }
    return best ? { mob: best, distance: bestT } : null;
  }

  clear() {
    for (const mob of this.mobs) mob.dispose();
    this.mobs.length = 0;
  }

  /** Зомби горят на солнце, если над ними открытое небо */
  burnHostileInDaylight(dt, renderer) {
    for (const mob of this.mobs) {
      if (!mob.def.hostile || mob.dead) continue;
      const x = Math.floor(mob.position.x);
      const y = Math.floor(mob.position.y + mob.height * 0.8);
      const z = Math.floor(mob.position.z);
      if (this.world.getLight(x, y, z) < 14) continue;
      mob.burnTimer = (mob.burnTimer || 0) + dt;
      if (mob.burnTimer > 0.5) {
        mob.burnTimer = 0;
        mob.health -= 2;
        mob.hurtTimer = 0.2;
        if (renderer && Math.random() < 0.7) {
          renderer.spawnBurstParticle(
            mob.position.x, mob.position.y + mob.height * 0.6, mob.position.z,
            (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6,
            0xff8a3d
          );
        }
        if (mob.health <= 0) mob.dead = true;
      }
    }
  }

  clearHostile() {
    for (const mob of this.mobs) {
      if (mob.def.hostile) {
        mob.health = 0;
        mob.dead = true;
      }
    }
  }
}
