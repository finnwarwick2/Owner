import * as THREE from 'three';
import type { BiomeConfig } from '../games/next-stop/routes';
import {
  CHARACTER_COLORS,
  TRAIN_LIVERIES,
} from '../games/next-stop/storage';
import type { RarityTier } from '../games/next-stop/types';
import type { CharacterHatId, PlayerProfile, TrainLiveryId } from '../types/arcade';
import {
  createContactShadowMesh,
  createCrispSignTexture,
  createN64Material,
} from './n64Materials';

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  hatAnchor: THREE.Group;
}

function buildHatMesh(hatId: CharacterHatId): THREE.Group {
  const hat = new THREE.Group();
  switch (hatId) {
    case 'station_cap': {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.27, 0.16, 7),
        createN64Material({ color: '#1e3a8a', roughness: 0.78 }),
      );
      crown.position.y = 0.08;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.275, 0.275, 0.05, 7),
        createN64Material({ color: '#facc15', roughness: 0.4, metalness: 0.3 }),
      );
      band.position.y = 0.03;
      const peak = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.04, 0.22),
        createN64Material({ color: '#0f172a', roughness: 0.3 }),
      );
      peak.position.set(0, 0.02, 0.22);
      hat.add(crown, band, peak);
      break;
    }
    case 'beanie': {
      const dome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.26, 0.22, 7),
        createN64Material({ color: '#b91c1c', roughness: 0.9 }),
      );
      dome.position.y = 0.1;
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.27, 0.08, 7),
        createN64Material({ color: '#fef3c7', roughness: 0.85 }),
      );
      rim.position.y = 0.03;
      const pom = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        createN64Material({ color: '#fef3c7', roughness: 0.92 }),
      );
      pom.position.y = 0.25;
      hat.add(dome, rim, pom);
      break;
    }
    case 'drivers_peak': {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.24, 0.16, 8),
        createN64Material({ color: '#1f2937', roughness: 0.7 }),
      );
      cap.position.y = 0.09;
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.09, 0.05),
        createN64Material({
          color: '#38bdf8',
          roughness: 0.25,
          metalness: 0.6,
          emissive: '#0284c7',
          emissiveIntensity: 0.4,
        }),
      );
      badge.position.set(0, 0.1, 0.25);
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.04, 0.2),
        createN64Material({ color: '#090d16', roughness: 0.25 }),
      );
      visor.position.set(0, 0.01, 0.22);
      hat.add(cap, badge, visor);
      break;
    }
    case 'top_hat': {
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.04, 8),
        createN64Material({ color: '#18181b', roughness: 0.6 }),
      );
      brim.position.y = 0.02;
      const stovepipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.23, 0.21, 0.36, 8),
        createN64Material({ color: '#18181b', roughness: 0.65 }),
      );
      stovepipe.position.y = 0.2;
      const ribbon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8),
        createN64Material({ color: '#d97706', roughness: 0.35, metalness: 0.4 }),
      );
      ribbon.position.y = 0.07;
      hat.add(brim, stovepipe, ribbon);
      break;
    }
    case 'viking_helm': {
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
        createN64Material({ color: '#64748b', roughness: 0.38, metalness: 0.65 }),
      );
      bowl.position.y = 0.01;
      const hornGeo = new THREE.ConeGeometry(0.07, 0.28, 5);
      const hornMat = createN64Material({ color: '#f8fafc', roughness: 0.5 });
      const leftHorn = new THREE.Mesh(hornGeo, hornMat);
      leftHorn.position.set(-0.27, 0.16, 0);
      leftHorn.rotation.z = 0.7;
      const rightHorn = new THREE.Mesh(hornGeo, hornMat);
      rightHorn.position.set(0.27, 0.16, 0);
      rightHorn.rotation.z = -0.7;
      hat.add(bowl, leftHorn, rightHorn);
      break;
    }
    case 'golden_crown': {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.24, 0.12, 8),
        createN64Material({
          color: '#facc15',
          roughness: 0.22,
          metalness: 0.85,
          emissive: '#ca8a04',
          emissiveIntensity: 0.25,
        }),
      );
      base.position.y = 0.06;
      hat.add(base);
      const spikeGeo = new THREE.ConeGeometry(0.06, 0.16, 4);
      const spikeMat = createN64Material({
        color: '#fde047',
        roughness: 0.2,
        metalness: 0.85,
      });
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        spike.position.set(Math.cos(angle) * 0.2, 0.18, Math.sin(angle) * 0.2);
        hat.add(spike);
      }
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06, 0),
        createN64Material({
          color: '#ef4444',
          roughness: 0.15,
          emissive: '#dc2626',
          emissiveIntensity: 0.5,
        }),
      );
      gem.position.set(0, 0.08, 0.24);
      hat.add(gem);
      break;
    }
  }
  return hat;
}

