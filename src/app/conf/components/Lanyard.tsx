"use client";

import { Canvas, extend, useFrame, useThree, type ThreeElement } from "@react-three/fiber";
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
  type RapierRigidBody,
  type RigidBodyProps,
} from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import { drawBack, drawBand, drawFront, loadBadgeArt, newCanvas, type BadgeArt } from "./badgeArt";

extend({ MeshLineGeometry, MeshLineMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    meshLineGeometry: ThreeElement<typeof MeshLineGeometry>;
    meshLineMaterial: ThreeElement<typeof MeshLineMaterial>;
  }
}

/*
 * The badge on its lanyard: a rope of three rigid links hanging from a fixed
 * point above the canvas, the card on a ball joint at the end. Adapted from
 * Vercel's Ship badge (vercel.com/blog/building-an-interactive-3d-event-badge-with-react-three-fiber),
 * with the card built from canvas textures instead of a model.
 */

/* World units: the printed badge's proportions */
const CARD_W = 1.6;
const CARD_H = 2.25;
/* Where the band meets the clip, above the card's center */
const CLIP_Y = 1.45;
const METAL = { color: "#d8d8d8", metalness: 0.7, roughness: 0.25 };

const SEGMENT: RigidBodyProps = {
  type: "dynamic",
  canSleep: true,
  colliders: false,
  angularDamping: 2,
  linearDamping: 2,
};

type LanyardProps = {
  /** The layout column the badge hangs over; the canvas itself is wider so a swing isn't cut off */
  column: RefObject<HTMLElement | null>;
  name: string;
  /** Stops rendering and physics while the section is off screen */
  paused: boolean;
  /** Which face the card settles on */
  side: "front" | "back";
  /** Bump to spin the card (the release celebration) */
  spin: number;
  reducedMotion: boolean;
};

export default function Lanyard({ column, name, paused, side, spin, reducedMotion }: LanyardProps) {
  const [art, setArt] = useState<BadgeArt | null>(null);

  useEffect(() => {
    let live = true;
    void loadBadgeArt().then((loaded) => live && setArt(loaded));

    return () => {
      live = false;
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 25 }}
      dpr={[1, 2]}
      // No tone mapping: the brand colors print as they are
      flat
      frameloop={paused ? "never" : "always"}
      // Vertical swipes keep scrolling the page; sideways ones swing the badge
      style={{ touchAction: "pan-y" }}
    >
      <ambientLight intensity={Math.PI} />
      <StudioLights />
      <Framing column={column} />
      {art && (
        <Physics gravity={[0, -40, 0]} interpolate paused={paused} timeStep={1 / 60}>
          <Band art={art} name={name} reducedMotion={reducedMotion} side={side} spin={spin} />
        </Physics>
      )}
    </Canvas>
  );
}

/* Light strips around the badge, after the Ship badge's Lightformers, in a dark room: the gloss
   catches streaks of light and the black stays black. Rendered once into the scene's reflections. */
const STRIPS: {
  intensity: number;
  position: THREE.Vector3Tuple;
  rotation: THREE.Vector3Tuple;
  scale: THREE.Vector3Tuple;
}[] = [
  { intensity: 2, position: [0, -1, 5], rotation: [0, 0, Math.PI / 3], scale: [100, 0.1, 1] },
  { intensity: 3, position: [-1, -1, 1], rotation: [0, 0, Math.PI / 3], scale: [100, 0.1, 1] },
  { intensity: 3, position: [1, 1, 1], rotation: [0, 0, Math.PI / 3], scale: [100, 0.1, 1] },
  { intensity: 2, position: [-10, 0, 14], rotation: [0, Math.PI / 2, Math.PI / 3], scale: [100, 10, 1] },
];

function StudioLights() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const room = new THREE.Scene();
    const plane = new THREE.PlaneGeometry();
    for (const { intensity, position, rotation, scale } of STRIPS) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setScalar(intensity),
        side: THREE.DoubleSide,
      });
      const strip = new THREE.Mesh(plane, material);
      strip.position.set(...position);
      strip.rotation.set(...rotation);
      strip.scale.set(...scale);
      room.add(strip);
    }
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(room).texture;
    plane.dispose();
    room.children.forEach((strip) => ((strip as THREE.Mesh).material as THREE.Material).dispose());
    scene.environment = env;

    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

