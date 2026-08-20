import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { AREAS, areaById, type AreaId } from "../../lib/walkthrough";
import { HouseModel } from "./HouseModel";

/**
 * The property, and a camera you actually drive.
 *
 * This reverses the original rule that there were no orbit controls. That rule
 * was right when the tab was six composed shots; it is wrong now that the scene
 * is a property with a household's coverage standing on it, because inspecting
 * a thing means going and looking at it from where you want.
 *
 * The waypoints survive as *shortcuts*, not as the only way to move: choosing an
 * area flies you there, and you are free from wherever you land.
 */

/** Seconds to cover the distance. Slow enough to read as deliberate. */
const TRAVEL = 1.15;

/** Ease-in-out. Cinematic means it starts and ends still, not that it is slow. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Flies to a waypoint, then gets out of the way.
 *
 * The controls own the camera the rest of the time, so the tween takes them
 * offline for its duration and hands back cleanly — moving `controls.target`
 * alongside the position, or the camera would arrive pointing at wherever you
 * were last looking.
 */
function CameraRig({
  area,
  reduced,
  controls,
}: {
  area: AreaId;
  reduced: boolean;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, invalidate } = useThree();

  const from = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const elapsed = useRef(Infinity);
  // Skip the flight on first mount: the camera already starts on the waypoint,
  // and a fly-in from nowhere on arrival reads as a loading artefact.
  const mounted = useRef(false);

  useEffect(() => {
    const wp = areaById(area).camera;
    const c = controls.current;

    if (!mounted.current) {
      mounted.current = true;
      if (c) {
        c.target.set(...wp.target);
        c.update();
      }
      return;
    }

    to.current.set(...wp.position);
    toTarget.current.set(...wp.target);

    if (reduced || !c) {
      camera.position.copy(to.current);
      c?.target.copy(toTarget.current);
      c?.update();
      camera.lookAt(toTarget.current);
      elapsed.current = Infinity;
      invalidate();
      return;
    }

    from.current.copy(camera.position);
    fromTarget.current.copy(c.target);
    elapsed.current = 0;
    c.enabled = false;
  }, [area, camera, reduced, controls, invalidate]);

  useFrame((_, delta) => {
    if (elapsed.current === Infinity) return;
    const c = controls.current;

    elapsed.current = Math.min(TRAVEL, elapsed.current + delta);
    const t = easeInOutCubic(elapsed.current / TRAVEL);

    camera.position.lerpVectors(from.current, to.current, t);
    if (c) {
      c.target.lerpVectors(fromTarget.current, toTarget.current, t);
      c.update();
    } else {
      camera.lookAt(toTarget.current);
    }

    if (elapsed.current >= TRAVEL) {
      elapsed.current = Infinity;
      if (c) c.enabled = true;
    }
  });

  return null;
}

/**
 * The sky.
 *
 * Hand-rolled rather than drei's <Sky>, which renders a sphere at a default
 * distance of 450,000 — far outside this camera's 300-unit far plane, so it was
 * clipped away entirely and what looked like a washed-out sky was the flat
 * clear colour behind it. A dome sized to the scene cannot be clipped, cannot
 * fetch anything, and gives exact control over the horizon.
 */
function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#3f7cc0") },
          middle: { value: new THREE.Color("#9dc2e0") },
          bottom: { value: new THREE.Color("#dfe8ee") },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 middle;
          uniform vec3 bottom;
          varying vec3 vPos;
          void main() {
            float h = normalize(vPos).y;
            vec3 c = h > 0.0
              ? mix(middle, top, pow(clamp(h, 0.0, 1.0), 0.65))
              : mix(middle, bottom, clamp(-h * 3.0, 0.0, 1.0));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    [],
  );

  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[240, 32, 20]} />
    </mesh>
  );
}

/**
 * Ambient life.
 *
 * One key light walking slowly around the property — the only thing in the
 * scene that moves on its own. It carries no information; it exists so the
 * render feels lit rather than rendered. Nothing spins, bobs or pulses.
 */
