import * as THREE from 'three';
import {
  getBiomeForStation,
  getStationInfo,
} from '../games/next-stop/routes';
import {
  TRAIN_SPECS,
  type GameEdition,
  type RarityTier,
} from '../games/next-stop/types';
import type { PlayerProfile } from '../types/arcade';
import { scenePaletteFor, THEME } from '../theme';
import {
  buildCharacterModel,
  buildCottageProp,
  buildIntermediatePlatformProp,
  buildStationSignboard,
  buildTrainModel,
  buildTreeProp,
  type BuiltTrain,
  type CharacterRig,
} from './models';
import {
  createN64Material,
  createN64Renderer,
  createPixelCanvasTexture,
  createCrispSignTexture,
  createSoftwareFramePacer,
  PalettePass,
  BACKGROUND_LAYER,
  detectSoftwareGl,
  resizeN64Renderer,
  setupStudioEnvironment,
} from './n64Materials';

export type SideSceneMode =
  | 'platform_idle'
  | 'train_arriving'
  | 'journey_ride'
  | 'station_arriving';

export interface NextStopSceneCallbacks {
  onBoarded?: () => void;
  onStationTick?: (stationFloat: number, passedIntegerStations: number) => void;
  onArrivalComplete?: () => void;
}

interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  scale: number;
  color: THREE.Color;
}

interface SceneryItem {
  group: THREE.Object3D;
  x: number;
  speedFactor: number;
  span: number;
}

interface SkippedPlatformItem {
  group: THREE.Group;
  stationNumber: number;
  passedSoundFired: boolean;
}

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

// Fixed sunny-countryside look for every station, in the game's charcoal / amber / cream palette.
const SUNNY = {
  sky: '#8cc8f0',
  fog: '#cfe6f5',
  ground: '#6aae4f',
};

/** Smooth hash-free pseudo noise that repeats every `period` units along x. */
function periodicHeight(x: number, z: number, period: number, seed: number): number {
  const k = (2 * Math.PI) / period;
  return (
    Math.sin(k * x + seed) * 0.5 +
    Math.sin(2 * k * x + seed * 1.7 + z * 0.15) * 0.3 +
    Math.sin(3 * k * x + seed * 0.6 - z * 0.22) * 0.18 +
    Math.sin(5 * k * x + seed * 2.3 + z * 0.4) * 0.08
  );
}

type RegionId = 'countryside' | 'desert' | 'mountains' | 'city';

/** Sky haze, ground and light colours for each region of the line. */
const REGION_LOOKS: Record<RegionId, {
  fog: string; fogNear: number; fogFar: number;
  ground: string; nearGround: string;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  sun: string; sunIntensity: number;
}> = {
  countryside: { fog: '#cfe6f5', fogNear: 40, fogFar: 230, ground: '#6aae4f', nearGround: '#6fae52', hemiSky: '#e4f3ff', hemiGround: '#7a9a55', hemiIntensity: 1.3, sun: '#fff3d6', sunIntensity: 1.75 },
  desert: { fog: '#f6b073', fogNear: 45, fogFar: 240, ground: '#d99a55', nearGround: '#e3aa66', hemiSky: '#ffd6a8', hemiGround: '#a8642e', hemiIntensity: 1.25, sun: '#ffb36b', sunIntensity: 1.7 },
  mountains: { fog: '#d6e8f7', fogNear: 45, fogFar: 260, ground: '#3e7a3e', nearGround: '#4f8f45', hemiSky: '#e6f2ff', hemiGround: '#4a6b3a', hemiIntensity: 1.3, sun: '#fff8e8', sunIntensity: 1.8 },
  city: { fog: '#7a4f86', fogNear: 40, fogFar: 230, ground: '#4a4458', nearGround: '#5a5566', hemiSky: '#ffb38a', hemiGround: '#3a2f55', hemiIntensity: 1.15, sun: '#ff9e7a', sunIntensity: 1.5 },
};

function regionForBiome(id: string): RegionId {
  return id === 'desert' || id === 'mountains' || id === 'city' ? id : 'countryside';
}

function toBackground(obj: THREE.Object3D) {
  obj.traverse((o) => o.layers.set(BACKGROUND_LAYER));
}

export class NextStopSceneController {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private pacer: ReturnType<typeof createSoftwareFramePacer>;
  private palettePass: PalettePass;
  private onVisibility = () => {
    // Throw away the long frame gap after the tab comes back.
    this.clock.getDelta();
  };
  private resizeObserver: ResizeObserver;
  private mountEl: HTMLElement;
  private callbacksRef: { current: NextStopSceneCallbacks };

  private edition: GameEdition;
  private profile: PlayerProfile;
  private characterRig: CharacterRig;
  private groundMesh!: THREE.Mesh;

  // Platform & track props
  private homePlatformGroup: THREE.Group;
  private arrivalPlatformGroup: THREE.Group;
  private signHolder: THREE.Group;
  private arrivalSignHolder: THREE.Group;
  private sleepers: THREE.Mesh[] = [];
  private sceneryItems: SceneryItem[] = [];
  private birds: { group: THREE.Object3D; wingL: THREE.Object3D; wingR: THREE.Object3D; phase: number; vx: number; baseY: number }[] = [];
  private waterfallTextures: THREE.Texture[] = [];
  private regionGroups = {} as Record<RegionId, THREE.Group>;
  private region: RegionId = 'countryside';
  private buildTarget!: THREE.Object3D;
  private nearGround!: THREE.Mesh;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private showcaseRegionIdx = 0;
  private showcase = false;
  private showcaseX = -26;
  private showcaseTierIdx = 0;
  private skippedPlatforms: SkippedPlatformItem[] = [];

  // Active train
  private trainWrapper: THREE.Group;
  private activeTrain: BuiltTrain | null = null;

  // State machine
  private mode: SideSceneMode = 'platform_idle';
  private activeTier: RarityTier = 'COMMON';
  private loopStations: boolean = false;
  private startStationIdx: number = 0;
  private targetStationsToSkip: number = 0;
  private phaseTimer = 0;
  private arriveDuration = 1.9;
  private rideProgress = 0;
  private rideDuration = 3.6;
  private stationArriveProgress = 0;
  private lastStationInteger = 0;
  private lastTickEmit = 0;

  // Particles
  private particleMesh!: THREE.InstancedMesh;
  private particles: ParticleItem[] = [];
  private particleCursor = 0;
  private smokeTimer = 0;
  private trauma = 0;

  private skyColor = new THREE.Color(SUNNY.sky);
  private fogColor = new THREE.Color(SUNNY.fog);
  private clock = new THREE.Clock();
  private disposed = false;

  constructor(
    mountEl: HTMLElement,
    profile: PlayerProfile,
    edition: GameEdition,
    initialStation: number,
    callbacks: NextStopSceneCallbacks,
  ) {
    this.mountEl = mountEl;
    this.profile = profile;
    this.edition = edition;
    this.startStationIdx = initialStation;
    this.callbacksRef = { current: callbacks };

    this.isSoftwareGl = detectSoftwareGl();
    this.renderer = createN64Renderer(mountEl, this.isSoftwareGl);
    this.palettePass = new PalettePass(this.renderer, scenePaletteFor(edition));
    document.addEventListener('visibilitychange', this.onVisibility);

    this.scene = new THREE.Scene();
    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(this.fogColor, 40, 230);
    setupStudioEnvironment(this.renderer, this.scene);

    const w = Math.max(1, mountEl.clientWidth);
    const h = Math.max(1, mountEl.clientHeight);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.2, 170);
    this.camera.position.set(0, 2.9, 12.2);
    this.camera.lookAt(0, 1.55, 0);

    const hemi = new THREE.HemisphereLight('#e4f3ff', '#7a9a55', 1.3);
    hemi.layers.enableAll();
    this.hemiLight = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3d6', 1.75);
    sun.position.set(9, 18, 12);
    sun.layers.enableAll();
    this.sunLight = sun;
    this.scene.add(sun);