function buildBriefcaseMesh(): THREE.Group {
  const caseGroup = new THREE.Group();
  const leatherMat = createN64Material({ color: '#6b3416', roughness: 0.82 });
  const trimMat = createN64Material({ color: '#42200a', roughness: 0.85 });
  const brassMat = createN64Material({
    color: '#facc15',
    roughness: 0.3,
    metalness: 0.7,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.42), leatherMat);
  body.position.set(0, -0.16, 0);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.14), trimMat);
  handle.position.set(0, 0.01, 0);
  const claspL = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.05, 0.05), brassMat);
  claspL.position.set(0, -0.06, -0.1);
  const claspR = claspL.clone();
  claspR.position.z = 0.1;

  caseGroup.add(body, handle, claspL, claspR);
  return caseGroup;
}

export function buildCharacterModel(
  profile: PlayerProfile,
  withBriefcase: boolean = true,
): CharacterRig {
  const colorEntry =
    CHARACTER_COLORS.find((c) => c.id === profile.colorId) ?? CHARACTER_COLORS[0];

  const root = new THREE.Group();
  const shadow = createContactShadowMesh(0.45, 0.45, 0.42);
  root.add(shadow);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const legGeo = new THREE.BoxGeometry(0.18, 0.38, 0.2);
  const bootMat = createN64Material({ color: '#1e293b', roughness: 0.82 });
  const leftLeg = new THREE.Mesh(legGeo, bootMat);
  leftLeg.position.set(-0.14, 0.19, 0);
  const rightLeg = new THREE.Mesh(legGeo, bootMat);
  rightLeg.position.set(0.14, 0.19, 0);
  bodyGroup.add(leftLeg, rightLeg);

  const coatMat = createN64Material({
    color: colorEntry.primaryHex,
    roughness: 0.72,
  });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.54, 0.34), coatMat);
  torso.position.y = 0.65;
  bodyGroup.add(torso);

  const stripeMat = createN64Material({
    color: colorEntry.secondaryHex,
    roughness: 0.35,
    metalness: 0.35,
  });
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.1, 0.37),
    stripeMat,
  );
  belt.position.y = 0.48;
  bodyGroup.add(belt);

  const armGeo = new THREE.BoxGeometry(0.15, 0.42, 0.16);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.35, 0.82, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, coatMat);
  leftArmMesh.position.y = -0.17;
  leftArm.add(leftArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.35, 0.82, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, coatMat);
  rightArmMesh.position.y = -0.17;
  rightArm.add(rightArmMesh);

  if (withBriefcase) {
    const briefcase = buildBriefcaseMesh();
    briefcase.position.set(0.05, -0.36, 0.04);
    rightArm.add(briefcase);
  }

  bodyGroup.add(leftArm, rightArm);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.1;
  bodyGroup.add(headGroup);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.42, 0.42),
    createN64Material({ color: '#f4c7a1', roughness: 0.78 }),
  );
  headGroup.add(head);

  const eyeMat = createN64Material({ color: '#0f172a', roughness: 0.25 });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), eyeMat);
  leftEye.position.set(-0.1, 0.03, 0.21);
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), eyeMat);
  rightEye.position.set(0.1, 0.03, 0.21);
  headGroup.add(leftEye, rightEye);

  const hatAnchor = new THREE.Group();
  hatAnchor.position.y = 0.2;
  hatAnchor.add(buildHatMesh(profile.hatId));
  headGroup.add(hatAnchor);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    hatAnchor,
  };
}

export interface BuiltTrain {
  group: THREE.Group;
  roofHeight: number;
  wheels: THREE.Mesh[];
  chimneyPos: THREE.Vector3;
}

