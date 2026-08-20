import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * A modelled house, fitted to the lot.
 *
 * Deliberately generic. Nothing here knows which house it is loading, because
 * the point is that a household picks its own — a colonial, a ranch, a
 * lakefront cottage — and the driveway, the waypoints and every coverage object
 * carry on working around whichever one arrives.
 *
 * That means the model has to be normalised rather than trusted. A generated
 * GLB comes back at an arbitrary scale (the first one measured 0.72 units tall)
 * with an arbitrary origin, so this measures its bounding box and then:
 *
 * - scales it so its larger footprint dimension matches the lot,
 * - centres it on the origin in X and Z,
 * - drops it so its lowest point rests exactly on the ground.
 *
 * Get that right once and swapping models is genuinely a one-line change.
 */

/** Roughly the footprint the waypoints and driveway were built around. */
export const LOT_WIDTH = 9.2;

/** What a fitted house actually occupies, in scene units. */
export interface HouseFit {
  width: number;
  depth: number;
  height: number;
  /** World-space extents after fitting. */
  min: [number, number, number];
  max: [number, number, number];
}

interface HouseGLBProps {
  url: string;
  /** Larger footprint dimension after fitting, in scene units. */
  targetWidth?: number;
  /** Radians about Y. Generated models do not agree on which way is "front". */
  rotation?: number;
  /**
   * Reports what the house ended up occupying.
   *
   * The scene needs this rather than assuming: the umbrella has to float above
   * the actual ridge, and a ranch and a two-storey colonial do not have the
   * same ridge. Guessing a height works until the first model that is taller.
   */
  onFit?: (fit: HouseFit) => void;
}

export function HouseGLB({ url, targetWidth = LOT_WIDTH, rotation = 0, onFit }: HouseGLBProps) {
  // Draco is off on purpose: drei fetches its decoder from a Google CDN, and
  // this scene is built so nothing it needs can fail on a bad network. The
  // models are meshopt-compressed instead, and that decoder ships in the bundle.
  const { scene } = useGLTF(url, false, true);
  const fitRef = useRef<HouseFit | null>(null);
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  const fitted = useMemo(() => {
    const root = scene.clone(true);

    // Measure before touching anything.
    const raw = new THREE.Box3().setFromObject(root);
    const size = raw.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z);
    if (footprint > 0) root.scale.setScalar(targetWidth / footprint);

    // Re-measure at the new scale, then seat it: centred on the origin, and
    // resting on the ground rather than floating above or sunk below it.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const centre = box.getCenter(new THREE.Vector3());
    root.position.x -= centre.x;
    root.position.z -= centre.z;
    root.position.y -= box.min.y;

    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    fitRef.current = {
      width: +(box.max.x - box.min.x).toFixed(3),
      depth: +(box.max.z - box.min.z).toFixed(3),
      height: +(box.max.y - box.min.y).toFixed(3),
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    };

    return root;
  }, [scene, targetWidth]);

  // Report after render rather than during it — calling a parent's setState
  // inside a useMemo is a render-phase update and React warns about it.
  useEffect(() => {
    if (fitRef.current) onFitRef.current?.(fitRef.current);
  }, [fitted]);

  return (
    <group rotation={[0, rotation, 0]}>
      <primitive object={fitted} />
    </group>
  );
}
