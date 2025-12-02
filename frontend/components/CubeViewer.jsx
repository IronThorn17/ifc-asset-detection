import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function CubeViewer({ faces, detections = [] }) {
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
    let detectionBoxes = [];
    let detectionLabels = [];

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

      // Remove previous detection boxes and labels
      detectionBoxes.forEach(box => {
        box.geometry.dispose();
        box.material.dispose();
        scene.remove(box);
      });
      detectionBoxes = [];

      detectionLabels.forEach(label => {
        scene.remove(label);
      });
      detectionLabels = [];

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

      // Add detection boxes
      if (detections && detections.length > 0) {
        addDetectionBoxes(f, detections);
      }
    };

    // --- Add detection boxes to the scene ---
    const addDetectionBoxes = (facesObj, detectionsList) => {
      // Remove existing detection boxes and labels
      detectionBoxes.forEach(box => {
        box.geometry.dispose();
        box.material.dispose();
        scene.remove(box);
      });
      detectionBoxes = [];

      detectionLabels.forEach(label => {
        scene.remove(label);
      });
      detectionLabels = [];

      // Group detections by face
      const detectionsByFace = {};
      detectionsList.forEach(detection => {
        if (detection.face_id) {
          if (!detectionsByFace[detection.face_id]) {
            detectionsByFace[detection.face_id] = [];
          }
          detectionsByFace[detection.face_id].push(detection);
        }
      });

      // Create boxes for each face
      Object.keys(detectionsByFace).forEach(faceId => {
        const faceDetections = detectionsByFace[faceId];
        faceDetections.forEach(detection => {
          if (Array.isArray(detection.bbox_xywh) && detection.bbox_xywh.length >= 4) {
            const [x, y, width, height] = detection.bbox_xywh;
            const { box, label } = createDetectionBox(faceId, x, y, width, height, detection.ifc_class, detection.confidence, detection.review_action);
            if (box) {
              detectionBoxes.push(box);
              scene.add(box);
            }
            if (label) {
              detectionLabels.push(label);
              scene.add(label);
            }
          }
        });
      });
    };

    // --- Create a single detection box and label ---
    const createDetectionBox = (faceId, x, y, width, height, className, confidence, reviewAction) => {
      // Convert normalized coordinates to cube face coordinates
      // Cube size is 1000, so we need to map [0,1] to [-500,500]
      const cubeSize = 1000;
      const halfSize = cubeSize / 2;
      
      // Convert normalized coords to cube coords
      const left = (x - 0.5) * cubeSize;
      const top = -(y - 0.5) * cubeSize; // Flip Y axis
      const boxWidth = width * cubeSize;
      const boxHeight = height * cubeSize;
      
      // Create box geometry
      const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, 20);
      
      // Set material based on review status
      let boxMaterial;
      let labelColor;
      if (reviewAction === 'confirm') {
        // Confirmed detection - green color
        boxMaterial = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          wireframe: false,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide
        });
        labelColor = '#00ff00';
      } else if (reviewAction === 'reject') {
        // Rejected detection - red color
        boxMaterial = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          wireframe: false,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        labelColor = '#ff0000';
      } else {
        // Unreviewed detection - class color
        const classColor = getColorForClass(className);
        boxMaterial = new THREE.MeshBasicMaterial({
          color: classColor,
          wireframe: false,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide
        });
        labelColor = `#${classColor.toString(16).padStart(6, '0')}`;
      }
      
      const box = new THREE.Mesh(boxGeometry, boxMaterial);
      
      // Position based on face
      let position;
      switch (faceId) {
        case 'front':
          position = { x: left, y: top, z: -halfSize + 10 };
          break;
        case 'back':
          position = { x: -left, y: top, z: halfSize - 10 };
          break;
        case 'left':
          position = { x: -halfSize + 10, y: top, z: -left };
          break;
        case 'right':
          position = { x: halfSize - 10, y: top, z: left };
          break;
        case 'top':
          position = { x: left, y: halfSize - 10, z: top };
          break;
        case 'bottom':
          position = { x: left, y: -halfSize + 10, z: -top };
          break;
        default:
          boxGeometry.dispose();
          boxMaterial.dispose();
          return { box: null, label: null };
      }
      
      box.position.set(position.x, position.y, position.z);
      
      // Create label
      const label = createLabel(className, position, labelColor, confidence);
      
      return { box, label };
    };

    // --- Create a label for the detection ---
    const createLabel = (text, position, color, confidence) => {
      // Create a canvas for the label
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 128;
      
      // Draw text on canvas
      context.fillStyle = color;
      context.font = '24px Arial';
      context.textAlign = 'center';
      context.fillText(text, canvas.width / 2, 40);
      
      context.font = '16px Arial';
      context.fillText(`Conf: ${(confidence * 100).toFixed(1)}%`, canvas.width / 2, 80);
      
      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      
      // Create sprite material
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9
      });
      
      // Create sprite
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(100, 50, 1);
      sprite.position.set(position.x, position.y + 60, position.z);
      
      return sprite;
    };

    // --- Get color based on class ---
    const getColorForClass = (className) => {
      const classColors = {
        'ifcDoor': 0xff0000,        // Red
        'ifcWindow': 0x00ff00,      // Green
        'ifcWall': 0x0000ff,        // Blue
        'ifcFurniture': 0xffff00,   // Yellow
        'ifcLightFixture': 0xff00ff, // Magenta
        'ifcComputer': 0x00ffff,    // Cyan
        'ifcSign': 0xffa500,        // Orange
        'default': 0xffffff         // White
      };
      
      return classColors[className] || classColors['default'];
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
    let lastDetections = detections;
    const swapCheck = setInterval(() => {
      if ((lastFaces !== faces && faces) || (lastDetections !== detections && detections)) {
        lastFaces = faces;
        lastDetections = detections;
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
      detectionBoxes.forEach(box => {
        box.geometry.dispose();
        box.material.dispose();
      });
      detectionLabels.forEach(label => {
        // Labels are sprites, no need to dispose geometry/material
        scene.remove(label);
      });
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
    };
  }, [faces, detections]);

  // Count detections by review status
  const detectionStats = detections.reduce((stats, detection) => {
    if (detection.review_action === 'confirm') {
      stats.confirmed++;
    } else if (detection.review_action === 'reject') {
      stats.rejected++;
    } else {
      stats.unreviewed++;
    }
    return stats;
  }, { confirmed: 0, rejected: 0, unreviewed: 0 });

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
        {detections && detections.length > 0 && (
          <div style={S.detectionsInfo}>
            <span style={S.detectionsCount}>
              <i className="fas fa-vector-square"></i> {detections.length} detections
            </span>
            <div style={S.detectionStatus}>
              <span style={{...S.statusItem, color: '#66bb6a'}}>
                <i className="fas fa-check-circle"></i> {detectionStats.confirmed} confirmed
              </span>
              <span style={{...S.statusItem, color: '#ef5350'}}>
                <i className="fas fa-times-circle"></i> {detectionStats.rejected} rejected
              </span>
              <span style={{...S.statusItem, color: '#4a9bff'}}>
                <i className="fas fa-question-circle"></i> {detectionStats.unreviewed} pending
              </span>
            </div>
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
  detectionStatus: {
    display: "flex",
    gap: "10px",
    marginTop: "5px",
    fontSize: "12px",
  },
  statusItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  controlItem: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
};