function getLiveryColors(
  tier: RarityTier,
  _liveryId: TrainLiveryId,
): { primary: string; secondary: string; roof: string } {
  // Strict palette liveries: charcoal / amber / cream / accent only.
  switch (tier) {
    case 'INVALID':
      return { primary: '#44444f', secondary: '#d72638', roof: '#2e2e37' };
    case 'COMMON':
      // Shabby weathered branch-line stopping service
      return { primary: '#44444f', secondary: '#8a8478', roof: '#2e2e37' };
    case 'FAKE_DEEP':
      return { primary: '#2e2e37', secondary: '#a86f00', roof: '#5c3c00' };
    case 'UNCOMMON':
      return { primary: '#c9c1b2', secondary: '#a86f00', roof: '#44444f' };
    case 'RARE':
      return { primary: '#1e1e24', secondary: '#ffb000', roof: '#44444f' };
    case 'LEGENDARY':
      return { primary: '#f2ebdd', secondary: '#ffb000', roof: '#ffd27a' };
  }
}

/**
 * Builds one of the 6 composite 3D trains facing +Z (length along Z, width along X).
 * Rotate group.rotation.y = Math.PI / 2 in side-on views so +Z faces +X (right).
 */
export function buildTrainModel(
  tier: RarityTier,
  liveryId: TrainLiveryId = 'heritage',
): BuiltTrain {
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const palette = getLiveryColors(tier, liveryId);
  let roofHeight = 2.05;
  const chimneyPos = new THREE.Vector3(0, 2.5, 1.8);

  if (tier === 'INVALID') {
    return { group, roofHeight: 0, wheels, chimneyPos };
  }

  group.add(createContactShadowMesh(1.25, 3.6, 0.45));

  const chassisMat = createN64Material({
    color: '#1e293b',
    roughness: 0.5,
    metalness: 0.6,
  });
  const bodyMat = createN64Material({
    color: palette.primary,
    roughness: 0.72,
    metalness: 0.12,
  });
  const accentMat = createN64Material({
    color: palette.secondary,
    roughness: 0.35,
    metalness: 0.4,
  });
  const roofMat = createN64Material({
    color: palette.roof,
    roughness: 0.78,
    metalness: 0.1,
  });
  const wheelMat = createN64Material({
    color: '#334155',
    roughness: 0.35,
    metalness: 0.75,
  });
  // Warm lit carriage windows — night trains glow amber
  const glassMat = createN64Material({
    color: '#ffd27a',
    emissive: '#a86f00',
    emissiveIntensity: 0.9,
  });

  // Base chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 6.4), chassisMat);
  chassis.position.set(0, 0.42, 0);
  group.add(chassis);

  // 6 wheels (3 pairs)
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 8);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const wz of [-2.2, 0, 2.2]) {
    for (const wx of [-0.92, 0.92]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, 0.32, wz);
      group.add(w);
      wheels.push(w);
    }
  }

  if (tier === 'COMMON') {
    // Shabby & old Stopping Service (weathered steam/railbus hybrid with crooked stack & patch)
    const boiler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.72, 3.4, 7),
      bodyMat,
    );
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.25, 0.9);
    group.add(boiler);

    const rustBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.74, 0.74, 0.28, 7),
      createN64Material({ color: '#9a3412', roughness: 0.9 }),
    );
    rustBand.rotation.x = Math.PI / 2;
    rustBand.position.set(0, 1.25, 1.6);
    group.add(rustBand);

    // Crooked old smokestack
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.16, 0.85, 6),
      chassisMat,
    );
    funnel.position.set(0, 2.25, 2.05);
    funnel.rotation.z = 0.08;
    group.add(funnel);
    chimneyPos.set(0, 2.65, 2.05);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 2.0), bodyMat);
    cab.position.set(0, 1.32, -1.7);
    group.add(cab);

    // Mismatched metal repair patch
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(1.96, 0.45, 0.7),
      createN64Material({ color: '#64748b', roughness: 0.85 }),
    );
    patch.position.set(0, 1.1, -1.4);
    patch.rotation.x = 0.04;
    group.add(patch);

    const cabWindow = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.42, 0.9), glassMat);
    cabWindow.position.set(0, 1.62, -1.7);
    group.add(cabWindow);

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.14, 2.15), roofMat);
    cabRoof.position.set(0, 2.12, -1.7);
    cabRoof.rotation.z = -0.03;
    group.add(cabRoof);

    const dimLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.18),
      createN64Material({
        color: '#fde68a',
        emissive: '#d97706',
        emissiveIntensity: 0.55,
        roughness: 0.4,
      }),
    );
    dimLamp.position.set(0, 1.4, 2.68);
    group.add(dimLamp);

    roofHeight = 2.2;
  } else if (tier === 'FAKE_DEEP') {
    // Local Diesel Shunter
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.15, 3.6), bodyMat);
    hood.position.set(0, 1.15, 1.0);
    group.add(hood);

    const hazardNose = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 1.05, 0.4),
      accentMat,
    );
    hazardNose.position.set(0, 1.1, 2.95);
    group.add(hazardNose);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.92, 1.6, 1.9), bodyMat);
    cab.position.set(0, 1.38, -1.6);
    group.add(cab);

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 2.05), roofMat);
    cabRoof.position.set(0, 2.22, -1.6);
    group.add(cabRoof);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.48, 0.9),
      glassMat,
    );
    windshield.position.set(0, 1.75, -1.5);
    group.add(windshield);

    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.55, 6),
      chassisMat,
    );
    exhaust.position.set(0, 1.95, 1.6);
    group.add(exhaust);
    chimneyPos.set(0, 2.25, 1.6);

    roofHeight = 2.29;
  } else if (tier === 'UNCOMMON') {
    // Semi-Fast Regional Flyer
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.45, 5.6), bodyMat);
    body.position.set(0, 1.32, -0.1);
    group.add(body);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.2, 0.9), accentMat);
    nose.position.set(0, 1.2, 2.85);
    nose.rotation.x = -0.18;
    group.add(nose);

    const windowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.45, 4.6),
      glassMat,
    );
    windowStrip.position.set(0, 1.5, -0.1);
    group.add(windowStrip);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.18, 5.8), roofMat);
    roof.position.set(0, 2.12, 0);
    group.add(roof);

    const panto = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.6), accentMat);
    panto.position.set(0, 2.34, 1.3);
    group.add(panto);
    chimneyPos.set(0, 2.4, -1.5);

    roofHeight = 2.21;
  } else if (tier === 'RARE') {
    // Express
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.96, 1.42, 5.4), bodyMat);
    body.position.set(0, 1.3, -0.3);
    group.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.04, 0.24, 5.45),
      accentMat,
    );
    stripe.position.set(0, 1.0, -0.25);
    group.add(stripe);

    const windowBand = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.36, 4.4),
      glassMat,
    );
    windowBand.position.set(0, 1.52, -0.35);
    group.add(windowBand);

    const wedge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.25, 1.5, 4),
      bodyMat,
    );
    wedge.rotation.x = Math.PI / 2;
    wedge.rotation.z = Math.PI / 4;
    wedge.scale.set(1.1, 1, 0.72);
    wedge.position.set(0, 1.15, 2.95);
    group.add(wedge);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.38, 0.8), glassMat);
    visor.position.set(0, 1.48, 2.38);
    visor.rotation.x = 0.25;
    group.add(visor);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 5.5), roofMat);
    roof.position.set(0, 2.08, -0.3);
    group.add(roof);

    const headlights = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.15),
      createN64Material({
        color: '#fef9c3',
        emissive: '#facc15',
        emissiveIntensity: 1.0,
      }),
    );
    headlights.position.set(0, 0.88, 3.55);
    group.add(headlights);

    roofHeight = 2.16;
  } else {
    // LEGENDARY Non-Stop Bullet
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.92, 1.32, 5.2), bodyMat);
    body.position.set(0, 1.25, -0.4);
    group.add(body);

    const roofFairing = new THREE.Mesh(
      new THREE.BoxGeometry(1.56, 0.24, 5.15),
      roofMat,
    );
    roofFairing.position.set(0, 2.02, -0.4);
    group.add(roofFairing);

    const roofRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.14, 4.4),
      createN64Material({
        color: palette.secondary,
        emissive: palette.secondary,
        emissiveIntensity: 0.45,
        roughness: 0.25,
      }),
    );
    roofRidge.position.set(0, 2.16, -0.5);
    group.add(roofRidge);

    const noseCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 2.2, 6),
      bodyMat,
    );
    noseCone.rotation.x = Math.PI / 2;
    noseCone.scale.set(1.05, 1, 0.7);
    noseCone.position.set(0, 1.05, 3.25);
    group.add(noseCone);

    const glowMat = createN64Material({
      color: palette.secondary,
      emissive: palette.secondary,
      emissiveIntensity: 1.1,
      roughness: 0.15,
    });
    const energyStrip = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.18, 5.5),
      glowMat,
    );
    energyStrip.position.set(0, 1.05, -0.2);
    group.add(energyStrip);

    const windowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.98, 0.3, 4.2),
      glassMat,
    );
    windowStrip.position.set(0, 1.44, -0.5);
    group.add(windowStrip);

    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.34, 1.2),
      glassMat,
    );
    cockpit.position.set(0, 1.48, 2.15);
    cockpit.rotation.x = 0.28;
    group.add(cockpit);

    const underGlow = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.1, 5.6),
      glowMat,
    );
    underGlow.position.set(0, 0.25, 0);
    group.add(underGlow);

    roofHeight = 2.15;
  }

  return { group, roofHeight, wheels, chimneyPos };
}

