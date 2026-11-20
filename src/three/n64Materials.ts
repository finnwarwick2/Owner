import * as THREE from 'three';

export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createN64Renderer(
  mountEl: HTMLElement,
  isSoftwareGl: boolean,
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    stencil: false,
    depth: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false;

  const canvas = renderer.domElement;
  canvas.className = 'pixel-canvas block w-full h-full';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  mountEl.innerHTML = '';
  mountEl.appendChild(canvas);

  resizeN64Renderer(renderer, mountEl.clientWidth, mountEl.clientHeight, isSoftwareGl);
  return renderer;
}

export function resizeN64Renderer(
  renderer: THREE.WebGLRenderer,
  containerWidth: number,
  containerHeight: number,
  _isSoftwareGl: boolean,
): { width: number; height: number } {
  const safeW = Math.max(1, containerWidth);
  const safeH = Math.max(1, containerHeight);
  const aspect = safeW / safeH;

  let internalW: number;
  let internalH: number;
  if (_isSoftwareGl) {
    // Software GL: keep the old chunky low-res buffer so it stays playable.
    if (aspect >= 1) {
      internalH = 320;
      internalW = Math.max(320, Math.min(580, Math.round(internalH * aspect)));
    } else {
      internalW = 280;
      internalH = Math.max(320, Math.min(560, Math.round(internalW / aspect)));
    }
  } else {
    // Full-resolution foreground so signs, train and platform stay sharp.
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const scale = Math.min(dpr, 2560 / safeW, 1600 / safeH);
    internalW = Math.max(1, Math.round(safeW * scale));
    internalH = Math.max(1, Math.round(safeH * scale));
  }

  renderer.setSize(internalW, internalH, false);
  return { width: internalW, height: internalH };
}

export function setupStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): void {
  // Flat Lambert shading needs no environment map (saves a PMREM bake at load).
  void renderer;
  void scene;
}

export interface N64MaterialOptions {
  color: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  map?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  wobbleGrid?: number; // e.g. 160 for N64 snapping, 0 to disable
}

export function createN64Material(
  opts: N64MaterialOptions,
): THREE.MeshLambertMaterial {
  // Lambert is far cheaper than PBR on phones and reads more "N64" anyway.
  const mat = new THREE.MeshLambertMaterial({
    color: opts.map ? 0xffffff : opts.color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    map: opts.map ?? null,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: true,
  });

  const gridSnap = opts.wobbleGrid ?? 170;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnapGrid = { value: gridSnap };
    if (gridSnap > 0) {
      shader.vertexShader =
        'uniform float uSnapGrid;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          `
          #include <project_vertex>
          if (gl_Position.w > 0.001) {
            vec2 snapScale = vec2(uSnapGrid, uSnapGrid * 0.75);
            gl_Position.xy = floor(gl_Position.xy * snapScale / gl_Position.w + 0.5) * gl_Position.w / snapScale;
          }
          `,
        );
    }

    // Classic ordered 4x4 Bayer dithered distance fog
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #endif
      `,
    );
  };

  return mat;
}

export function createPixelCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX: number = 1,
  repeatY: number = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    draw(ctx, width, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

export function createCrispSignTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    draw(ctx, width, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') {
    void document.fonts.ready.then(() => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      draw(ctx, width, height);
      tex.needsUpdate = true;
    });
  }

  return tex;
}

export function createContactShadowMesh(
  radiusX: number,
  radiusZ: number,
  opacity: number = 0.42,
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, `rgba(6, 9, 18, ${opacity})`);
    grad.addColorStop(0.65, `rgba(6, 9, 18, ${opacity * 0.55})`);
    grad.addColorStop(1, 'rgba(6, 9, 18, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

  const geo = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.02;
  return mesh;
}

export function createSoftwareFramePacer(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
) {
  let frameId = 0;
  let stopped = false;

  const scheduleNext = (tickFn: () => void) => {
    if (stopped) return;
    if (isSoftwareGl) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (stopped) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(tickFn, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(tickFn, 80);
      }
    } else {
      frameId = window.requestAnimationFrame(tickFn);
    }
  };

  const stop = () => {
    stopped = true;
    window.cancelAnimationFrame(frameId);
    window.clearTimeout(frameId);
  };

  return { scheduleNext, stop };
}


/** Layer for distant scenery (sky, hills, fields). Everything else is foreground. */
export const BACKGROUND_LAYER = 1;

