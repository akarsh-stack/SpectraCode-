"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function TorusKnot() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Torus Knot Geometry
    const geo = new THREE.TorusKnotGeometry(1.2, 0.35, 200, 32, 2, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1aff6e,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Outer glow ring
    const ringGeo = new THREE.TorusGeometry(1.8, 0.01, 8, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3dd68c,
      transparent: true,
      opacity: 0.25,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Resize handler
    const resize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", resize);

    // Mouse parallax
    const mouse = { x: 0, y: 0 };
    const onMouse = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse);

    let rafId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      mesh.rotation.x = t * 0.12 + mouse.y * 0.3;
      mesh.rotation.y = t * 0.18 + mouse.x * 0.3;
      ring.rotation.z = t * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 1 }}
    />
  );
}
