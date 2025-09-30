import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function CubeViewer({ faces }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );
    camera.position.set(0, 0, 0.01);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    let skybox = null;
    let textures = {};

    const buildSkybox = (f) => {
      const order = [
        ["px", f?.right],
        ["nx", f?.left],
        ["py", f?.top],
        ["ny", f?.bottom],
        ["pz", f?.front],
        ["nz", f?.back],
      ];

      if (skybox) {
        skybox.geometry.dispose();
        skybox.material.forEach((m) => m.dispose());
        scene.remove(skybox);
        Object.values(textures).forEach((t) => t?.dispose());
        textures = {};
      }

      const materials = order.map(([key, url]) => {
        const tex = url ? loader.load(url) : null;
        if (tex) tex.colorSpace = THREE.SRGBColorSpace;
        textures[key] = tex;
        return new THREE.MeshBasicMaterial({
          map: tex || null,
          side: THREE.BackSide,
        });
      });

      skybox = new THREE.Mesh(
        new THREE.BoxGeometry(1000, 1000, 1000),
        materials
      );
      scene.add(skybox);
    };

    buildSkybox(faces);

    // mouse-look & wheel zoom
    let isDown = false;
    let yaw = 0,
      pitch = 0,
      lx = 0,
      ly = 0;

    const onDown = (e) => {
      isDown = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = () => {
      isDown = false;
    };
    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - lx,
        dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      yaw -= dx * 0.0025;
      pitch -= dy * 0.0025;
      const clamp = Math.PI / 2 - 0.01;
      pitch = Math.max(-clamp, Math.min(clamp, pitch));
    };
    const onWheel = (e) => {
      camera.fov = THREE.MathUtils.clamp(
        camera.fov + (e.deltaY > 0 ? 2 : -2),
        30,
        100
      );
      camera.updateProjectionMatrix();
    };

    mount.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    mount.addEventListener("wheel", onWheel, { passive: true });

    // resize
    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    // simple faces swap check
    let lastFaces = faces;
    const swapCheck = setInterval(() => {
      if (lastFaces !== faces) {
        lastFaces = faces;
        buildSkybox(faces);
      }
    }, 200);

    return () => {
      clearInterval(swapCheck);
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      mount.removeEventListener("wheel", onWheel);
      renderer.dispose();
      Object.values(textures).forEach((t) => t?.dispose());
      if (skybox) {
        skybox.geometry.dispose();
        skybox.material.forEach((m) => m.dispose());
      }
      mount.removeChild(renderer.domElement);
    };
  }, [faces]);

  return <div ref={mountRef} style={S.root} />;
}

const S = {
  root: { width: "100%", height: "100%" },
};