/**
 * Two-layer render. The background layer (sky, hills, fields, trees) is drawn
 * into a low-res buffer and snapped to the palette with 4x4 ordered dithering,
 * which gives it the hatched retro look. The foreground (platform, train,
 * signs, people) is drawn at full resolution and snapped to the same palette
 * with no dithering, so it stays clean and readable.
 */
export class PalettePass {
  private bgTarget: THREE.WebGLRenderTarget;
  private fgTarget: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private size = new THREE.Vector2();
  private bgSize = new THREE.Vector2();
  private clearColor = new THREE.Color();

  constructor(private renderer: THREE.WebGLRenderer, palette: string[]) {
    renderer.getDrawingBufferSize(this.size);
    this.computeBgSize();
    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    } as const;
    this.bgTarget = new THREE.WebGLRenderTarget(this.bgSize.x, this.bgSize.y, opts);
    this.fgTarget = new THREE.WebGLRenderTarget(this.size.x, this.size.y, opts);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tBg: { value: this.bgTarget.texture },
        tFg: { value: this.fgTarget.texture },
        uBgSize: { value: this.bgSize },
        uPalette: { value: palette.map((h) => new THREE.Color(h)) },
        uDither: { value: 0.11 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tBg;
        uniform sampler2D tFg;
        uniform vec2 uBgSize;
        uniform vec3 uPalette[${palette.length}];
        uniform float uDither;
        varying vec2 vUv;
        vec3 toSrgb(vec3 c) {
          c = clamp(c, 0.0, 1.0);
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }
        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16];
          m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
          m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
          m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
          m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
          for (int k = 0; k < 16; k++) { if (k == i) return m[k] / 16.0 - 0.47; }
          return 0.0;
        }
        vec3 quantize(vec3 c) {
          float best = 1e9;
          vec3 outC = c;
          for (int i = 0; i < ${palette.length}; i++) {
            vec3 d = (c - uPalette[i]) * vec3(0.30, 0.59, 0.11);
            vec3 d2 = (c - uPalette[i]);
            float dist = dot(d, d) * 6.0 + dot(d2, d2);
            if (dist < best) { best = dist; outC = uPalette[i]; }
          }
          return outC;
        }
        void main() {
          vec4 fg = texture2D(tFg, vUv);
          if (fg.a > 0.5) {
            gl_FragColor = vec4(quantize(toSrgb(fg.rgb)), 1.0);
            return;
          }
          vec2 bgPx = floor(vUv * uBgSize);
          vec3 bg = toSrgb(texture2D(tBg, (bgPx + 0.5) / uBgSize).rgb);
          bg += bayer4(bgPx) * uDither;
          gl_FragColor = vec4(quantize(bg), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    (this.material.uniforms.uPalette.value as THREE.Color[]).forEach((col, i) =>
      col.setStyle(palette[i], THREE.NoColorSpace),
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const tri = new THREE.Mesh(geo, this.material);
    tri.frustumCulled = false;
    this.quadScene.add(tri);
  }

  private computeBgSize() {
    const w = Math.max(1, this.size.x);
    const h = Math.max(1, this.size.y);
    if (w >= h) {
      this.bgSize.set(Math.max(1, Math.round((320 * w) / h)), 320);
    } else {
      this.bgSize.set(280, Math.max(1, Math.round((280 * h) / w)));
    }
  }

  setPalette(palette: string[]) {
    const arr = this.material.uniforms.uPalette.value as THREE.Color[];
    palette.forEach((hex, i) => arr[i]?.setStyle(hex, THREE.NoColorSpace));
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.getDrawingBufferSize(this.size);
    if (this.fgTarget.width !== this.size.x || this.fgTarget.height !== this.size.y) {
      this.fgTarget.setSize(this.size.x, this.size.y);
      this.computeBgSize();
      this.bgTarget.setSize(this.bgSize.x, this.bgSize.y);
    }
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.getClearColor(this.clearColor);
    const background = scene.background;

    // Background layer (with the sky colour behind it).
    camera.layers.set(BACKGROUND_LAYER);
    this.renderer.setRenderTarget(this.bgTarget);
    this.renderer.render(scene, camera);

    // Foreground layer on a transparent clear.
    camera.layers.set(0);
    scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.fgTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    scene.background = background;
    this.renderer.setClearColor(this.clearColor, prevAlpha);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.bgTarget.dispose();
    this.fgTarget.dispose();
    this.material.dispose();
  }
}