    this.homePlatformGroup = new THREE.Group();
    this.arrivalPlatformGroup = new THREE.Group();
    this.signHolder = new THREE.Group();
    this.arrivalSignHolder = new THREE.Group();
    this.trainWrapper = new THREE.Group();
    this.scene.add(
      this.homePlatformGroup,
      this.arrivalPlatformGroup,
      this.trainWrapper,
    );

    this.buildSideWorld();
    this.initParticlePool();

    this.characterRig = buildCharacterModel(profile, true);
    this.scene.add(this.characterRig.root);

    this.resetToPlatform(initialStation, edition);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(mountEl);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.pacer = createSoftwareFramePacer(this.renderer, this.isSoftwareGl);
    this.tick();
  }

  private buildSideWorld() {
    // Far ground (background layer) and near ground in front of the track (foreground).
    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 60),
      createN64Material({ color: SUNNY.ground, roughness: 0.92 }),
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(0, -0.02, -33);
    toBackground(this.groundMesh);
    this.scene.add(this.groundMesh);

    const nearGround = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 20),
      createN64Material({ color: '#6fae52', roughness: 0.92 }),
    );
    nearGround.rotation.x = -Math.PI / 2;
    nearGround.position.set(0, -0.02, 7);
    this.nearGround = nearGround;
    this.scene.add(nearGround);

    // Each region of the line has its own sky, terrain and props.
    const regions: Array<[RegionId, () => void]> = [
      ['countryside', () => { this.buildSunnySky(); this.buildCountryside(); this.buildWildlife(); }],
      ['desert', () => this.buildDesert()],
      ['mountains', () => this.buildMountains()],
      ['city', () => this.buildCity()],
    ];
    for (const [id, build] of regions) {
      const group = new THREE.Group();
      group.visible = id === 'countryside';
      this.buildTarget = group;
      build();
      this.regionGroups[id] = group;
      this.scene.add(group);
    }

    // Track ballast & continuous steel rails running along X (left <-> right)
    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(110, 0.16, 2.9),
      createN64Material({ color: '#5a5048', roughness: 0.95 }),
    );
    ballast.position.set(0, 0.04, -1.6);
    this.scene.add(ballast);

    const railMat = createN64Material({
      color: '#cbd5e1',
      roughness: 0.3,
      metalness: 0.8,
    });
    const frontRail = new THREE.Mesh(new THREE.BoxGeometry(110, 0.12, 0.14), railMat);
    frontRail.position.set(0, 0.15, -0.78);
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(110, 0.12, 0.14), railMat);
    backRail.position.set(0, 0.15, -2.42);
    this.scene.add(frontRail, backRail);

    // Pooled railway sleepers scrolling along X
    const sleeperGeo = new THREE.BoxGeometry(0.32, 0.08, 2.4);
    const sleeperMat = createN64Material({ color: '#5c3c24', roughness: 0.92 });
    for (let i = 0; i < 42; i++) {
      const s = new THREE.Mesh(sleeperGeo, sleeperMat);
      s.position.set(-42 + i * 2.0, 0.11, -1.6);
      this.scene.add(s);
      this.sleepers.push(s);
    }

    // Foreground home platform deck (y = 0..0.34, z = 0..3.6)
    const buildPlatformDeck = (holder: THREE.Group, signTarget: THREE.Group) => {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.36, 3.6),
        createN64Material({ color: '#8a8a94', roughness: 0.88 }),
      );
      slab.position.set(0, 0.16, 1.8);
      const yellowLine = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.04, 0.24),
        createN64Material({ color: '#facc15', roughness: 0.5 }),
      );
      yellowLine.position.set(0, 0.35, 0.14);
      const lampPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 3.2, 0.16),
        createN64Material({ color: '#1e293b', roughness: 0.7 }),
      );
      lampPost.position.set(4.1, 1.7, 0.55);
      const lampGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.26, 0.35),
        createN64Material({
          color: '#fef08a',
          emissive: '#facc15',
          emissiveIntensity: 0.7,
          roughness: 0.2,
        }),
      );
      lampGlow.position.set(4.1, 3.3, 0.55);

      signTarget.position.set(-3.55, 0.34, 0.55);
      holder.add(slab, yellowLine, lampPost, lampGlow, signTarget);
    };

    buildPlatformDeck(this.homePlatformGroup, this.signHolder);
    buildPlatformDeck(this.arrivalPlatformGroup, this.arrivalSignHolder);
    this.arrivalPlatformGroup.visible = false;
  }

  private buildSunnySky() {
    // The visible band of this texture is roughly 0.4–0.6 of its height.
    const tex = createCrispSignTexture(1024, 1024, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1d5fb0');
      grad.addColorStop(0.4, '#3d8fdc');
      grad.addColorStop(0.52, '#74b9ef');
      grad.addColorStop(0.6, '#bfe3f8');
      grad.addColorStop(1, '#d8eefb');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const sx = w * 0.62;
      const sy = h * 0.465;
      const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 90);
      glow.addColorStop(0, 'rgba(255, 244, 190, 0.95)');
      glow.addColorStop(1, 'rgba(255, 244, 190, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 90, sy - 90, 180, 180);
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath();
      ctx.arc(sx, sy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.fill();

      const cloud = (cx: number, cy: number, k: number) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 46 * k, 11 * k, 0, 0, Math.PI * 2);
        ctx.arc(cx - 20 * k, cy - 7 * k, 14 * k, 0, Math.PI * 2);
        ctx.arc(cx + 4 * k, cy - 14 * k, 19 * k, 0, Math.PI * 2);
        ctx.arc(cx + 26 * k, cy - 6 * k, 13 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#dcecf8';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 5 * k, 42 * k, 5 * k, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      cloud(w * 0.3, h * 0.47, 1.0);
      cloud(w * 0.42, h * 0.53, 0.7);
      cloud(w * 0.5, h * 0.44, 0.9);
      cloud(w * 0.75, h * 0.5, 0.8);
      cloud(w * 0.2, h * 0.53, 0.6);
      cloud(w * 0.88, h * 0.45, 1.1);
    });
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 200),
      new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: false }),
    );
    sky.position.set(0, 20, -125);
    sky.renderOrder = -1;
    toBackground(sky);
    this.buildTarget.add(sky);
  }

  /** A low-poly heightfield strip that tiles seamlessly along x. */
  private buildTerrainTile(opts: {
    width: number;
    zNear: number;
    zFar: number;
    maxHeight: number;
    seed: number;
    colorAt: (t: number, h: number) => THREE.Color;
  }): { mesh: THREE.Mesh; heightAt: (lx: number, z: number) => number } {
    const { width, zNear, zFar, maxHeight, seed, colorAt } = opts;
    const depth = zNear - zFar;
    const segX = 48;
    const segZ = 12;
    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const zMid = (zNear + zFar) / 2;
    const heightAt = (lx: number, z: number) => {
      const t = THREE.MathUtils.clamp((zNear - z) / depth, 0, 1);
      const ramp = THREE.MathUtils.smoothstep(t, 0, 0.55);
      const n = periodicHeight(lx, z, width, seed) * 0.5 + 0.55;
      return Math.max(0, n * maxHeight * ramp * (0.6 + 0.4 * t));
    };
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const z = pos.getZ(i) + zMid;
      pos.setY(i, heightAt(lx, z));
    }
    const nonIndexed = geo.toNonIndexed();
    const p2 = nonIndexed.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p2.count * 3);
    for (let i = 0; i < p2.count; i += 3) {
      // One colour per triangle for a faceted, painterly look
      const hAvg = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
      const zAvg = (p2.getZ(i) + p2.getZ(i + 1) + p2.getZ(i + 2)) / 3 + zMid;
      const t = THREE.MathUtils.clamp((zNear - zAvg) / depth, 0, 1);
      const c = colorAt(t, hAvg / maxHeight);
      const jitter = 0.94 + (((i * 7919) % 13) / 13) * 0.12;
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = c.r * jitter;
        colors[(i + k) * 3 + 1] = c.g * jitter;
        colors[(i + k) * 3 + 2] = c.b * jitter;
      }
    }
    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    nonIndexed.computeVertexNormals();
    const mesh = new THREE.Mesh(
      nonIndexed,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    mesh.position.z = zMid;
    return { mesh, heightAt };
  }

  private buildWaterfall(height: number): THREE.Group {
    const g = new THREE.Group();
    const tex = createPixelCanvasTexture(
      8,
      16,
      (ctx) => {
        ctx.fillStyle = '#7cc4f0';
        ctx.fillRect(0, 0, 8, 16);
        ctx.fillStyle = '#e8f7ff';
        for (const [x, y, h] of [[1, 0, 5], [4, 6, 6], [6, 2, 4], [2, 10, 5], [5, 13, 3]]) ctx.fillRect(x, y, 1, h);
      },
      1,
      Math.max(1, Math.round(height / 2)),
    );
    tex.magFilter = THREE.NearestFilter;
    this.waterfallTextures.push(tex);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, height),
      new THREE.MeshBasicMaterial({ map: tex, fog: true }),
    );
    water.position.y = height / 2;
    const rockMat = createN64Material({ color: '#8c8f94', roughness: 0.95, wobbleGrid: 0 });
    const face = new THREE.Mesh(new THREE.BoxGeometry(6.5, height, 3), createN64Material({ color: '#7d8188', roughness: 0.95, wobbleGrid: 0 }));
    face.position.set(0, height / 2, -1.7);
    g.add(face);
    const cliffL = new THREE.Mesh(new THREE.BoxGeometry(1.6, height + 0.6, 1.4), rockMat);
    cliffL.position.set(-1.9, (height + 0.6) / 2, -0.5);
    const cliffR = new THREE.Mesh(new THREE.BoxGeometry(1.8, height + 1.2, 1.4), createN64Material({ color: '#a3a6ab', roughness: 0.95, wobbleGrid: 0 }));
    cliffR.position.set(2.0, (height + 1.2) / 2, -0.5);
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 0.12, 12),
      new THREE.MeshBasicMaterial({ color: '#9ad6f7' }),
    );
    pool.scale.z = 0.5;
    pool.position.set(0, 0.06, 0.6);
    const foam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.16, 10),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    foam.scale.z = 0.5;
    foam.position.set(0, 0.1, 0.4);
    g.add(cliffL, cliffR, water, pool, foam);
    return g;
  }

  private buildCountryside() {
    // Rolling green hills, then snow-capped mountains behind them.
    const W = 120;
    const green = new THREE.Color('#79c25a');
    const deepGreen = new THREE.Color('#3f8f3c');
    const rock = new THREE.Color('#7d8594');
    const snow = new THREE.Color('#f7fbff');
    const hillLayers = [
      {
        zNear: -22, zFar: -50, maxHeight: 9, seed: 1.3, speed: 0.34,
        colorAt: (t: number, h: number) => green.clone().lerp(deepGreen, Math.min(1, h * 0.8 + t * 0.2)),
      },
      {
        zNear: -50, zFar: -95, maxHeight: 30, seed: 4.1, speed: 0.16,
        colorAt: (_t: number, h: number) =>
          h > 0.62 ? snow.clone() : h > 0.4 ? rock.clone().lerp(snow, (h - 0.4) * 0.8) : deepGreen.clone().lerp(rock, h * 2.2),
      },
    ];
    hillLayers.forEach((layer, li) => {
      for (let k = 0; k < 2; k++) {
        const { mesh, heightAt } = this.buildTerrainTile({ width: W, ...layer });
        const tile = new THREE.Group();
        tile.add(mesh);
        if (li === 0 && k === 0) {
          // A waterfall tumbling off the hillside on each tile
          // Seat it on the tallest part of this tile's hillside, falling to the valley floor.
          const lz = -38;
          let lx = 0;
          let top = 0;
          for (let x = -50; x <= 50; x += 2) {
            const h = heightAt(x, lz);
            if (h > top) { top = h; lx = x; }
          }
          const fall = this.buildWaterfall(Math.max(4, top + 0.4));
          fall.position.set(lx, -0.1, lz + 3.2);
          tile.add(fall);
        }
        const x = -W / 2 + k * W;
        tile.position.x = x;
        toBackground(tile);
        this.buildTarget.add(tile);
        this.sceneryItems.push({ group: tile, x, speedFactor: layer.speed, span: W * 2 });
      }
    });

    // Patchwork fields: ripe amber crops and pale stubble, edged with dark hedgerows
    const fieldTex = (a: string, b: string) =>
      createPixelCanvasTexture(
        8,
        8,
        (ctx) => {
          ctx.fillStyle = a;
          ctx.fillRect(0, 0, 8, 8);
          ctx.fillStyle = b;
          ctx.fillRect(0, 0, 8, 2);
          ctx.fillRect(0, 4, 8, 2);
        },
        1,
        5,
      );
    const fieldMats = [
      createN64Material({ color: 0xffffff, map: fieldTex('#f5d33a', '#e0b81e') }),
      createN64Material({ color: 0xffffff, map: fieldTex('#8ad468', '#6fbb50') }),
      createN64Material({ color: 0xffffff, map: fieldTex('#e2b65a', '#c9963e') }),
      createN64Material({ color: 0xffffff, map: fieldTex('#8a5a3b', '#6f4529') }),
    ];
    const hedgeMat = createN64Material({ color: '#2e6b2e', roughness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const x = -48 + i * 8.4;
      const z = -11 - (i % 3) * 5;
      const g = new THREE.Group();
      const field = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 4.6), fieldMats[(i * 7) % 4]);
      field.rotation.x = -Math.PI / 2;
      field.position.y = 0.01 + (i % 3) * 0.002;
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.45, 0.35), hedgeMat);
      hedge.position.set(0, 0.22, 2.3);
      g.add(field, hedge);
      g.position.set(x, 0, z);
      toBackground(g);
      this.buildTarget.add(g);
      this.sceneryItems.push({ group: g, x, speedFactor: 0.6, span: 100.8 });
    }

    // Trees and the odd cottage between the fields
    for (let i = 0; i < 16; i++) {
      const isCottage = i % 5 === 0;
      const obj = isCottage ? buildCottageProp() : this.buildColourfulTree(i);
      const x = -46 + i * 6;
      const z = -6.5 - (i % 4) * 4.2;
      obj.position.set(x, 0, z);
      obj.scale.setScalar(0.85 + (i % 3) * 0.22);
      toBackground(obj);
      this.buildTarget.add(obj);
      this.sceneryItems.push({ group: obj, x, speedFactor: 0.82, span: 96 });
    }
  }

  /** A painted sky backdrop: gradient bands, a sun and clouds (visible band ≈ 0.4–0.6). */
  private buildSkyPlane(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const tex = createCrispSignTexture(1024, 1024, paint);
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 200),
      new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: false }),
    );
    sky.position.set(0, 20, -125);
    sky.renderOrder = -1;
    toBackground(sky);
    this.buildTarget.add(sky);
  }

  /** Two terrain tiles that scroll and wrap seamlessly. */
  private addTerrainLayer(layer: {
    zNear: number; zFar: number; maxHeight: number; seed: number; speed: number;
    colorAt: (t: number, h: number) => THREE.Color;
  }) {
    const W = 120;
    for (let k = 0; k < 2; k++) {
      const { mesh } = this.buildTerrainTile({ width: W, ...layer });
      const tile = new THREE.Group();
      tile.add(mesh);
      const x = -W / 2 + k * W;
      tile.position.x = x;
      toBackground(tile);
      this.buildTarget.add(tile);
      this.sceneryItems.push({ group: tile, x, speedFactor: layer.speed, span: W * 2 });
    }
  }

  /** Scatter props along the line so they scroll past and wrap. */
  private scatter(count: number, span: number, speed: number, zMin: number, zMax: number, make: (i: number) => THREE.Object3D) {
    for (let i = 0; i < count; i++) {
      const obj = make(i);
      const x = -span / 2 + (i + 0.5) * (span / count) + Math.sin(i * 12.9898) * 1.5;
      const z = zMin + ((Math.sin(i * 78.233) + 1) / 2) * (zMax - zMin);
      obj.position.set(x, obj.position.y, z);
      toBackground(obj);
      this.buildTarget.add(obj);
      this.sceneryItems.push({ group: obj, x, speedFactor: speed, span });
    }
  }

  // ── Region 2: the desert at sunset ──
  private buildDesert() {
    this.buildSkyPlane((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5c1a1b');
      g.addColorStop(0.38, '#b8361b');
      g.addColorStop(0.47, '#f0612a');
      g.addColorStop(0.55, '#ff9a4a');
      g.addColorStop(0.61, '#ffc98a');
      g.addColorStop(1, '#ffe0b5');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const sx = w * 0.42, sy = h * 0.565;
      const glow = ctx.createRadialGradient(sx, sy, 20, sx, sy, 130);
      glow.addColorStop(0, 'rgba(255,236,200,0.9)');
      glow.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 130, sy - 130, 260, 260);
      ctx.fillStyle = '#fff4d6';
      ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8562a';
      for (const [cx, cy, rx] of [[0.2, 0.45, 70], [0.6, 0.47, 90], [0.82, 0.44, 60], [0.35, 0.5, 50], [0.7, 0.52, 45]]) {
        ctx.beginPath(); ctx.ellipse(w * cx, h * cy, rx, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#c23b22';
      for (const [cx, cy, rx] of [[0.24, 0.455, 50], [0.64, 0.475, 60]]) {
        ctx.beginPath(); ctx.ellipse(w * cx, h * cy + 4, rx, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
    });
    const sand = new THREE.Color('#eab06a');
    const deepSand = new THREE.Color('#c97a3a');
    const rust = new THREE.Color('#b5532c');
    const darkRust = new THREE.Color('#7d321c');
    this.addTerrainLayer({ zNear: -22, zFar: -50, maxHeight: 5, seed: 2.2, speed: 0.34, colorAt: (t, h) => sand.clone().lerp(deepSand, Math.min(1, h * 0.9 + t * 0.2)) });
    this.addTerrainLayer({ zNear: -50, zFar: -95, maxHeight: 18, seed: 6.4, speed: 0.16, colorAt: (_t, h) => rust.clone().lerp(darkRust, Math.min(1, h * 0.8)) });

    // Flat-topped mesas on the horizon
    const mesaMat = createN64Material({ color: '#a8452a', roughness: 0.95 });
    const mesaTop = createN64Material({ color: '#c96a3e', roughness: 0.95 });
    this.scatter(7, 126, 0.22, -44, -60, (i) => {
      const g = new THREE.Group();
      const r = 4 + (i % 3) * 2;
      const hgt = 7 + (i % 4) * 3;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.35, hgt, 7), mesaMat);
      body.position.y = hgt / 2;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.6, 7), mesaTop);
      cap.position.y = hgt;
      g.add(body, cap);
      return g;
    });

    // Saguaro cacti, scrub and boulders near the line
    const cactus = createN64Material({ color: '#3f7f45', roughness: 0.85 });
    const scrub = createN64Material({ color: '#7d6a2e', roughness: 0.9 });
    const rock = createN64Material({ color: '#9c5a35', roughness: 0.95 });
    this.scatter(18, 96, 0.82, -7, -22, (i) => {
      const g = new THREE.Group();
      if (i % 3 === 2) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + (i % 2) * 0.5, 0), rock);
        r.position.y = 0.6;
        g.add(r);
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), scrub);
        b.position.set(1.4, 0.4, 0.3);
        g.add(b);
        return g;
      }
      const hgt = 3 + (i % 4) * 0.7;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, hgt, 6), cactus);
      trunk.position.y = hgt / 2;
      g.add(trunk);
      for (const side of [-1, 1]) {
        if (side === 1 && i % 2) continue;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.9, 6), cactus);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(side * 0.6, hgt * 0.45, 0);
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.2, 6), cactus);
        up.position.set(side * 1.0, hgt * 0.45 + 0.55, 0);
        g.add(arm, up);
      }
      return g;
    });
  }

  // ── Region 3: the mountains ──
  private buildMountains() {
    this.buildSkyPlane((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0f4c8a');
      g.addColorStop(0.4, '#2f86cf');
      g.addColorStop(0.52, '#6fb6ea');
      g.addColorStop(0.6, '#bfe2f8');
      g.addColorStop(1, '#e3f3fd');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // dithered haze bands, like a retro sky
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let y = Math.floor(h * 0.5); y < h * 0.6; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < w; x += 4) ctx.fillRect(x, y, 2, 2);
      const cloud = (cx: number, cy: number, k: number) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 48 * k, 10 * k, 0, 0, Math.PI * 2);
        ctx.arc(cx - 16 * k, cy - 8 * k, 14 * k, 0, Math.PI * 2);
        ctx.arc(cx + 8 * k, cy - 13 * k, 18 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cfe6f7';
        ctx.beginPath(); ctx.ellipse(cx, cy + 4 * k, 44 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
      };
      cloud(w * 0.25, h * 0.44, 1);
      cloud(w * 0.58, h * 0.42, 1.2);
      cloud(w * 0.82, h * 0.47, 0.8);
    });
    const forest = new THREE.Color('#3f7f45');
    const deepForest = new THREE.Color('#24553a');
    const rockBlue = new THREE.Color('#6c7fa6');
    const rockDeep = new THREE.Color('#4b5d86');
    const snow = new THREE.Color('#f5f8ff');
    this.addTerrainLayer({ zNear: -24, zFar: -48, maxHeight: 10, seed: 3.3, speed: 0.34, colorAt: (t, h) => forest.clone().lerp(deepForest, Math.min(1, h + t * 0.3)) });
    this.addTerrainLayer({
      zNear: -46, zFar: -105, maxHeight: 52, seed: 5.1, speed: 0.12,
      colorAt: (t, h) => (h > 0.55 ? snow.clone().lerp(new THREE.Color('#dbe6fb'), t * 0.5) : h > 0.22 ? rockBlue.clone().lerp(rockDeep, (h - 0.22) * 2) : deepForest.clone().lerp(rockBlue, h * 3)),
    });

    // Dense pine forest in front of the peaks
    const pines = ['#1f4d3a', '#2b6145', '#173d2e', '#25583f'].map((c) => createN64Material({ color: c, roughness: 0.9 }));
    const trunkMat = createN64Material({ color: '#4a3020', roughness: 0.9 });
    this.scatter(14, 98, 0.7, -9, -20, (i) => {
      const g = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const hgt = 3.5 + ((i * 7 + k * 3) % 5) * 0.9;
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 5), trunkMat);
        trunk.position.y = 0.4;
        const lower = new THREE.Mesh(new THREE.ConeGeometry(1.1, hgt * 0.6, 6), pines[(i + k) % 4]);
        lower.position.y = 0.6 + hgt * 0.3;
        const upper = new THREE.Mesh(new THREE.ConeGeometry(0.75, hgt * 0.5, 6), pines[(i + k + 1) % 4]);
        upper.position.y = 0.6 + hgt * 0.65;
        tree.add(trunk, lower, upper);
        tree.position.set((k - 2) * 1.5, 0, (k % 2) * -1.2);
        g.add(tree);
      }
      return g;
    });
    // A few boulders by the track
    const boulder = createN64Material({ color: '#7d8594', roughness: 0.95 });
    this.scatter(8, 96, 0.82, -6, -8, (i) => {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.35, 0), boulder);
      r.position.y = 0.5;
      return r;
    });
  }

  // ── Region 4: the big city at dusk ──
  private buildCity() {
    this.buildSkyPlane((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1a1036');
      g.addColorStop(0.38, '#3b1f5e');
      g.addColorStop(0.47, '#8a2f6e');
      g.addColorStop(0.54, '#e2566b');
      g.addColorStop(0.6, '#ff9a6b');
      g.addColorStop(1, '#ffc58f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = 'rgba(255,240,220,0.8)';
        ctx.fillRect((i * 137) % w, (h * 0.38) + ((i * 53) % Math.floor(h * 0.08)), 2, 2);
      }
      // Striped setting sun
      const sx = w * 0.55, sy = h * 0.555, r = 40;
      ctx.save();
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.clip();
      const sg = ctx.createLinearGradient(0, sy - r, 0, sy + r);
      sg.addColorStop(0, '#fff2b0');
      sg.addColorStop(1, '#ff8a5b');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      ctx.fillStyle = '#e2566b';
      for (let k = 0; k < 6; k++) ctx.fillRect(sx - r, sy + 4 + k * 7, r * 2, 2 + k * 0.6);
      ctx.restore();
      ctx.fillStyle = '#5b2a6e';
      for (const [cx, cy, rx] of [[0.18, 0.46, 80], [0.4, 0.43, 60], [0.78, 0.45, 90], [0.9, 0.5, 50]]) {
        ctx.beginPath(); ctx.ellipse(w * cx, h * cy, rx, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
    });

    // Lit-window facades
    const windows = (lit: string[], dark: string, seed: number) => {
      const tex = createPixelCanvasTexture(16, 32, (ctx) => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 16, 32);
        let v = seed;
        for (let y = 1; y < 32; y += 3) for (let x = 1; x < 16; x += 3) {
          v = (v * 9301 + 49297) % 233280;
          ctx.fillStyle = v / 233280 > 0.45 ? lit[Math.floor((v / 233280) * 10) % lit.length] : dark;
          ctx.fillRect(x, y, 2, 2);
        }
      }, 2, 3);
      tex.magFilter = THREE.NearestFilter;
      return tex;
    };
    const facade = (body: string, seed: number, glow: string[]) => {
      const win = windows(glow, '#241a3a', seed);
      return new THREE.MeshLambertMaterial({ color: body, emissive: '#ffffff', emissiveMap: win, emissiveIntensity: 0.95, flatShading: true });
    };
    const farMats = [facade('#3b2f5c', 11, ['#ffd27a', '#ffb000']), facade('#2f2650', 29, ['#7ce0ff', '#ffd27a']), facade('#45346a', 47, ['#ffd27a', '#ff9e7a'])];
    const midMats = [facade('#4a3f66', 61, ['#ffd27a', '#7ce0ff']), facade('#3a3358', 83, ['#ffe9a8', '#ffb000'])];
    const box = (w: number, h: number, d: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.y = h / 2;
      return m;
    };
    // Far skyline of towers
    this.scatter(22, 132, 0.18, -48, -66, (i) => {
      const g = new THREE.Group();
      const h = 12 + ((i * 37) % 30);
      const w = 4 + (i % 3) * 1.5;
      g.add(box(w, h, 4, farMats[i % 3]));
      if (i % 4 === 0) {
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 5, 4), createN64Material({ color: '#2a2140' }));
        spire.position.y = h + 2.5;
        g.add(spire);
      }
      if (i % 5 === 2) {
        const top = box(w * 0.6, 4, 2.6, farMats[(i + 1) % 3]);
        top.position.y = h + 2;
        g.add(top);
      }
      return g;
    });
    // Mid-rise blocks
    this.scatter(16, 112, 0.34, -26, -36, (i) => {
      const g = new THREE.Group();
      const h = 7 + ((i * 23) % 12);
      g.add(box(5 + (i % 2) * 2, h, 4, midMats[i % 2]));
      const roof = box(1.2, 1, 1.2, createN64Material({ color: '#2a2140' }));
      roof.position.set(1, h + 0.5, 0);
      g.add(roof);
      return g;
    });
    // Low warehouses and street lamps by the line
    const shed = createN64Material({ color: '#5a4f73', roughness: 0.9 });
    const lampPost = createN64Material({ color: '#2a2140' });
    const lampGlow = createN64Material({ color: '#ffe9a8', emissive: '#ffd27a', emissiveIntensity: 1 });
    this.scatter(12, 96, 0.82, -8, -14, (i) => {
      const g = new THREE.Group();
      if (i % 2) {
        const b = box(4 + (i % 3), 2.2 + (i % 2) * 0.8, 3, shed);
        g.add(b);
      } else {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.6, 0.15), lampPost);
        post.position.y = 1.8;
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), lampGlow);
        bulb.position.y = 3.7;
        g.add(post, bulb);
      }
      return g;
    });
  }

  private buildColourfulTree(i: number): THREE.Group {
    const kinds = ['oak', 'pine', 'oak', 'autumn', 'pine', 'blossom', 'oak', 'gold'];
    const kind = kinds[i % kinds.length];
    if (kind === 'pine') return buildTreeProp(false, i % 2 ? '#1f5e3a' : '#2f7a4a');
    const leaf = { oak: '#4fa83d', autumn: '#e0702f', blossom: '#f2a7c3', gold: '#f2c037' }[kind] ?? '#4fa83d';
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 1.6, 5),
      createN64Material({ color: '#6b4423', roughness: 0.92 }),
    );
    trunk.position.y = 0.8;
    const leafMat = createN64Material({ color: leaf, roughness: 0.85 });
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 0), leafMat);
    crown.position.y = 2.3;
    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), leafMat);
    crown2.position.set(0.7, 2.0, 0.2);
    const crown3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), leafMat);
    crown3.position.set(-0.65, 2.1, -0.1);
    g.add(trunk, crown, crown2, crown3);
    return g;
  }

  private buildWildlife() {
    const mat = (color: string) => createN64Material({ color, roughness: 0.9 });
    const cream = mat('#f2ebdd');
    const charcoal = mat('#1e1e24');
    const grey = mat('#8a8478');
    const brown = mat('#5c3c00');
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const legs = (g: THREE.Group, w: number, d: number, h: number, m: THREE.Material) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.1, h, 0.1, m, sx * w, h / 2, sz * d));
    };
    const sheep = () => {
      const g = new THREE.Group();
      g.add(box(0.9, 0.55, 0.55, cream, 0, 0.6, 0));
      g.add(box(0.28, 0.3, 0.3, charcoal, 0.55, 0.75, 0));
      legs(g, 0.3, 0.17, 0.35, charcoal);
      return g;
    };
    const cow = () => {
      const g = new THREE.Group();
      g.add(box(1.5, 0.75, 0.7, cream, 0, 0.95, 0));
      g.add(box(0.55, 0.45, 0.72, charcoal, -0.25, 1.05, 0));
      g.add(box(0.4, 0.42, 0.42, cream, 0.92, 1.1, 0));
      g.add(box(0.14, 0.12, 0.44, charcoal, 1.12, 1.0, 0));
      legs(g, 0.55, 0.24, 0.6, charcoal);
      return g;
    };
    const rabbit = () => {
      const g = new THREE.Group();
      g.add(box(0.36, 0.26, 0.24, grey, 0, 0.16, 0));
      g.add(box(0.18, 0.18, 0.18, grey, 0.2, 0.32, 0));
      g.add(box(0.05, 0.22, 0.06, grey, 0.18, 0.5, 0.04));
      g.add(box(0.05, 0.22, 0.06, grey, 0.23, 0.5, -0.04));
      g.add(box(0.08, 0.08, 0.08, cream, -0.2, 0.2, 0));
      return g;
    };
    const horse = () => {
      const g = new THREE.Group();
      g.add(box(1.4, 0.6, 0.5, brown, 0, 1.15, 0));
      g.add(box(0.3, 0.65, 0.3, brown, 0.72, 1.5, 0));
      g.add(box(0.5, 0.25, 0.26, brown, 0.95, 1.75, 0));
      g.add(box(0.12, 0.5, 0.08, charcoal, 0.62, 1.55, 0));
      legs(g, 0.5, 0.17, 0.85, charcoal);
      return g;
    };

    const herd: Array<[() => THREE.Group, number, number, number]> = [
      // builder, x, z, facing (1 = right, -1 = left)
      [sheep, -40, -10.2, 1], [sheep, -38.6, -10.8, -1], [sheep, -37.4, -9.9, 1],
      [cow, -27, -15.4, -1], [cow, -24.6, -16.2, 1],
      [rabbit, -18, -8.4, 1], [rabbit, -17.2, -8.9, -1],
      [sheep, -6, -15.8, -1], [sheep, -4.8, -16.3, 1], [sheep, -3.5, -15.6, 1], [sheep, -2.4, -16.1, -1],
      [horse, 8, -11.2, 1],
      [cow, 17, -20.2, 1], [cow, 19.5, -20.6, -1], [cow, 21.4, -19.8, 1],
      [rabbit, 27, -9.1, -1],
      [sheep, 34, -11.4, 1], [sheep, 35.3, -10.8, -1],
      [horse, 44, -15.6, -1],
    ];
    for (const [make, x, z, face] of herd) {
      const a = make();
      a.rotation.y = face > 0 ? 0 : Math.PI;
      a.position.set(x, 0, z);
      toBackground(a);
      this.buildTarget.add(a);
      this.sceneryItems.push({ group: a, x, speedFactor: 0.6, span: 100.8 });
    }

    // A few birds wheeling over the fields
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.add(box(0.28, 0.12, 0.12, charcoal, 0, 0, 0));
      const wingL = new THREE.Group();
      wingL.add(box(0.5, 0.05, 0.16, charcoal, -0.25, 0, 0));
      wingL.position.x = -0.12;
      const wingR = new THREE.Group();
      wingR.add(box(0.5, 0.05, 0.16, charcoal, 0.25, 0, 0));
      wingR.position.x = 0.12;
      g.add(wingL, wingR);
      const x = -40 + i * 13;
      g.position.set(x, 7, -14 - (i % 3) * 5);
      g.scale.setScalar(1.3);
      toBackground(g);
      this.buildTarget.add(g);
      const baseY = 7 + (i % 3) * 1.6;
      this.birds.push({ group: g, wingL, wingR, phase: i * 1.7, vx: (i % 2 === 0 ? 1 : -1) * (3 + (i % 3)), baseY });
    }
  }

  private initParticlePool() {
    const count = 80;
    const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, count);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < count; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1,
        scale: 0,
        color: new THREE.Color('#ffffff'),
      });
      _mat4.makeTranslation(0, -50, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
    this.scene.add(this.particleMesh);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxAge: number,
    scale: number,
    hexColor: string,
  ) {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particles.length;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.maxAge = maxAge;
    p.scale = scale;
    p.color.set(hexColor);
  }

  private clearSkippedPlatforms() {
    for (const sp of this.skippedPlatforms) {
      this.scene.remove(sp.group);
    }
    this.skippedPlatforms = [];
  }

  private applyBiomeImmediate(stationIndex: number) {
    const biome = getBiomeForStation(this.edition, stationIndex, this.loopStations);
    this.setRegion(regionForBiome(biome.id), true);
  }

  /** Swap the whole backdrop to another region of the line. */
  private setRegion(region: RegionId, force = false) {
    if (region === this.region && !force) return;
    this.region = region;
    for (const id of Object.keys(this.regionGroups) as RegionId[]) {
      this.regionGroups[id].visible = id === region;
    }
    const look = REGION_LOOKS[region];
    this.skyColor.set(look.fog);
    this.fogColor.set(look.fog);
    this.scene.background = this.skyColor;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near = look.fogNear;
      this.scene.fog.far = look.fogFar;
    }
    (this.groundMesh.material as THREE.MeshLambertMaterial).color.set(look.ground);
    (this.nearGround.material as THREE.MeshLambertMaterial).color.set(look.nearGround);
    this.hemiLight.color.set(look.hemiSky);
    this.hemiLight.groundColor.set(look.hemiGround);
    this.hemiLight.intensity = look.hemiIntensity;
    this.sunLight.color.set(look.sun);
    this.sunLight.intensity = look.sunIntensity;
  }

  private setPlatformSign(holder: THREE.Group, stationIndex: number) {
    holder.clear();
    const station = getStationInfo(this.edition, stationIndex, this.loopStations);
    const biome = getBiomeForStation(this.edition, stationIndex, this.loopStations);
    const sign = buildStationSignboard(station.index, station.name, biome.accentHex);
    holder.add(sign);
  }

  public setCallbacks(callbacks: NextStopSceneCallbacks) {
    this.callbacksRef.current = callbacks;
  }

  public updateProfile(profile: PlayerProfile) {
    this.profile = profile;
    const prevPos = this.characterRig.root.position.clone();
    const prevRot = this.characterRig.root.rotation.clone();
    const wasVisible = this.characterRig.root.visible;
    this.scene.remove(this.characterRig.root);

    this.characterRig = buildCharacterModel(profile, true);
    this.characterRig.root.position.copy(prevPos);
    this.characterRig.root.rotation.copy(prevRot);
    this.characterRig.root.visible = wasVisible;
    this.scene.add(this.characterRig.root);
  }

  public resetToPlatform(
    stationIndex: number,
    edition: GameEdition = this.edition,
    loopStations: boolean = this.loopStations,
  ) {
    if (edition !== this.edition) this.palettePass.setPalette(scenePaletteFor(edition));
    this.edition = edition;
    this.loopStations = loopStations;
    this.startStationIdx = stationIndex;
    this.mode = 'platform_idle';
    this.phaseTimer = 0;
    this.trauma = 0;
    this.clearSkippedPlatforms();

    this.trainWrapper.clear();
    this.activeTrain = null;

    this.homePlatformGroup.visible = true;
    this.homePlatformGroup.position.set(0, 0, 0);
    this.arrivalPlatformGroup.visible = false;

    this.setPlatformSign(this.signHolder, stationIndex);
    this.applyBiomeImmediate(stationIndex);

    this.characterRig.root.visible = true;
    this.characterRig.root.position.set(0, 0.34, 1.25);
    this.characterRig.root.rotation.set(0, 0, 0);
    this.characterRig.bodyGroup.rotation.set(0, 0, 0);
    this.characterRig.leftLeg.rotation.set(0, 0, 0);
    this.characterRig.rightLeg.rotation.set(0, 0, 0);
    this.characterRig.leftArm.rotation.set(0, 0, 0);
    this.characterRig.rightArm.rotation.set(0, 0, 0);

    this.camera.position.set(0, 2.85, 11.6);
    this.camera.lookAt(0, 1.5, 0);
  }

  /**
   * Home-screen mode: no platform or porter, just trains crossing the
   * countryside one after another, each in a different answer colour.
   */
  public startShowcase() {
    this.showcase = true;
    this.characterRig.root.visible = false;
    this.homePlatformGroup.visible = false;
    this.arrivalPlatformGroup.visible = false;
    this.clearSkippedPlatforms();
    this.showcaseX = -26;
    this.buildShowcaseTrain();
  }

  private static SHOWCASE_TIERS: RarityTier[] = ['LEGENDARY', 'RARE', 'UNCOMMON', 'FAKE_DEEP', 'COMMON'];

  private buildShowcaseTrain() {
    const tier = NextStopSceneController.SHOWCASE_TIERS[this.showcaseTierIdx % 5];
    this.activeTier = tier;
    this.trainWrapper.clear();
    this.activeTrain = buildTrainModel(tier, this.profile.liveryId);
    this.activeTrain.group.rotation.y = Math.PI / 2;
    this.trainWrapper.add(this.activeTrain.group);
  }

  private stepShowcase(dt: number, elapsed: number) {
    const speed = 7;
    this.showcaseX += speed * dt;
    if (this.showcaseX > 26) {
      this.showcaseX = -26;
      this.showcaseTierIdx++;
      this.buildShowcaseTrain();
      const tour: RegionId[] = ['countryside', 'desert', 'mountains', 'city'];
      this.showcaseRegionIdx = (this.showcaseRegionIdx + 1) % tour.length;
      this.setRegion(tour[this.showcaseRegionIdx]);
    }
    this.trainWrapper.position.set(this.showcaseX, 0.14 + Math.sin(elapsed * 22) * 0.02, -1.6);
    if (this.activeTrain) {
      for (const w of this.activeTrain.wheels) w.rotation.x += speed * dt * 0.85;
    }
    // Gentle parallax drift so the landscape feels alive
    for (const item of this.sceneryItems) {
      item.x -= 2.2 * item.speedFactor * dt;
      if (item.x < -item.span / 2) item.x += item.span;
      item.group.position.x = item.x;
    }
    this.smokeTimer += dt;
    if (this.smokeTimer > 0.14) {
      this.smokeTimer = 0;
      this.spawnParticle(this.showcaseX + 1.6, 2.65, -1.6, -2, 2.1, 0, 0.9, 0.8, '#e8eef2');
    }
    this.updateParticles(dt, 0);
  }

  public triggerTrainSequence(
    tier: RarityTier,
    startStation: number,
    edition: GameEdition = this.edition,
    loopStations: boolean = this.loopStations,
  ) {
    this.edition = edition;
    this.loopStations = loopStations;
    this.activeTier = tier;
    this.startStationIdx = startStation;
    this.targetStationsToSkip = TRAIN_SPECS[tier].stations;
    this.rideDuration = TRAIN_SPECS[tier].rideDurationSec || 3.2;
    this.phaseTimer = 0;
    this.rideProgress = 0;
    this.stationArriveProgress = 0;
    this.lastStationInteger = startStation;
    this.clearSkippedPlatforms();

    if (tier === 'INVALID') {
      this.mode = 'train_arriving';
      this.arriveDuration = 1.65;
      this.trauma = 0.28;
      this.trainWrapper.clear();
      this.activeTrain = null;
      return;
    }

    this.trainWrapper.clear();
    this.activeTrain = buildTrainModel(tier, this.profile.liveryId);
    // Rotate train so its nose (+Z) faces right (+X) in side-on view
    this.activeTrain.group.rotation.y = Math.PI / 2;
    this.trainWrapper.add(this.activeTrain.group);
    this.trainWrapper.position.set(-22, 0.14, -1.6);

    this.arriveDuration = 1.95;
    this.mode = 'train_arriving';
    this.trauma = tier === 'LEGENDARY' ? 0.55 : tier === 'RARE' ? 0.3 : 0.15;
  }

  private spawnSkippedPlatforms() {
    this.clearSkippedPlatforms();
    const intermediateCount = Math.max(0, this.targetStationsToSkip - 1);
    for (let i = 1; i <= intermediateCount; i++) {
      const stationNum = this.loopStations
        ? this.startStationIdx + i
        : Math.min(40, this.startStationIdx + i);
      const info = getStationInfo(this.edition, stationNum, this.loopStations);
      const biome = getBiomeForStation(this.edition, stationNum, this.loopStations);
      const prop = buildIntermediatePlatformProp(info.index, info.name, biome);
      prop.position.set(22 + (i - 1) * 14, 0, -4.1);
      this.scene.add(prop);
      this.skippedPlatforms.push({
        group: prop,
        stationNumber: stationNum,
        passedSoundFired: false,
      });
    }
  }

  private handleResize() {
    if (this.disposed) return;
    const w = Math.max(1, this.mountEl.clientWidth);
    const h = Math.max(1, this.mountEl.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    resizeN64Renderer(this.renderer, w, h, this.isSoftwareGl);
    this.palettePass.render(this.scene, this.camera);
  }

  private updateParticles(dt: number, worldMoveX: number) {
    let anyDirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyDirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _mat4.makeTranslation(0, -60, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.x += (p.vx - worldMoveX * 0.6) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const life = 1 - p.age / p.maxAge;
      const s = Math.max(0.05, p.scale * life);
      _pos.set(p.x, p.y, p.z);
      _scale.set(s, s, s);
      _mat4.compose(_pos, _quat.identity(), _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private tick = () => {
    if (this.disposed) return;
    const rawDt = this.clock.getDelta();
    const clampedTotal = Math.min(rawDt, this.isSoftwareGl ? 0.16 : 0.05);
    const subSteps = clampedTotal > 0.055 ? 3 : 1;
    const stepDt = clampedTotal / subSteps;
    for (let step = 0; step < subSteps; step++) {
      this.stepSimulation(stepDt, this.clock.elapsedTime);
    }

    if (typeof document !== 'undefined' && document.hidden) {
      this.pacer.scheduleNext(this.tick);
      return;
    }
    this.applyCameraShake();
    this.palettePass.render(this.scene, this.camera);
    this.pacer.scheduleNext(this.tick);
  };

  private stepSimulation(dt: number, elapsed: number) {
    for (const b of this.birds) {
      const flap = Math.sin(elapsed * 9 + b.phase) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
      b.group.position.x += b.vx * dt;
      if (b.group.position.x > 75) b.group.position.x = -75;
      if (b.group.position.x < -75) b.group.position.x = 75;
      b.group.position.y = b.baseY + Math.sin(elapsed * 0.8 + b.phase) * 0.6;
      b.group.rotation.y = b.vx > 0 ? 0 : Math.PI;
    }
    for (const t of this.waterfallTextures) {
      t.offset.y = (t.offset.y + dt * 1.6) % 1;
    }
    if (this.showcase) {
      this.stepShowcase(dt, elapsed);
      return;
    }
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }

    if (this.mode === 'platform_idle') {
      this.characterRig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 3.1)) * 0.045;
      this.characterRig.headGroup.rotation.y = Math.sin(elapsed * 1.2) * 0.18;
      this.characterRig.rightArm.rotation.x = Math.sin(elapsed * 3.1) * 0.06;
      this.updateParticles(dt, 0);
      return;
    }

    if (this.mode === 'train_arriving') {
      this.phaseTimer += dt;
      const t = Math.min(1, this.phaseTimer / this.arriveDuration);

      if (this.activeTier === 'INVALID') {
        // Missed service: character shakes head in dismay
        this.characterRig.headGroup.rotation.y = Math.sin(elapsed * 18) * 0.35;
        this.characterRig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 8)) * 0.06;
        this.updateParticles(dt, 0);
        if (t >= 1) {
          this.characterRig.headGroup.rotation.y = 0;
          this.mode = 'platform_idle';
          this.callbacksRef.current.onArrivalComplete?.();
        }
        return;
      }

      // First 65%: train brakes smoothly from -22 to 0
      const trainT = Math.min(1, t / 0.65);
      const easeTrain = 1 - Math.pow(1 - trainT, 3);
      const tx = THREE.MathUtils.lerp(-22, 0, easeTrain);
      this.trainWrapper.position.x = tx;
      if (this.activeTrain) {
        const wheelSpin = (1 - easeTrain) * 28 * dt;
        for (const w of this.activeTrain.wheels) {
          w.rotation.x += wheelSpin;
        }
      }

      // Remaining 35%: character walks onto the train door
      if (t > 0.58) {
        const walkT = Math.min(1, (t - 0.58) / 0.42);
        this.characterRig.root.position.z = THREE.MathUtils.lerp(1.25, -0.95, walkT);
        this.characterRig.root.rotation.y = Math.PI;
        this.characterRig.leftLeg.rotation.x = Math.sin(elapsed * 20) * 0.6;
        this.characterRig.rightLeg.rotation.x = -Math.sin(elapsed * 20) * 0.6;
        this.characterRig.leftArm.rotation.x = -Math.sin(elapsed * 20) * 0.45;
        this.characterRig.rightArm.rotation.x = Math.sin(elapsed * 20) * 0.45;
        if (walkT > 0.88) {
          this.characterRig.root.visible = false;
        }
      } else {
        this.characterRig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 3.1)) * 0.04;
      }

      this.updateParticles(dt, 0);

      if (t >= 1) {
        this.mode = 'journey_ride';
        this.rideProgress = 0;
        this.spawnSkippedPlatforms();
        this.callbacksRef.current.onBoarded?.();
      }
      return;
    }

    if (this.mode === 'journey_ride') {
      const spec = TRAIN_SPECS[this.activeTier];
      const worldSpeed = spec.speedMps;
      this.rideProgress = Math.min(1, this.rideProgress + dt / this.rideDuration);

      // Slide departure platform off to the left
      if (this.homePlatformGroup.visible) {
        this.homePlatformGroup.position.x -= worldSpeed * dt;
        if (this.homePlatformGroup.position.x < -28) {
          this.homePlatformGroup.visible = false;
        }
      }

      // Spin train wheels & subtle carriage bounce
      if (this.activeTrain) {
        for (const w of this.activeTrain.wheels) {
          w.rotation.x += worldSpeed * dt * 0.85;
        }
      }
      const bounce =
        this.activeTier === 'COMMON'
          ? Math.abs(Math.sin(elapsed * 15)) * 0.065
          : Math.sin(elapsed * 22) * 0.022;
      this.trainWrapper.position.set(0, 0.14 + bounce, -1.6);

      // Scroll sleepers & parallax scenery leftward
      for (const s of this.sleepers) {
        s.position.x -= worldSpeed * dt;
        if (s.position.x < -42) s.position.x += 84;
      }
      for (const item of this.sceneryItems) {
        item.x -= worldSpeed * item.speedFactor * dt;
        if (item.x < -item.span / 2) item.x += item.span;
        item.group.position.x = item.x;
      }

      // Scroll intermediate skipped platforms rapidly past the window
      const platformScrollSpeed = Math.max(worldSpeed, 18);
      for (const sp of this.skippedPlatforms) {
        sp.group.position.x -= platformScrollSpeed * dt;
        if (!sp.passedSoundFired && sp.group.position.x <= 0) {
          sp.passedSoundFired = true;
        }
      }

      // Live station counter & minimap tick callback
      const stationFloat =
        this.startStationIdx + this.rideProgress * this.targetStationsToSkip;
      const clampedStationFloat = this.loopStations
        ? stationFloat
        : Math.min(40, stationFloat);
      const currentInt = Math.floor(clampedStationFloat);
      if (currentInt > this.lastStationInteger) {
        this.lastStationInteger = currentInt;
        this.callbacksRef.current.onStationTick?.(clampedStationFloat, currentInt);
      } else if (elapsed - this.lastTickEmit > 0.08) {
        this.lastTickEmit = elapsed;
        this.callbacksRef.current.onStationTick?.(
          clampedStationFloat,
          this.lastStationInteger,
        );
      }

      // Cross into the next region as the train passes its first station
      const biome = getBiomeForStation(this.edition, clampedStationFloat, this.loopStations);
      this.setRegion(regionForBiome(biome.id));

      // Steam / energy trail particles streaming left (-X)
      this.smokeTimer += dt;
      const rate =
        this.activeTier === 'LEGENDARY'
          ? 0.045
          : this.activeTier === 'COMMON'
            ? 0.11
            : 0.13;
      if (this.smokeTimer >= rate) {
        this.smokeTimer = 0;
        if (this.activeTier === 'LEGENDARY' || this.activeTier === 'RARE') {
          this.spawnParticle(
            3.5,
            0.7 + Math.random() * 2.0,
            -1.6 + (Math.random() - 0.5) * 0.6,
            -worldSpeed * 0.3,
            0.2,
            0,
            0.45,
            0.38,
            this.activeTier === 'LEGENDARY' ? '#ffd27a' : '#9d6bff',
          );
        } else {
          this.spawnParticle(
            1.6,
            2.65,
            -1.6,
            -worldSpeed * 0.2,
            2.1,
            0,
            0.85,
            0.85,
            this.activeTier === 'COMMON' ? '#d1d5db' : '#9ca3af',
          );
        }
      }
      this.updateParticles(dt, worldSpeed);

      if (this.rideProgress >= 1) {
        const finalStation = this.loopStations
          ? this.startStationIdx + this.targetStationsToSkip
          : Math.min(40, this.startStationIdx + this.targetStationsToSkip);
        this.callbacksRef.current.onStationTick?.(finalStation, finalStation);
        this.mode = 'station_arriving';
        this.stationArriveProgress = 0;
        this.setPlatformSign(this.arrivalSignHolder, finalStation);
        this.arrivalPlatformGroup.visible = true;
        this.arrivalPlatformGroup.position.set(22, 0, 0);
      }
      return;
    }

    if (this.mode === 'station_arriving') {
      this.stationArriveProgress = Math.min(1, this.stationArriveProgress + dt / 1.45);
      const p = this.stationArriveProgress;

      // First 55%: arrival platform slides from +22 to 0 as train brakes
      if (p <= 0.55) {
        const k = p / 0.55;
        const ease = 1 - Math.pow(1 - k, 3);
        const prevX = this.arrivalPlatformGroup.position.x;
        const nextX = THREE.MathUtils.lerp(22, 0, ease);
        this.arrivalPlatformGroup.position.x = nextX;
        const deltaX = prevX - nextX;
        for (const s of this.sleepers) {
          s.position.x -= deltaX;
          if (s.position.x < -42) s.position.x += 84;
        }
        if (this.activeTrain) {
          for (const w of this.activeTrain.wheels) {
            w.rotation.x += deltaX * 0.8;
          }
        }
      } else {
        this.arrivalPlatformGroup.position.x = 0;
        // Remaining 45%: character steps off train back onto platform center
        const stepT = (p - 0.55) / 0.45;
        this.characterRig.root.visible = true;
        this.characterRig.root.position.set(
          0,
          0.34,
          THREE.MathUtils.lerp(-0.95, 1.25, stepT),
        );
        this.characterRig.root.rotation.y = 0;
        this.characterRig.leftLeg.rotation.x = Math.sin(elapsed * 18) * 0.5;
        this.characterRig.rightLeg.rotation.x = -Math.sin(elapsed * 18) * 0.5;
      }

      this.updateParticles(dt, 0);

      if (p >= 1) {
        // Promote arrival platform to home platform for the next prompt
        const finalStation = this.loopStations
          ? this.startStationIdx + this.targetStationsToSkip
          : Math.min(40, this.startStationIdx + this.targetStationsToSkip);
        this.startStationIdx = finalStation;
        this.clearSkippedPlatforms();
        this.homePlatformGroup.visible = true;
        this.homePlatformGroup.position.set(0, 0, 0);
        this.setPlatformSign(this.signHolder, finalStation);
        this.arrivalPlatformGroup.visible = false;
        this.characterRig.leftLeg.rotation.set(0, 0, 0);
        this.characterRig.rightLeg.rotation.set(0, 0, 0);
        this.characterRig.leftArm.rotation.set(0, 0, 0);
        this.characterRig.rightArm.rotation.set(0, 0, 0);
        this.mode = 'platform_idle';
        this.callbacksRef.current.onArrivalComplete?.();
      }
    }
  }

  private applyCameraShake() {
    const isPortrait = this.camera.aspect < 0.9;
    if (this.showcase) {
      // Track low on screen so the menu card sits over the sky and hills.
      if (isPortrait) {
        this.camera.position.set(0, 3, 19);
        this.camera.lookAt(0, 6.5, 0);
      } else {
        this.camera.position.set(0, 2.2, 13);
        this.camera.lookAt(0, 4.6, 0);
      }
      return;
    }
    const baseX = isPortrait ? -1.05 : 0;
    const baseY = isPortrait ? 3.1 : 2.85;
    const baseZ = isPortrait ? 20.5 : 11.6;
    this.camera.position.set(baseX, baseY, baseZ);
    if (this.trauma > 0.01) {
      const shake = this.trauma * this.trauma * 0.35;
      this.camera.position.x += (Math.random() * 2 - 1) * shake;
      this.camera.position.y += (Math.random() * 2 - 1) * shake;
    }
    this.camera.lookAt(baseX, 1.5, 0);
  }

  public dispose() {
    this.disposed = true;
    this.pacer.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.palettePass.dispose();
    this.resizeObserver.disconnect();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
