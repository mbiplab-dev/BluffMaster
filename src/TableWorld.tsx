import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Shape,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { useEffect, useRef } from "react";
import type { Phase } from "../shared/types";

type World = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  pile: Group;
  markers: Group;
  particles: Points;
  resize: () => void;
  phase: Phase;
  targetScale: number;
  targetLift: number;
  pulse: number;
};

function roundedShape(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/** A deliberately quiet WebGL underlay: physical table depth, card stack and light. */
export function TableWorld({
  pileCount,
  playerCount,
  phase,
}: {
  pileCount: number;
  playerCount: number;
  phase: Phase;
}) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const motion = useRef(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let frame = 0;
    try {
      const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = "table-world-canvas";
      container.appendChild(renderer.domElement);

      const scene = new Scene();
      const camera = new PerspectiveCamera(36, 1, 0.1, 80);
      camera.position.set(0, 8.8, 9.8);
      camera.lookAt(0, 0, 0);
      scene.add(new AmbientLight(0x8ab9ff, 1.55));
      const key = new DirectionalLight(0xffe2a1, 3.2);
      key.position.set(-5, 8, 4);
      scene.add(key);
      const rim = new DirectionalLight(0x4cbaff, 2.1);
      rim.position.set(7, 3, -5);
      scene.add(rim);

      const table = new Mesh(
        new ExtrudeGeometry(roundedShape(11.7, 7, 0.72), {
          depth: 0.34,
          bevelEnabled: true,
          bevelSegments: 3,
          bevelSize: 0.13,
          bevelThickness: 0.1,
        }),
        new MeshPhysicalMaterial({ color: 0x075c57, roughness: 0.34, metalness: 0.08, clearcoat: 0.5 }),
      );
      table.rotation.x = -Math.PI / 2;
      table.position.y = -0.34;
      scene.add(table);

      const rail = new Mesh(
        new ExtrudeGeometry(roundedShape(12.12, 7.42, 0.78), {
          depth: 0.18,
          bevelEnabled: true,
          bevelSegments: 2,
          bevelSize: 0.1,
          bevelThickness: 0.08,
        }),
        new MeshPhysicalMaterial({ color: 0xdda549, roughness: 0.25, metalness: 0.34, clearcoat: 0.7 }),
      );
      rail.rotation.x = -Math.PI / 2;
      rail.position.y = -0.46;
      scene.add(rail);

      const pile = new Group();
      const cardGeometry = new BoxGeometry(0.74, 0.042, 1.06);
      const cardMaterial = new MeshPhysicalMaterial({ color: 0x145ab8, roughness: 0.3, metalness: 0.14, clearcoat: 0.65 });
      for (let i = 0; i < 12; i++) {
        const card = new Mesh(cardGeometry, cardMaterial);
        card.position.set((i % 2 ? 1 : -1) * i * 0.008, i * 0.045, (i % 3 - 1) * 0.01);
        card.rotation.y = (i - 5) * 0.022;
        pile.add(card);
      }
      pile.position.y = 0.04;
      scene.add(pile);

      const markers = new Group();
      const markerGeometry = new SphereGeometry(0.17, 16, 12);
      for (let i = 0; i < 8; i++) {
        const marker = new Mesh(
          markerGeometry,
          new MeshPhysicalMaterial({ color: new Color().setHSL(i / 10 + 0.03, 0.74, 0.61), emissive: 0x101d4e, emissiveIntensity: 0.45, roughness: 0.24 }),
        );
        const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        marker.position.set(Math.cos(angle) * 5.15, 0.07, Math.sin(angle) * 2.95);
        markers.add(marker);
      }
      scene.add(markers);

      const particleGeometry = new BufferGeometry();
      const particlePositions = Array.from({ length: 48 }, (_, i) => {
        const angle = i * 2.399;
        const radius = 3.6 + (i % 7) * 0.34;
        return [Math.cos(angle) * radius, 0.12 + (i % 5) * 0.04, Math.sin(angle) * radius * 0.58];
      }).flat();
      particleGeometry.setAttribute(
        "position",
        new Float32BufferAttribute(particlePositions, 3),
      );
      const particles = new Points(particleGeometry, new PointsMaterial({ color: 0xffe77a, size: 0.045, transparent: true, opacity: 0.62 }));
      scene.add(particles);

      const resize = () => {
        const { width, height } = container.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      world.current = {
        renderer,
        scene,
        camera,
        pile,
        markers,
        particles,
        resize,
        phase: "turn",
        targetScale: 1,
        targetLift: 0.04,
        pulse: 0,
      };
      const clock = performance.now();
      const animate = (time: number) => {
        const drift = motion.current ? (time - clock) / 1000 : 0;
        const activeWorld = world.current;
        const pulse = activeWorld?.pulse ?? 0;
        const scale = (activeWorld?.targetScale ?? 1) + pulse * 0.18;
        pile.scale.x += (scale - pile.scale.x) * 0.13;
        pile.scale.y += (scale - pile.scale.y) * 0.13;
        pile.scale.z += (scale - pile.scale.z) * 0.13;
        pile.position.y += ((activeWorld?.targetLift ?? 0.04) - pile.position.y) * 0.14;
        if (activeWorld) activeWorld.pulse *= 0.84;
        pile.rotation.y = drift * (activeWorld?.phase === "challenge" ? 0.26 : 0.12);
        pile.rotation.x = activeWorld?.phase === "reveal" ? Math.sin(drift * 13) * 0.16 : 0;
        pile.rotation.z = activeWorld?.phase === "resolution" ? Math.sin(drift * 8) * 0.11 : 0;
        particles.rotation.y = -drift * 0.045;
        markers.children.forEach((marker, index) => {
          marker.position.y = 0.07 + (motion.current ? Math.sin(drift * 1.6 + index) * 0.028 : 0);
        });
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        cardGeometry.dispose();
        cardMaterial.dispose();
        particleGeometry.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        world.current = null;
      };
    } catch {
      // WebGL can be disabled by privacy settings or low-end devices; the CSS table remains complete.
      return;
    }
  }, []);

  useEffect(() => {
    const current = world.current;
    if (!current) return;
    current.pile.children.forEach((card, index) => (card.visible = index < Math.min(12, Math.max(1, pileCount))));
    current.markers.children.forEach((marker, index) => (marker.visible = index < playerCount));
    current.phase = phase;
    current.pulse = 1;
    current.targetScale =
      phase === "challenge" ? 1.18 : phase === "reveal" ? 1.36 : phase === "resolution" ? 0.86 : 1;
    current.targetLift = phase === "challenge" ? 0.2 : phase === "reveal" ? 0.34 : 0.04;
    const urgent = phase === "reveal" || phase === "resolution";
    const topCard = current.pile.children[0] as Mesh | undefined;
    if (topCard?.material instanceof MeshPhysicalMaterial)
      topCard.material.color.set(urgent ? 0xd63b58 : 0x145ab8);
  }, [pileCount, playerCount, phase]);

  return <div className="table-world" ref={host} aria-hidden="true" />;
}
