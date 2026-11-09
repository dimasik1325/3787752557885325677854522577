import * as THREE from 'three';
import {
  GRAVITY, JUMP_SPEED, WALK_SPEED, SPRINT_SPEED, FLY_SPEED, SWIM_SPEED,
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE, WORLD_HEIGHT,
} from './config.js';
import { clamp } from './utils.js';

const EPS = 1e-3;

export class Player {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3(0, 80, 0); // ноги
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.isMoving = false;
    this.health = 20;
    this.breath = 10;
    this.maxBreath = 10;
    this.fallStartY = this.position.y;
    this.stepDistance = 0;
    this.dead = false;
    this.bobTime = 0;
    this.viewMode = 0; // 0 — от первого лица, 1 — от третьего
    this.hurtTimer = 0;
    this.invulnerable = 0;
  }

  get eyePosition() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + (this.sneaking ? PLAYER_EYE - 0.18 : PLAYER_EYE),
      this.position.z
    );
  }

  get direction() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir;
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.fallStartY = y;
  }

  /** Проверка столкновения AABB с миром */
  collides(px, py, pz) {
    const half = PLAYER_WIDTH / 2;
    const minX = Math.floor(px - half + EPS);
    const maxX = Math.floor(px + half - EPS);
    const minY = Math.floor(py + EPS);
    const maxY = Math.floor(py + PLAYER_HEIGHT - EPS);
    const minZ = Math.floor(pz - half + EPS);
    const maxZ = Math.floor(pz + half - EPS);

    // Сканируем ровно по границам тела
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /** Есть ли твёрдая опора под ногами */
  isSupported() {
    const half = PLAYER_WIDTH / 2;
    const y = Math.floor(this.position.y - 0.08);
    const minX = Math.floor(this.position.x - half + EPS);
    const maxX = Math.floor(this.position.x + half - EPS);
    const minZ = Math.floor(this.position.z - half + EPS);
    const maxZ = Math.floor(this.position.z + half - EPS);
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.world.isSolid(x, y, z)) return true;
      }
    }
    return false;
  }


  /** Проверка, есть ли блок в точке (для воды) */
  blockAt(pos) {
    return this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
  }

  updateEnvironment() {
    const feet = this.position;
    const head = new THREE.Vector3(feet.x, feet.y + PLAYER_HEIGHT * 0.9, feet.z);
    this.inWater =
      this.world.isLiquid(Math.floor(feet.x), Math.floor(feet.y + 0.2), Math.floor(feet.z)) ||
      this.world.isLiquid(Math.floor(feet.x), Math.floor(feet.y + 0.9), Math.floor(feet.z));
    this.headInWater = this.world.isLiquid(Math.floor(head.x), Math.floor(head.y), Math.floor(head.z));
  }

  /**
   * Движение с поосевым разрешением коллизий.
   */
  moveWithCollisions(dx, dy, dz) {
    const pos = this.position;
    const half = PLAYER_WIDTH / 2;

    // X
    if (dx !== 0) {
      pos.x += dx;
      if (this.collides(pos.x, pos.y, pos.z)) {
        pos.x -= dx;
        // пытаемся «вползти» на 1 блок вверх
        if (this.onGround && !this.collides(pos.x + dx, pos.y + 0.6, pos.z) && dy <= 0.001) {
          const stepY = this.findStepHeight(pos.x + dx, pos.z);
          if (stepY > 0 && !this.collides(pos.x + dx, pos.y + stepY + EPS, pos.z)) {
            pos.y += stepY;
            pos.x += dx;
            this.onGround = true;
          }
        }
        this.velocity.x = 0;
      }
    }

    // Z
    if (dz !== 0) {
      pos.z += dz;
      if (this.collides(pos.x, pos.y, pos.z)) {
        pos.z -= dz;
        if (this.onGround && !this.collides(pos.x, pos.y + 0.6, pos.z + dz) && dy <= 0.001) {
          const stepY = this.findStepHeight(pos.x, pos.z + dz);
          if (stepY > 0 && !this.collides(pos.x, pos.y + stepY + EPS, pos.z + dz)) {
            pos.y += stepY;
            pos.z += dz;
            this.onGround = true;
          }
        }
        this.velocity.z = 0;
      }
    }

    // Y
    if (dy !== 0) {
      const prevY = pos.y;
      const attemptedY = prevY + dy;
      pos.y = attemptedY;
      if (this.collides(pos.x, pos.y, pos.z)) {
        pos.y = prevY;
        if (dy < 0) {
          // прижимаем ноги точно к поверхности блока, чтобы не «висеть» в воздухе
          const snapY = Math.floor(attemptedY) + 1;
          if (snapY <= prevY + EPS) pos.y = snapY;
          this.onGround = true;
          this.handleLanding();
        }
        this.velocity.y = 0;
      } else if (dy < 0) {
        this.onGround = false;
      }
      if (dy > 0) this.onGround = false;
    }

    // Твёрдая опора под ногами
    if (!this.onGround && this.velocity.y <= 0 && this.isSupported()) {
      this.onGround = true;
      this.handleLanding();
      this.velocity.y = 0;
    }
    void half;
  }

  findStepHeight(px, pz) {
    for (const h of [0.6, 1.0]) {
      if (!this.collides(px, this.position.y + h + EPS, pz)) return h;
    }
    return 0;
  }

  handleLanding() {
    const fallDist = this.fallStartY - this.position.y;
    if (fallDist > 3.2 && !this.inWater && !this.flying) {
      const damage = Math.floor(fallDist - 3);
      if (damage > 0) this.damage(damage, 'падение');
    }
    this.fallStartY = this.position.y;
  }

  damage(amount, cause = '') {
    if (this.invulnerable > 0 || this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0.45;
    this.invulnerable = 0.5;
    this.lastCause = cause;
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = Math.min(20, this.health + amount);
    if (this.health > 0) this.dead = false;
  }

  respawn(world) {
    const spawn = findSpawn(world, Math.floor(this.position.x), Math.floor(this.position.z));
    this.setPosition(spawn.x, spawn.y, spawn.z);
    this.health = 20;
    this.breath = this.maxBreath;
    this.dead = false;
    this.hurtTimer = 0;
    this.invulnerable = 1;
    this.fallStartY = spawn.y;
  }

  update(dt, input, camera) {
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.updateEnvironment();

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let wishX = 0;
    let wishZ = 0;
    if (input.forward) {
      wishX += forward.x;
      wishZ += forward.z;
    }
    if (input.back) {
      wishX -= forward.x;
      wishZ -= forward.z;
    }
    if (input.left) {
      wishX -= right.x;
      wishZ -= right.z;
    }
    if (input.right) {
      wishX += right.x;
      wishZ += right.z;
    }
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    this.isMoving = wishLen > 0;

    this.sneaking = !!input.sneak && !this.flying && this.onGround;
    this.sprinting = !!input.sprint && this.isMoving && !this.sneaking;

    let speed;
    if (this.flying) speed = FLY_SPEED * (this.sprinting ? 1.7 : 1);
    else if (this.inWater) speed = SWIM_SPEED * (this.sprinting ? 1.35 : 1);
    else speed = (this.sprinting ? SPRINT_SPEED : WALK_SPEED) * (this.sneaking ? 0.35 : 1);

    const accel = this.flying ? 8 : this.onGround || this.inWater ? 14 : 4.5;
    const targetVX = wishX * speed;
    const targetVZ = wishZ * speed;

    this.velocity.x += (targetVX - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (targetVZ - this.velocity.z) * Math.min(1, accel * dt);
    if (this.isMoving === false) {
      const friction = this.onGround ? 12 : 2.2;
      this.velocity.x -= this.velocity.x * Math.min(1, friction * dt);
      this.velocity.z -= this.velocity.z * Math.min(1, friction * dt);
    }

    // Вертикальная физика
    if (this.flying) {
      let vy = 0;
      if (input.jump) vy = FLY_SPEED * (this.sprinting ? 1.7 : 1);
      if (input.sneak) vy = -FLY_SPEED * 0.8;
      this.velocity.y += (vy - this.velocity.y) * Math.min(1, 10 * dt);
    } else if (this.inWater) {
      this.velocity.y -= GRAVITY * 0.18 * dt;
      this.velocity.y = Math.max(this.velocity.y, -3.2);
      if (input.jump) {
        this.velocity.y = Math.min(this.velocity.y + 26 * dt, 3.4);
      }
      // Держимся на поверхности, если не ныряем
      if (!input.sneak && this.headInWater && this.velocity.y < 0.2) {
        this.velocity.y += 12 * dt;
      }
    } else {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -55) this.velocity.y = -55;
      if (input.jump && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
        this.fallStartY = this.position.y;
      }
    }

    // Трение земли и защита от «скольжения»
    if (this.onGround) {
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    const prevY = this.position.y;
    this.moveWithCollisions(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);

    // Отслеживание начала падения
    if (!this.onGround && !this.flying && !this.inWater && this.position.y > prevY && this.velocity.y > 0) {
      this.fallStartY = Math.max(this.fallStartY, this.position.y);
    }
    if (this.onGround && !this.inWater && !this.flying) {
      this.fallStartY = this.position.y;
    }

    // Вода: дыхание
    if (this.headInWater) {
      this.breath -= dt / 1.0;
      if (this.breath <= 0) {
        this.breath = 0;
        this.damage(1 * dt * 4, 'утонул');
      }
    } else {
      this.breath = Math.min(this.maxBreath, this.breath + dt * 4);
    }

    // Голод/регенерация — по-простому
    if (this.health < 20 && !this.dead) {
      this.regenTimer = (this.regenTimer || 0) + dt;
      if (this.regenTimer > 6) {
        this.regenTimer = 0;
        this.heal(1);
      }
    }

    // Камера
    this.bobTime += dt * (this.isMoving && this.onGround ? (this.sprinting ? 11 : 8) : 0);
    this.updateCamera(camera);
  }

  updateCamera(camera) {
    const eye = this.eyePosition;
    if (this.viewMode === 0) {
      const bobAmount = this.isMoving && this.onGround ? (this.sprinting ? 0.05 : 0.03) : 0;
      const bobY = Math.abs(Math.sin(this.bobTime)) * bobAmount;
      const bobX = Math.sin(this.bobTime * 0.5) * bobAmount * 0.6;
      camera.position.set(eye.x + bobX, eye.y + bobY, eye.z);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      const dir = this.direction;
      const dist = 3.6;
      const target = eye.clone().addScaledVector(dir, -dist);
      // не залезаем в блоки
      const hit = this.world.raycast(eye, dir.clone().negate(), dist);
      if (hit) {
        target.copy(eye).addScaledVector(dir, -Math.max(0.4, hit.distance - 0.35));
      }
      camera.position.copy(target);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
  }
}

/** Ищет безопасное место для спавна */
export function findSpawn(world, x = 0, z = 0) {
  // если чанк ещё не сгенерирован — используем генератор напрямую
  for (let r = 0; r < 24; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const px = x + dx;
        const pz = z + dz;
        const info = world.generator.columnInfo(px, pz);
        if (info.height <= 0) continue;
        if (info.height < 63) continue;
        const ok = world.isGenerated(px, pz)
          ? world.getBlock(px, info.height + 1, pz) === 0
          : true;
        if (!ok) continue;
        return new THREE.Vector3(px + 0.5, info.height + 1.2, pz + 0.5);
      }
    }
  }
  return new THREE.Vector3(0, WORLD_HEIGHT * 0.6, 0);
}