export function buildCartridgeModel(
  colors: {
    shell: string;
    labelBg: string;
    labelAccent: string;
    stripe: string;
  },
  title: string,
  locked: boolean,
): THREE.Group {
  const group = new THREE.Group();

  const shellMat = createN64Material({
    color: colors.shell,
    roughness: 0.65,
    metalness: 0.12,
  });
  const darkMetal = createN64Material({
    color: '#1e293b',
    roughness: 0.35,
    metalness: 0.65,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 0.42), shellMat);
  body.position.y = 0.9;
  group.add(body);

  const topShoulder = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.28, 0.42),
    shellMat,
  );
  topShoulder.position.y = 1.88;
  group.add(topShoulder);

  const ridgeGeo = new THREE.BoxGeometry(0.28, 0.22, 0.46);
  const ridgeL = new THREE.Mesh(ridgeGeo, shellMat);
  ridgeL.position.set(-0.88, 1.72, 0);
  const ridgeR = new THREE.Mesh(ridgeGeo, shellMat);
  ridgeR.position.set(0.88, 1.72, 0);
  group.add(ridgeL, ridgeR);

  const pins = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.16, 0.24),
    darkMetal,
  );
  pins.position.y = 0.05;
  group.add(pins);

  const labelTex = createCrispSignTexture(384, 288, (ctx, w, h) => {
    ctx.fillStyle = colors.labelBg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colors.stripe;
    ctx.fillRect(0, 0, w, 24);
    ctx.fillRect(0, h - 18, w, 18);

    if (locked) {
      // Bold padlock icon in upper emblem zone
      ctx.fillStyle = '#facc15';
      ctx.fillRect(160, 62, 64, 48);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 10;
      ctx.strokeRect(172, 36, 40, 30);
      ctx.fillStyle = '#0b101d';
      ctx.fillRect(186, 78, 12, 18);
    } else {
      // Train silhouette badge in upper emblem zone
      ctx.fillStyle = colors.labelAccent;
      ctx.fillRect(76, 46, 212, 40);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(264, 54, 24, 24);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(96, 86, 26, 14);
      ctx.fillRect(172, 86, 26, 14);
      ctx.fillRect(242, 86, 26, 14);
    }

    // High-contrast dark title banner
    ctx.fillStyle = '#060a12';
    ctx.fillRect(10, 124, w - 20, 134);
    ctx.strokeStyle = colors.labelAccent;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 124, w - 20, 134);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = title.toUpperCase().split(' ');
    const twoLines = title.length > 10 && words.length >= 2;
    const drawCrispText = (text: string, x: number, y: number, maxFontPx: number) => {
      let fontPx = maxFontPx;
      ctx.font = `700 ${fontPx}px "Silkscreen", "Courier New", monospace`;
      while (fontPx > 24 && ctx.measureText(text).width > w - 40) {
        fontPx -= 2;
        ctx.font = `700 ${fontPx}px "Silkscreen", "Courier New", monospace`;
      }
      ctx.fillStyle = '#020409';
      ctx.fillText(text, x + 3, y + 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, y);
    };

    if (twoLines) {
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(' ');
      const line2 = words.slice(mid).join(' ');
      drawCrispText(line1, w / 2, 168, 38);
      drawCrispText(line2, w / 2, 218, 38);
    } else {
      drawCrispText(title.toUpperCase(), w / 2, 192, 46);
    }
  });

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 1.38),
    new THREE.MeshBasicMaterial({
      map: labelTex,
      toneMapped: false,
    }),
  );
  label.position.set(0, 0.98, 0.235);
  group.add(label);

  const backPlate = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.04),
    createN64Material({ color: '#475569', roughness: 0.78 }),
  );
  backPlate.position.set(0, 1.0, -0.215);
  group.add(backPlate);

  return group;
}

