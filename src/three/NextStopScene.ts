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
const _targetSky = new THREE.Color();
const _targetFog = new THREE.Color();
const _targetGround = new THREE.Color();

// Fixed sunny-countryside look for every station, in the game's charcoal / amber / cream palette.
const SUNNY = {
  sky: '#ece4d2',
  fog: '#e2d9c6',
  ground: '#7a786f',
};

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
  private birds: { wingL: THREE.Object3D; wingR: THREE.Object3D; phase: number }[] = [];
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
    this.scene.fog = new THREE.Fog(this.fogColor, 24, 70);
    setupStudioEnvironment(this.renderer, this.scene);

    const w = Math.max(1, mountEl.clientWidth);
    const h = Math.max(1, mountEl.clientHeight);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.2, 95);
    this.camera.position.set(0, 2.9, 12.2);
    this.camera.lookAt(0, 1.55, 0);

    const hemi = new THREE.HemisphereLight(THEME.cream, THEME.creamMuted, 1.35);
    hemi.layers.enableAll();
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(THEME.amberLight, 1.8);
    sun.position.set(9, 18, 12);
    sun.layers.enableAll();
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
      createN64Material({ color: '#6e6e78', roughness: 0.92 }),
    );
    nearGround.rotation.x = -Math.PI / 2;
    nearGround.position.set(0, -0.02, 7);
    this.scene.add(nearGround);

    this.buildSunnySky();
    this.buildCountryside();
    this.buildWildlife();

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
    const tex = createCrispSignTexture(1024, 512, (ctx, w, h) => {
      // Bright sky: pale at the horizon, a touch deeper overhead.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0.3, '#c9c1b2');
      grad.addColorStop(0.5, '#e6ddca');
      grad.addColorStop(0.6, SUNNY.fog);
      grad.addColorStop(1, SUNNY.fog);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Sun with rays
      const sx = w * 0.63;
      const sy = h * 0.455;
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 38, sy + Math.sin(a) * 38);
        ctx.lineTo(sx + Math.cos(a) * 54, sy + Math.sin(a) * 54);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.arc(sx, sy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb000';
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.fill();

      // Fair-weather clouds
      const cloud = (cx: number, cy: number, s: number) => {
        ctx.fillStyle = '#f2ebdd';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 60 * s, 18 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 26 * s, cy - 12 * s, 28 * s, 20 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 18 * s, cy - 18 * s, 32 * s, 24 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      cloud(w * 0.27, h * 0.44, 0.6);
      cloud(w * 0.4, h * 0.5, 0.45);
      cloud(w * 0.5, h * 0.43, 0.55);
      cloud(w * 0.74, h * 0.48, 0.5);
      cloud(w * 0.55, h * 0.52, 0.35);
    });
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 110),
      new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: false }),
    );
    sky.position.set(0, 10, -66);
    sky.renderOrder = -1;
    toBackground(sky);
    this.scene.add(sky);
  }

  private buildCountryside() {
    // Rolling hills: far ridge and nearer downs
    const farHill = createN64Material({ color: '#8a8478', roughness: 0.9 });
    const nearHill = createN64Material({ color: '#6d6a62', roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const x = -54 + i * 13;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), farHill);
      hill.scale.set(11 + (i % 3) * 3, 4.5 + (i % 4) * 1.4, 6);
      hill.position.set(x, -0.1, -40 - (i % 2) * 4);
      toBackground(hill);
      this.scene.add(hill);
      this.sceneryItems.push({ group: hill, x, speedFactor: 0.18, span: 117 });
    }
    for (let i = 0; i < 8; i++) {
      const x = -50 + i * 14;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), nearHill);
      hill.scale.set(9 + (i % 2) * 4, 2.6 + (i % 3) * 0.9, 5);
      hill.position.set(x, -0.1, -28 - (i % 3) * 2);
      toBackground(hill);
      this.scene.add(hill);
      this.sceneryItems.push({ group: hill, x, speedFactor: 0.32, span: 112 });
    }

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
      createN64Material({ color: 0xffffff, map: fieldTex('#ffb000', '#a86f00') }),
      createN64Material({ color: 0xffffff, map: fieldTex('#c9c1b2', '#8a8478') }),
      createN64Material({ color: 0xffffff, map: fieldTex('#ffd27a', '#ffb000') }),
      createN64Material({ color: '#6d6a62' }),
    ];
    const hedgeMat = createN64Material({ color: '#2e2e37', roughness: 0.9 });
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
      this.scene.add(g);
      this.sceneryItems.push({ group: g, x, speedFactor: 0.6, span: 100.8 });
    }

    // Trees and the odd cottage between the fields
    for (let i = 0; i < 16; i++) {
      const isCottage = i % 5 === 0;
      const obj = isCottage ? buildCottageProp() : buildTreeProp(false);
      const x = -46 + i * 6;
      const z = -6.5 - (i % 4) * 4.2;
      obj.position.set(x, 0, z);
      obj.scale.setScalar(0.85 + (i % 3) * 0.22);
      toBackground(obj);
      this.scene.add(obj);
      this.sceneryItems.push({ group: obj, x, speedFactor: 0.82, span: 96 });
    }
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
      this.scene.add(a);
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
      g.position.set(x, 6.5 + (i % 3) * 1.4, -16 - (i % 2) * 6);
      g.scale.setScalar(1.3);
      toBackground(g);
      this.scene.add(g);
      this.birds.push({ wingL, wingR, phase: i * 1.7 });
      this.sceneryItems.push({ group: g, x, speedFactor: 0.25, span: 91 });
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
    void biome;
    this.skyColor.set(SUNNY.sky);
    this.fogColor.set(SUNNY.fog);
    (this.groundMesh.material as THREE.MeshLambertMaterial).color.set(SUNNY.ground);
    this.scene.background = this.skyColor;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColor);
    }
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

      // Smooth biome transition
      const biome = getBiomeForStation(
        this.edition,
        clampedStationFloat,
        this.loopStations,
      );
      void biome;
      _targetSky.set(SUNNY.sky);
      _targetFog.set(SUNNY.fog);
      _targetGround.set(SUNNY.ground);
      this.skyColor.lerp(_targetSky, dt * 2.5);
      this.fogColor.lerp(_targetFog, dt * 2.5);
      (this.groundMesh.material as THREE.MeshLambertMaterial).color.lerp(
        _targetGround,
        dt * 2.5,
      );
      this.scene.background = this.skyColor;
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.color.copy(this.fogColor);
      }

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
