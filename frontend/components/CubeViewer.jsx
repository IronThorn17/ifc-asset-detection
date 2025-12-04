import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function CubeViewer({ faces = {}, detections = [], minConfidence = 0.05, showLabels = true }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const detGroupRef = useRef(null);

  // Build viewer (scene, camera, renderer, skybox)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.01);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    // Build skybox materials from faces (defensive against null)
    const f = faces || {};
    const materials = [];
    const order = [
      ["px", f.right],
      ["nx", f.left],
      ["py", f.top],
      ["ny", f.bottom],
      ["pz", f.front],
      ["nz", f.back],
    ];

    for (const [, url] of order) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x000000 });
      if (url) {
        const tex = loader.load(url, (texture) => {
          material.map = texture;
          material.needsUpdate = true;
          texture.colorSpace = THREE.SRGBColorSpace;
        });
        if (tex) {
          material.map = tex;
          material.color.set(0xffffff);
        }
      } else {
        material.color.set(0x000000);
      }
      materials.push(material);
    }

    const skybox = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), materials);
    scene.add(skybox);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Mouse look controls
    let isDown = false;
    let lx = 0, ly = 0;
    let yaw = 0, pitch = 0;
    const onDown = (e) => { isDown = true; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { isDown = false; };
    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      yaw -= dx * 0.0025; pitch -= dy * 0.0025;
      const clamp = Math.PI / 2 - 0.01;
      pitch = Math.max(-clamp, Math.min(clamp, pitch));
    };
    const onWheel = (e) => {
      camera.fov = THREE.MathUtils.clamp(camera.fov + (e.deltaY > 0 ? 2 : -2), 30, 100);
      camera.updateProjectionMatrix();
    };
    mount.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    mount.addEventListener("wheel", onWheel, { passive: true });

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

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      mount.removeEventListener("wheel", onWheel);
      if (renderer) {
        renderer.dispose();
        const gl = renderer.getContext();
        if (gl && typeof gl.getExtension === "function") {
          const lose = gl.getExtension("WEBGL_lose_context");
          if (lose) lose.loseContext();
        }
        if (renderer.domElement && renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      }
      skybox.geometry.dispose();
      if (Array.isArray(skybox.material)) skybox.material.forEach((m) => m.dispose());
      else if (skybox.material) skybox.material.dispose();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [faces]);

  // Render detection bounding boxes on cube faces
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old group
    if (detGroupRef.current) {
      scene.remove(detGroupRef.current);
      detGroupRef.current.traverse((obj) => {
        if (obj.isLine) obj.geometry.dispose();
      });
      detGroupRef.current = null;
    }

    if (!Array.isArray(detections) || detections.length === 0) return;

    const size = 1000; // skybox size used above
    const group = new THREE.Group();

    const colorForClass = (cls) => {
      // Simple deterministic color based on class string
      const str = String(cls || "");
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      const r = (hash & 0xff);
      const g = (hash >> 8) & 0xff;
      const b = (hash >> 16) & 0xff;
      return new THREE.Color(r / 255, g / 255, b / 255);
    };

    const rectToLines = (points, color) => {
      // points: [p1, p2, p3, p4] clockwise
      const geom = new THREE.BufferGeometry();
      const verts = [];
      const pushEdge = (a, b) => { verts.push(a.x, a.y, a.z, b.x, b.y, b.z); };
      pushEdge(points[0], points[1]);
      pushEdge(points[1], points[2]);
      pushEdge(points[2], points[3]);
      pushEdge(points[3], points[0]);
      geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
      return new THREE.LineSegments(geom, mat);
    };

    const makeLabelSprite = (text, color, worldW) => {
      const pad = 6;
      const fontSize = 24;
      const font = `${fontSize}px Inter, Arial, sans-serif`;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = font;
      const metrics = ctx.measureText(text);
      const w = Math.ceil(metrics.width) + pad * 2;
      const h = fontSize + pad * 2;
      canvas.width = w;
      canvas.height = h;
      // background
      ctx.fillStyle = `rgba(${Math.round(color.r*255)}, ${Math.round(color.g*255)}, ${Math.round(color.b*255)}, 0.85)`;
      ctx.fillRect(0, 0, w, h);
      // text
      ctx.fillStyle = "#ffffff";
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.fillText(text, pad, h/2);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      const aspect = w / h;
      const worldH = worldW / aspect;
      sprite.scale.set(worldW, worldH, 1);
      return sprite;
    };

    const clamp01 = (n) => Math.max(0, Math.min(1, n));

    // Map normalized bbox to cube face coordinates
    const rectOnFace = (face, cx, cy, w, h) => {
      // convert normalized center to cube coordinates
      cx = clamp01(cx); cy = clamp01(cy); w = clamp01(w); h = clamp01(h);
      const X = (cx - 0.5) * size;
      const Y = (0.5 - cy) * size; // invert Y
      const halfW = (w * size) / 2;
      const halfH = (h * size) / 2;

      let p1, p2, p3, p4; // clockwise
      switch (face) {
        case "front": {
          const z = 499;
          p1 = new THREE.Vector3(X - halfW, Y + halfH, z);
          p2 = new THREE.Vector3(X + halfW, Y + halfH, z);
          p3 = new THREE.Vector3(X + halfW, Y - halfH, z);
          p4 = new THREE.Vector3(X - halfW, Y - halfH, z);
          break;
        }
        case "back": {
          const z = -499;
          // mirror X so it aligns with texture orientation
          const Xm = -X;
          p1 = new THREE.Vector3(Xm - halfW, Y + halfH, z);
          p2 = new THREE.Vector3(Xm + halfW, Y + halfH, z);
          p3 = new THREE.Vector3(Xm + halfW, Y - halfH, z);
          p4 = new THREE.Vector3(Xm - halfW, Y - halfH, z);
          break;
        }
        case "left": {
          const x = -499;
          // horizontal maps to Z
          const Z = (cx - 0.5) * size;
          const halfWz = halfW;
          p1 = new THREE.Vector3(x, Y + halfH, Z - halfWz);
          p2 = new THREE.Vector3(x, Y + halfH, Z + halfWz);
          p3 = new THREE.Vector3(x, Y - halfH, Z + halfWz);
          p4 = new THREE.Vector3(x, Y - halfH, Z - halfWz);
          break;
        }
        case "right": {
          const x = 499;
          const Z = -(cx - 0.5) * size; // mirror
          const halfWz = halfW;
          p1 = new THREE.Vector3(x, Y + halfH, Z - halfWz);
          p2 = new THREE.Vector3(x, Y + halfH, Z + halfWz);
          p3 = new THREE.Vector3(x, Y - halfH, Z + halfWz);
          p4 = new THREE.Vector3(x, Y - halfH, Z - halfWz);
          break;
        }
        case "top": {
          const y = 499;
          const Xh = (cx - 0.5) * size;
          const Zh = -(cy - 0.5) * size; // rough mapping
          p1 = new THREE.Vector3(Xh - halfW, y, Zh - halfH);
          p2 = new THREE.Vector3(Xh + halfW, y, Zh - halfH);
          p3 = new THREE.Vector3(Xh + halfW, y, Zh + halfH);
          p4 = new THREE.Vector3(Xh - halfW, y, Zh + halfH);
          break;
        }
        case "bottom": {
          const y = -499;
          const Xh = (cx - 0.5) * size;
          const Zh = (cy - 0.5) * size; // rough mapping
          p1 = new THREE.Vector3(Xh - halfW, y, Zh - halfH);
          p2 = new THREE.Vector3(Xh + halfW, y, Zh - halfH);
          p3 = new THREE.Vector3(Xh + halfW, y, Zh + halfH);
          p4 = new THREE.Vector3(Xh - halfW, y, Zh + halfH);
          break;
        }
        default: {
          const z = 499;
          p1 = new THREE.Vector3(X - halfW, Y + halfH, z);
          p2 = new THREE.Vector3(X + halfW, Y + halfH, z);
          p3 = new THREE.Vector3(X + halfW, Y - halfH, z);
          p4 = new THREE.Vector3(X - halfW, Y - halfH, z);
        }
      }
      return [p1, p2, p3, p4];
    };

    const threshold = typeof minConfidence === "number" ? minConfidence : 0.05;

    detections.forEach((d) => {
      const bbox = Array.isArray(d.bbox_xywh) ? d.bbox_xywh : null;
      const face = d.face_id || d.face || "front";
      const conf = typeof d.confidence === "number" ? d.confidence : 0;
      if (!bbox || conf < threshold) return;
      const [cx, cy, w, h] = bbox;
      const points = rectOnFace(face, cx, cy, w, h);
      const color = colorForClass(d.ifc_class || d.label_display);
      const rect = rectToLines(points, color);
      group.add(rect);

      // Label sprite positioned near top-left corner (p1)
      if (showLabels) {
        const suffix = d.review_action === "confirm" ? " ✓" : d.review_action === "reject" ? " ✗" : "";
        const labelText = `${d.ifc_class || d.label_display || "det"} ${conf.toFixed(2)}${suffix}`;
        const labelW = Math.max(60, w * size * 0.35);
        const sprite = makeLabelSprite(labelText, color, labelW);
        const p1 = points[0].clone();
        // Slight offset inward to avoid z-fighting
        const nudge = 3;
        switch (face) {
          case "front": sprite.position.set(p1.x, p1.y + nudge, 499 - nudge); break;
          case "back": sprite.position.set(p1.x, p1.y + nudge, -499 + nudge); break;
          case "left": sprite.position.set(-499 + nudge, p1.y + nudge, p1.z); break;
          case "right": sprite.position.set(499 - nudge, p1.y + nudge, p1.z); break;
          case "top": sprite.position.set(p1.x, 499 - nudge, p1.z); break;
          case "bottom": sprite.position.set(p1.x, -499 + nudge, p1.z); break;
          default: sprite.position.set(p1.x, p1.y + nudge, 499 - nudge);
        }
        group.add(sprite);
      }
    });

    scene.add(group);
    detGroupRef.current = group;
  }, [detections]);

  return (
    <div ref={mountRef} style={S.root}>
      <div style={S.overlay}>
        <div style={S.controlsInfo}>
          <span style={S.controlItem}>Drag to look around</span>
          <span style={S.controlItem}>Scroll to zoom</span>
        </div>
        {Array.isArray(detections) && detections.length > 0 && (
          <div style={S.detectionsInfo}>
            <span style={S.detectionsCount}>{detections.length} detections</span>
          </div>
        )}
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
  detectionsInfo: {
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px solid rgba(187, 222, 251, 0.3)",
  },
  detectionsCount: {
    color: "#4a9bff",
    fontSize: "13px",
    fontWeight: "500",
  },
  controlItem: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
};