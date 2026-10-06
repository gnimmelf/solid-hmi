import { createEffect, onSettled, untrack, type Accessor } from "solid-js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import colormap from "colormap";
import styles from "./style.module.css";

type ColormapName = "viridis" | "jet" | "hot" | "cool" | "rainbow";

type SpectrogramProps = {
  running: Accessor<boolean>;
  frameData: () => Float32Array | undefined;
  colormap: Accessor<ColormapName>;
  orbitEnabled: Accessor<boolean>;
  onError: (message: string) => void;
};

export default function Spectrogram(props: SpectrogramProps) {
  const running = untrack(() => props.running);
  const frameData = untrack(() => props.frameData);
  const selectedColormap = untrack(() => props.colormap);
  const orbitEnabled = untrack(() => props.orbitEnabled);
  const onError = untrack(() => props.onError);
  let canvasHost!: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | undefined;
  let animationFrame = 0;
  let displacement: THREE.BufferAttribute | undefined;
  let paletteTexture: THREE.DataTexture | undefined;
  let orbitControls: OrbitControls | undefined;
  let disposed = false;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;

  const sampleRateHz = 30;
  const sampleIntervalMs = 1000 / sampleRateHz;
  let lastSampleAt = 0;
  const timeSamples = 180;
  const frequencySamples = 128;
  const vertexCountPerColumn = frequencySamples + 1;
  const vertexCount = (timeSamples + 1) * vertexCountPerColumn;
  const heightData = new Float32Array(vertexCount);

  const renderScene = () => {
    if (renderer) renderer.render(scene, camera);
  };

  const setFixedCamera = () => {
    camera.up.set(0, 1, 0);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = 22;
    const distance = fitHeight / (2 * Math.tan(verticalFov / 2));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
  };

  const setOrbitCamera = () => {
    camera.up.set(0, 0, 1);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const distance = 22 / (2 * Math.tan(verticalFov / 2));
    camera.position.set(0, -distance * 0.85, distance * 0.65);
    camera.lookAt(0, 0, 0);
  };

  const configureOrbitControls = (enabled: boolean) => {
    if (!renderer) return;
    orbitControls?.dispose();
    orbitControls = undefined;
    if (enabled) {
      setOrbitCamera();
      orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      orbitControls.target.set(0, 0, 0);
      orbitControls.addEventListener("change", renderScene);
      orbitControls.update();
    } else {
      setFixedCamera();
    }
    renderScene();
  };

  createEffect(
    () => orbitEnabled(),
    (enabled) => configureOrbitControls(enabled),
  );

  const renderFrame = (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    timestamp: number,
  ) => {
    if (disposed || !renderer) return;
    if (
      running() &&
      displacement &&
      timestamp - lastSampleAt >= sampleIntervalMs
    ) {
      lastSampleAt = timestamp;
      heightData.copyWithin(0, vertexCountPerColumn, vertexCount);
      const newestColumn = timeSamples * vertexCountPerColumn;
      const nextFrame = frameData();
      if (nextFrame) heightData.set(nextFrame, newestColumn);
      displacement.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (running()) {
      animationFrame = requestAnimationFrame((nextTimestamp) =>
        renderFrame(scene, camera, nextTimestamp),
      );
    }
  };

  const updateColormap = (name: ColormapName) => {
    if (!paletteTexture) return;
    const colors = colormap({ colormap: name, nshades: 256, format: "float" });
    const data = paletteTexture.image.data as Uint8Array;
    for (let index = 0; index < colors.length; index += 1) {
      const offset = index * 4;
      data[offset] = Math.round(colors[index][0] * 255);
      data[offset + 1] = Math.round(colors[index][1] * 255);
      data[offset + 2] = Math.round(colors[index][2] * 255);
      data[offset + 3] = 255;
    }
    paletteTexture.needsUpdate = true;
    if (renderer) renderer.render(scene, camera);
  };

  createEffect(
    () => selectedColormap(),
    (name) => updateColormap(name),
  );

  createEffect(
    () => running(),
    (running) => {
      cancelAnimationFrame(animationFrame);
      if (running && renderer && !disposed)
        animationFrame = requestAnimationFrame((timestamp) =>
          renderFrame(scene, camera, timestamp),
        );
    },
  );

  onSettled(() => {
    scene = new THREE.Scene();
    scene.background = null;
    camera = new THREE.PerspectiveCamera(27, 1, 0.1, 300);
    setFixedCamera();

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices: number[] = [];
    for (let column = 0; column <= timeSamples; column += 1) {
      const x = (column / timeSamples - 0.5) * 34;
      for (let row = 0; row <= frequencySamples; row += 1) {
        const vertex = column * vertexCountPerColumn + row;
        const frequencyPosition = row / frequencySamples;
        positions[vertex * 3] = x;
        positions[vertex * 3 + 1] = (frequencyPosition - 0.5) * 18;
        positions[vertex * 3 + 2] = 0;
        uvs[vertex * 2] = column / timeSamples;
        uvs[vertex * 2 + 1] = frequencyPosition;
        if (column < timeSamples && row < frequencySamples) {
          const a = vertex;
          const b = vertex + vertexCountPerColumn;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    displacement = new THREE.BufferAttribute(heightData, 1);
    displacement.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("displacement", displacement);
    geometry.setIndex(indices);

    paletteTexture = new THREE.DataTexture(
      new Uint8Array(256 * 4),
      256,
      1,
      THREE.RGBAFormat,
    );
    paletteTexture.magFilter = THREE.LinearFilter;
    paletteTexture.minFilter = THREE.LinearFilter;
    paletteTexture.generateMipmaps = false;
    updateColormap(selectedColormap());

    const material = new THREE.ShaderMaterial({
      uniforms: { uColorMap: { value: paletteTexture } },
      vertexShader: `
        attribute float displacement;
        varying float vAmplitude;
        varying vec2 vUv;
        void main() {
          vAmplitude = displacement;
          vUv = uv;
          vec3 lifted = position;
          lifted.z += displacement * 4.2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(lifted, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uColorMap;
        varying float vAmplitude;
        varying vec2 vUv;
        void main() {
          float level = clamp(vAmplitude, 0.0, 1.0);
          vec3 color = texture2D(uColorMap, vec2(level, 0.5)).rgb;
          float grid = 0.84 + 0.16 * step(0.985, fract(vUv.x * 180.0));
          gl_FragColor = vec4(color * grid, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      canvasHost.appendChild(renderer.domElement);
      configureOrbitControls(orbitEnabled());
    } catch {
      onError("WebGL is unavailable in this browser.");
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!renderer) return;
      const width = Math.max(canvasHost.clientWidth, 1);
      const height = Math.max(canvasHost.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const fitHeight = 22;
      if (!orbitControls) setFixedCamera();
      mesh.scale.x = (fitHeight * camera.aspect * 0.90) / 34;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    });
    resizeObserver.observe(canvasHost);
    renderer.render(scene, camera);
    if (running()) {
      animationFrame = requestAnimationFrame((timestamp) =>
        renderFrame(scene, camera, timestamp),
      );
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      orbitControls?.dispose();
      orbitControls = undefined;
      geometry.dispose();
      material.dispose();
      paletteTexture?.dispose();
      paletteTexture = undefined;
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = undefined;
    };
  });

  return (
    <div class={styles["spectrogram-stage"]} ref={canvasHost} aria-label="Live audio spectrogram" />
  );
}