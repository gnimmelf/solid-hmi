import { createEffect, onSettled, type Accessor } from "solid-js";
import * as THREE from "three";

type SpectrogramSceneProps = {
  running: Accessor<boolean>;
  frameData: () => Float32Array | undefined;
  onError: (message: string) => void;
};

export default function SpectrogramScene(props: SpectrogramSceneProps) {
  let canvasHost!: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | undefined;
  let animationFrame = 0;
  let displacement: THREE.BufferAttribute | undefined;
  let disposed = false;

  const timeSamples = 180;
  const frequencySamples = 128;
  const vertexCountPerColumn = frequencySamples + 1;
  const vertexCount = (timeSamples + 1) * vertexCountPerColumn;
  const heightData = new Float32Array(vertexCount);

  const renderFrame = (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) => {
    if (disposed || !renderer) return;
    if (props.running() && displacement) {
      heightData.copyWithin(0, vertexCountPerColumn, vertexCount);
      const newestColumn = timeSamples * vertexCountPerColumn;
      const frameData = props.frameData();
      if (frameData) heightData.set(frameData, newestColumn);
      displacement.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (props.running()) {
      animationFrame = requestAnimationFrame(() => renderFrame(scene, camera));
    }
  };

  createEffect(
    () => props.running(),
    (running) => {
      cancelAnimationFrame(animationFrame);
      if (running && renderer && !disposed)
        animationFrame = requestAnimationFrame(() => renderFrame(scene, camera));
    },
  );

  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;

  onSettled(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#10191d");
    camera = new THREE.PerspectiveCamera(27, 1, 0.1, 300);

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

    const material = new THREE.ShaderMaterial({
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
        varying float vAmplitude;
        varying vec2 vUv;
        void main() {
          vec3 deep = vec3(0.025, 0.18, 0.27);
          vec3 teal = vec3(0.06, 0.72, 0.67);
          vec3 gold = vec3(1.0, 0.67, 0.22);
          vec3 color = mix(deep, teal, smoothstep(0.06, 0.48, vAmplitude));
          color = mix(color, gold, smoothstep(0.48, 0.92, vAmplitude));
          float grid = 0.84 + 0.16 * step(0.985, fract(vUv.x * 180.0));
          gl_FragColor = vec4(color * grid, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor("#10191d");
      canvasHost.appendChild(renderer.domElement);
    } catch {
      props.onError("WebGL is unavailable in this browser.");
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!renderer) return;
      const width = Math.max(canvasHost.clientWidth, 1);
      const height = Math.max(canvasHost.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const fitHeight = 22;
      const distance = fitHeight / (2 * Math.tan(verticalFov / 2));
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      mesh.scale.x = (fitHeight * camera.aspect * 0.90) / 34;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    });
    resizeObserver.observe(canvasHost);
    renderer.render(scene, camera);
    if (props.running()) {
      animationFrame = requestAnimationFrame(() => renderFrame(scene, camera));
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = undefined;
    };
  });

  return (
    <div class="spectrogram-stage" ref={canvasHost} aria-label="Live audio spectrogram" />
  );
}