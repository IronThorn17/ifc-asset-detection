import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function CubeViewer({ faces }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Scene & Camera setup ---
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
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    // --- Texture loader setup (with CORS) ---
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    let skybox = null;
    let textures = {};

    // --- Build or rebuild the cubemap ---
    const buildSkybox = (f) => {
      if (!f) return;
      const order = [
        ["px", f.right],
        ["nx", f.left],
        ["py", f.top],
        ["ny", f.bottom],
        ["pz", f.front],
        ["nz", f.back],
      ];

      // dispose previous geometry and materials
      if (skybox) {
        skybox.geometry.dispose();
        skybox.material.forEach((m) => m.dispose());
        scene.remove(skybox);
        Object.values(textures).forEach((t) => t?.dispose());
        textures = {};
      }

      const materials = order.map(([key, url]) => {
        let tex = null;
        if (url) {
          tex = loader.load(
            url,
            () => console.log(`✅ Loaded: ${url}`),
            undefined,
            (err) => console.error(`❌ Failed to load: ${url}`, err)
          );
          tex.colorSpace = THREE.SRGBColorSpace;
        } else {
          console.warn(`⚠️ Missing texture for face: ${key}`);
        }

        textures[key] = tex;
        return new THREE.MeshBasicMaterial({
          map: tex || null,
          side: THREE.BackSide,
          // If no texture, use black color
          color: tex ? 0xffffff : 0x000000,
        });
      });

      skybox = new THREE.Mesh(
        new THREE.BoxGeometry(1000, 1000, 1000),
        materials
      );
      scene.add(skybox);
    };

    // --- Initial build ---
    buildSkybox(faces);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // --- Mouse look controls ---
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
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
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

    // --- Resize observer ---
    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // --- Render loop ---
    let raf = 0;
    const loop = () => {
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    // --- Watch for face changes ---
    let lastFaces = faces;
    const swapCheck = setInterval(() => {
      if (lastFaces !== faces && faces) {
        lastFaces = faces;
        buildSkybox(faces);
      }
    }, 300);

    // --- Cleanup ---
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
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
    };
  }, [faces]);

  return (
    <div ref={mountRef} style={S.root}>
      <div style={S.overlay}>
        <div style={S.controlsInfo}>
          <span style={S.controlItem}>
            <i className="fas fa-mouse-pointer"></i> Drag to look around
          </span>
          <span style={S.controlItem}>
            <i className="fas fa-search-plus"></i> Scroll to zoom
          </span>
        </div>
      </div>
    </div>
  );
}

const S = {
  root: {
    width: "100%",
    height: "100%",
    position: "relative",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  overlay: {
    position: "absolute",
    bottom: "20px",
    left: "20px",
    zIndex: 10,
    background: "rgba(13, 27, 42, 0.7)",
    padding: "10px 15px",
    borderRadius: "8px",
    backdropFilter: "blur(5px)",
  },
  controlsInfo: {
    display: "flex",
    gap: "15px",
    color: "#bbdefb",
    fontSize: "13px",
  },
  controlItem: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
};