function DriftingSun({ reduced }: { reduced: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (reduced || !light.current) return;
    // A full circuit takes about three minutes: present when you watch for it,
    // invisible when you are working.
    t.current += delta * 0.035;
    // An arc across the sky rather than a full circle. A sun that travels all
    // the way round passes below the lot and the whole property goes dark,
    // which is not "ambient" — it is a light switch.
    const a = Math.sin(t.current) * 0.85;
    const r = 17;
    light.current.position.set(Math.sin(a) * r, 12 + Math.cos(a) * 3, Math.cos(a) * r * 0.55 + 4);
  });

  return (
    <directionalLight
      ref={light}
      position={[9, 12, 7]}
      intensity={3.4}
      color="#fff4e0"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-camera-left={-26}
      shadow-camera-right={26}
      shadow-camera-top={26}
      shadow-camera-bottom={-26}
      shadow-camera-far={80}
    />
  );
}

/**
 * A hotspot marker.
 *
 * Small, unlit, and it does not pulse or spin. It reads as an annotation on a
 * drawing rather than a pickup in a game.
 */
function Hotspot({
  id,
  label,
  position,
  active,
  onSelect,
}: {
  id: AreaId;
  label: string;
  position: [number, number, number];
  active: boolean;
  onSelect: (id: AreaId) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position}>
      {/* No distanceFactor on purpose. Scaling a control with camera distance
          makes its hit area shrink to a few pixels on the wide shots and its
          label unreadable; a fixed screen size keeps every marker the same
          honest target, and reads as an annotation on a drawing rather than an
          object floating in the world. */}
      <Html center zIndexRange={[8, 0]}>
        <button
          type="button"
          className={`wt-hotspot${active ? " is-active" : ""}${hovered ? " is-hover" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(id);
          }}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          aria-label={`View ${label}`}
        >
          <span className="wt-hotspot-dot" aria-hidden="true" />
          <span className="wt-hotspot-label">{label}</span>
        </button>
      </Html>
    </group>
  );
}

interface SceneProps {
  area: AreaId;
  onSelect: (id: AreaId) => void;
  /** Hotspots are hidden on the overhead shot, where they would crowd. */
  showHotspots: boolean;
}

export default function Scene({ area, onSelect, showHotspots }: SceneProps) {
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const controls = useRef<OrbitControlsImpl>(null);
  const start = areaById(area).camera;

  return (
    <Canvas
      // "percentage" is PCFShadowMap. Plain `shadows` defaults to PCFSoft,
      // which three deprecated in 0.185 and warns about on every mount.
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: start.position, fov: 38, near: 0.05, far: 300 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      // The sun drifts, so there is always something to draw. Under reduced
      // motion nothing moves by itself and frames are rendered on demand.
      frameloop={reduced ? "demand" : "always"}
    >
      {/* Daylight. The sky is procedural rather than an image, so the horizon
          costs nothing to load and cannot fail on a bad network. Fog is tuned
          to the sky's own colour so distant ground fades into it instead of
          ending at a hard edge. */}
      <color attach="background" args={["#9dc2e0"]} />
      {/* Fog matched to the dome's horizon band, so distant ground dissolves
          into the sky instead of ending at a visible edge. */}
      <fog attach="fog" args={["#c7d9e6", 70, 210]} />
      <SkyDome />

      {/* No <SoftShadows>: it patches three's shadow shader chunk and the
          version in three 0.185 no longer exposes `unpackRGBAToDepth` with the
          signature it expects, so every standard material silently fails to
          compile and the scene renders untextured. Softness comes from the
          light's own radius plus the ContactShadows plane below. */}
      {/* Sky above, bounced green from the lawn below. */}
      <hemisphereLight args={["#a9c8e6", "#59613f", 0.8]} />
      <ambientLight intensity={0.14} />
      <DriftingSun reduced={reduced} />

      <Suspense fallback={null}>
        <HouseModel />
        <ContactShadows position={[0, 0.014, 0]} opacity={0.55} scale={46} blur={2.2} far={12} resolution={1024} />
        <Environment preset="park" environmentIntensity={0.5} />
      </Suspense>

      {showHotspots &&
        AREAS.map((a) => (
          <Hotspot
            key={a.id}
            id={a.id}
            label={a.label}
            position={a.hotspot}
            active={a.id === area}
            onSelect={onSelect}
          />
        ))}

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        // Close enough to step inside a room, far enough to see the whole lot.
        minDistance={0.6}
        maxDistance={46}
        // Just above the horizon: you can crouch to the foundation line, but
        // never end up underneath the ground looking up at nothing.
        maxPolarAngle={Math.PI * 0.495}
        panSpeed={0.7}
        rotateSpeed={0.55}
        zoomSpeed={0.75}
        target={start.target}
      />

      <CameraRig area={area} reduced={reduced} controls={controls} />
    </Canvas>
  );
}