export function buildStationSignboard(
  stationIndex: number,
  stationName: string,
  accentHex: string = '#facc15',
): THREE.Group {
  const g = new THREE.Group();
  const postMat = createN64Material({ color: '#1e293b', roughness: 0.7 });
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), postMat);
  postL.position.set(-1.75, 1.15, -0.03);
  const postR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), postMat);
  postR.position.set(1.75, 1.15, -0.03);

  // High-contrast British-style running-in board: amber header band, big
  // charcoal name on a cream face. Drawn at 2x so it stays sharp.
  const tex = createCrispSignTexture(1024, 344, (ctx, w, h) => {
    void accentHex;
    ctx.fillStyle = '#f2ebdd';
    ctx.fillRect(0, 0, w, h);

    const band = 96;
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, band, w, 8);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1e1e24';
    ctx.font = '900 60px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(`STATION ${String(stationIndex).padStart(2, '0')}`, w / 2, band / 2 + 2);

    const upperName = stationName.toUpperCase();
    const maxW = w - 72;
    let nameSize = 110;
    const setFont = () => {
      ctx.font = `700 ${nameSize}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    };
    setFont();
    while (nameSize > 40 && ctx.measureText(upperName).width > maxW) {
      nameSize -= 4;
      setFont();
    }
    ctx.fillText(upperName, w / 2, band + 8 + (h - band - 8) / 2 + 4);

    ctx.strokeStyle = '#1e1e24';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(4.25, 1.48, 0.14),
    createN64Material({ color: '#1e293b', roughness: 0.65, wobbleGrid: 0 }),
  );
  frame.position.set(0, 2.08, 0);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(4.16, 1.4),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }),
  );
  face.position.set(0, 2.08, 0.095);

  g.add(postL, postR, frame, face);
  return g;
}

export function buildIntermediatePlatformProp(
  stationIndex: number,
  stationLabel: string,
  biome: BiomeConfig,
): THREE.Group {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.45, 2.2),
    createN64Material({ color: '#475569', roughness: 0.88 }),
  );
  deck.position.set(0, 0.22, 0);
  g.add(deck);

  const yellowStrip = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.04, 0.18),
    createN64Material({ color: '#facc15', roughness: 0.5 }),
  );
  yellowStrip.position.set(0, 0.45, 0.98);
  g.add(yellowStrip);

  // Small station name sign that blurs past with true station index
  const sign = buildStationSignboard(stationIndex, stationLabel, biome.accentHex);
  sign.scale.setScalar(0.72);
  sign.position.set(0, 0.44, -0.5);
  g.add(sign);

  // 3 tiny low-poly waiting passengers standing on the skipped platform
  const coatHexes = ['#d72638', '#8a8478', '#a86f00'];
  for (let i = 0; i < 3; i++) {
    const px = -1.6 + i * 1.55;
    const coat = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.52, 0.24),
      createN64Material({ color: coatHexes[i], roughness: 0.78 }),
    );
    coat.position.set(px, 0.7, 0.35);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.24),
      createN64Material({ color: '#f4c7a1', roughness: 0.8 }),
    );
    head.position.set(px, 1.08, 0.35);
    g.add(coat, head);
  }

  return g;
}

export function buildTreeProp(snowy: boolean = false, treeColor: string = '#2e2e37'): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 1.4, 5),
    createN64Material({ color: '#5c3a21', roughness: 0.92 }),
  );
  trunk.position.y = 0.7;
  const foliageMat = createN64Material({
    color: snowy ? '#dbeafe' : treeColor,
    roughness: 0.88,
  });
  const tier1 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.9, 6), foliageMat);
  tier1.position.y = 2.0;
  const tier2 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 6), foliageMat);
  tier2.position.y = 3.0;
  g.add(trunk, tier1, tier2);
  return g;
}

export function buildCottageProp(): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.7, 2.0),
    createN64Material({ color: '#e2d6be', roughness: 0.88 }),
  );
  wall.position.y = 0.85;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.9, 1.2, 4),
    createN64Material({ color: '#9f3b2e', roughness: 0.82 }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.25;
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.9, 0.35),
    createN64Material({ color: '#64748b', roughness: 0.85 }),
  );
  chimney.position.set(0.65, 2.35, -0.35);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.8, 0.08),
    createN64Material({ color: '#451a03', roughness: 0.85 }),
  );
  door.position.set(0, 0.4, 1.02);
  g.add(wall, roof, chimney, door);
  return g;
}