/* Pans the camera so the badge (world x = 0) hangs over the center of its column, wherever that sits in the wider canvas */
function Framing({ column }: { column: RefObject<HTMLElement | null> }) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    const box = column.current?.getBoundingClientRect();
    if (!box || !(camera instanceof THREE.PerspectiveCamera)) return;
    // R3F's measure of the canvas (kept current on resize and scroll); the <canvas> itself isn't in the page yet on mount
    const offset = box.left + box.width / 2 - (size.left + size.width / 2);
    const pxPerUnit = size.height / (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.x = -offset / pxPerUnit;
  }, [camera, column, size]);

  return null;
}

function texture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;

  return tex;
}

/*
 * meshline gives each end of the line itself as its missing neighbour and its shader
 * spots that with an exact float ==, which some GPUs miss by a rounding error: the end
 * then gets a near-zero direction and twists into a wedge across the tab. A mirrored
 * neighbour (2·end − next) gives the end the same direction as the segment beside it.
 */
function mirrorEnds(geometry: MeshLineGeometry) {
  const position = geometry.getAttribute("position").array;
  const previous = geometry.getAttribute("previous");
  const next = geometry.getAttribute("next");
  // Two vertices per point, three floats each
  const last = position.length - 6;
  for (let k = 0; k < 3; k++) {
    previous.array[k] = previous.array[3 + k] = 2 * position[k] - position[6 + k];
    next.array[last + k] = next.array[last + 3 + k] = 2 * position[last + k] - position[last - 6 + k];
  }
  previous.needsUpdate = true;
  next.needsUpdate = true;
}

type BandProps = Omit<LanyardProps, "paused" | "column"> & { art: BadgeArt };

function Band({ art, name, side, spin, reducedMotion }: BandProps) {
  const band = useRef<THREE.Mesh<MeshLineGeometry, MeshLineMaterial>>(null);
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  /* The card as drawn: already moved to this frame's interpolated pose when the band reads it */
  const cardMesh = useRef<THREE.Group>(null!);
  const lerped = useRef(new Map<RapierRigidBody, THREE.Vector3>());
  const [scratch] = useState(() => ({ vec: new THREE.Vector3(), dir: new THREE.Vector3() }));
  const [curve] = useState(() => {
    const points = Array.from({ length: 5 }, () => new THREE.Vector3());
    return new THREE.CatmullRomCurve3(points, false, "chordal");
  });
  const [dragged, drag] = useState<THREE.Vector3 | false>(false);
  const [hovered, hover] = useState(false);
  const { width, height } = useThree((state) => state.size);
  // The constructor demands a resolution; the prop below keeps it in step with the canvas size
  const [lineArgs] = useState((): [{ resolution: THREE.Vector2 }] => [
    { resolution: new THREE.Vector2(width, height) },
  ]);

  const textures = useMemo(() => {
    // Tile proportions match a stretch of band, so the logos aren't squashed
    const strap = texture(drawBand(newCanvas(800, 128), art));
    strap.wrapS = strap.wrapT = THREE.RepeatWrapping;

    return { front: texture(newCanvas()), back: texture(drawBack(newCanvas(), art)), strap };
  }, [art]);

  useEffect(() => () => Object.values(textures).forEach((tex) => tex.dispose()), [textures]);

  useEffect(() => {
    drawFront(textures.front.image as HTMLCanvasElement, art, name);
    textures.front.needsUpdate = true;
  }, [art, name, textures]);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [
    [0, 0, 0],
    [0, CLIP_Y, 0],
  ]);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = dragged ? "grabbing" : "grab";

    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered, dragged]);

  useEffect(() => {
    if (!spin || !card.current) return;
    card.current.wakeUp();
    card.current.applyImpulse({ x: 0, y: 6, z: 0 }, true);
    card.current.setAngvel({ x: 0, y: 26, z: 0 }, true);
  }, [spin]);

  useFrame((state, delta) => {
    // A slow or stalled frame (old phone, background tab) counts as a short one
    const dt = Math.min(delta, 1 / 20);
    if (!fixed.current || !j1.current || !j2.current || !card.current || !cardMesh.current || !band.current) return;
    const { vec, dir } = scratch;

    if (dragged) {
      // Where the pointer's ray meets the card's plane (z = 0)
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position);
      vec.copy(state.camera.position).addScaledVector(dir, -state.camera.position.z / dir.z);
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }

    // Smooths the band's middle points, which jitter when the card is pulled hard
    for (const joint of [j1.current, j2.current]) {
      const target = joint.translation();
      const smoothed = lerped.current.get(joint) ?? new THREE.Vector3().copy(target);
      lerped.current.set(joint, smoothed);
      const distance = Math.max(0.1, Math.min(1, smoothed.distanceTo(target)));
      // Capped at 1: past 2 the lerp overshoots further every frame and the band blows up to NaN
      smoothed.lerp(target, Math.min(1, dt * (10 + distance * 40)));
    }
    // The band ends on the tab and leaves it along the card's axis, like a strap stitched into it:
    // following the card's drawn pose keeps the end flush with the tab instead of a loose physics point
    cardMesh.current.updateWorldMatrix(true, false);
    cardMesh.current.localToWorld(curve.points[0].set(0, CLIP_Y, 0));
    cardMesh.current.localToWorld(curve.points[1].set(0, CLIP_Y + 0.3, 0));
    curve.points[2].copy(lerped.current.get(j2.current)!);
    curve.points[3].copy(lerped.current.get(j1.current)!);
    curve.points[4].copy(fixed.current.translation());
    // Evenly spaced by length: meshline lays the texture out per point, so getPoints (even per segment)
    // would crush the logos into the short stretch by the tab. The points move every frame, so re-measure.
    curve.updateArcLengths();
    band.current.geometry.setPoints(curve.getSpacedPoints(32));
    mirrorEnds(band.current.geometry);

    // Turns the card back to its face: twist around the vertical axis, wrapped to [-π, π]
    const q = card.current.rotation();
    const twist = (side === "back" ? Math.PI : 0) - 2 * Math.atan2(q.y, q.w);
    const error = Math.atan2(Math.sin(twist), Math.cos(twist));
    const ang = card.current.angvel();
    card.current.setAngvel({ x: ang.x, y: ang.y + error * 7.5 * dt, z: ang.z }, true);
  });

  // Starts sideways and falls in swinging; hangs still from the start for reduced motion
  const at = (i: number): [number, number, number] => (reducedMotion ? [0, -i, 0] : [i * 0.5, 0, 0]);

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...SEGMENT} type="fixed" />
        <RigidBody ref={j1} position={at(1)} {...SEGMENT}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={j2} position={at(2)} {...SEGMENT}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={j3} position={at(3)} {...SEGMENT}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          ref={card}
          position={reducedMotion ? [0, -3 - CLIP_Y, 0] : at(4)}
          {...SEGMENT}
          type={dragged ? "kinematicPosition" : "dynamic"}
        >
          <CuboidCollider args={[CARD_W / 2, CARD_H / 2, 0.01]} />
          <group
            ref={cardMesh}
            onPointerCancel={() => drag(false)}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              drag(new THREE.Vector3().copy(e.point).sub(scratch.vec.copy(card.current!.translation())));
            }}
            onPointerOut={() => hover(false)}
            onPointerOver={() => hover(true)}
            onPointerUp={(e) => {
              (e.target as Element).releasePointerCapture(e.pointerId);
              drag(false);
            }}
          >
            <Card back={textures.back} front={textures.front} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          args={lineArgs}
          depthTest={false}
          lineWidth={1.6}
          map={textures.strap}
          repeat={[-1.5, 1]}
          resolution={[width, height]}
          useMap={1}
        />
      </mesh>
    </>
  );
}

function Card({ front, back }: { front: THREE.Texture; back: THREE.Texture }) {
  const finish = {
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 0.5,
    alphaTest: 0.5,
  };

  return (
    <>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshPhysicalMaterial {...finish} map={front} />
      </mesh>
      <mesh position={[0, 0, -0.004]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshPhysicalMaterial {...finish} map={back} />
      </mesh>
      {/* The OWU lanyard's hardware: the strap folds into a tab with a rivet, a split ring, and the clasp through the slot */}
      <mesh position={[0, CLIP_Y - 0.09, 0]}>
        <boxGeometry args={[0.34, 0.18, 0.035]} />
        <meshStandardMaterial color="#111111" roughness={0.55} />
      </mesh>
      <mesh position={[0, CLIP_Y - 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.036, 0.036, 0.06, 20]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, CLIP_Y - 0.2, 0]}>
        <torusGeometry args={[0.055, 0.011, 10, 32]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 1.115, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1, 1.15, 1]}>
        <torusGeometry args={[0.072, 0.016, 12, 32]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
    </>
  );
}
