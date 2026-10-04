import { onSettled, createSignal } from "solid-js";
import * as THREE from "three";
import type { ObcButton } from "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import type { ObcToggleButtonGroup } from "@oicl/openbridge-webcomponents/dist/components/toggle-button-group/toggle-button-group.js";
import { writeSimulatedSpectrum } from "./simulator.js";
import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-group/toggle-button-group.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import "./style.css";

type AudioSource = "simulation" | "microphone";

export default function Spectrogram(props: { title: string }) {
  let canvasHost!: HTMLDivElement;
  let sourcePicker!: ObcToggleButtonGroup;
  let streamButton!: ObcButton;
  let renderer: THREE.WebGLRenderer | undefined;
  let animationFrame = 0;
  let audioContext: AudioContext | undefined;
  let stream: MediaStream | undefined;
  let analyser: AnalyserNode | undefined;
  let frameData: Uint8Array<ArrayBuffer> | undefined;
  let displacement: THREE.BufferAttribute | undefined;
  let disposed = false;
  let activeSource: AudioSource | undefined;
  let requestId = 0;
  let selectSource = (_source: AudioSource) => {};
  const [source, setSource] = createSignal<AudioSource>("simulation");
  const [running, setRunning] = createSignal(false);
  const [starting, setStarting] = createSignal(false);
  const [status, setStatus] = createSignal("Stopped");
  const [error, setError] = createSignal("");

  const timeSamples = 180;
  const frequencySamples = 128;
  const vertexCountPerColumn = frequencySamples + 1;
  const vertexCount = (timeSamples + 1) * vertexCountPerColumn;
  const heightData = new Float32Array(vertexCount);

  const releaseMicrophone = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    analyser = undefined;
    frameData = undefined;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
    audioContext = undefined;
  };

  const stopStream = () => {
    requestId += 1;
    cancelAnimationFrame(animationFrame);
    activeSource = undefined;
    releaseMicrophone();
    setRunning(false);
    setStarting(false);
    setStatus("Stopped");
  };

  onSettled(() => {
    sceneSetup();
  });

  const sceneSetup = () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10191d");

    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 300);

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
      setError("WebGL is unavailable in this browser.");
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!renderer) return;
      const width = Math.max(canvasHost.clientWidth, 1);
      const height = Math.max(canvasHost.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const fitHeight = 18.5;
      const distance = fitHeight / (2 * Math.tan(verticalFov / 2));
      camera.position.set(0, -distance * 0.32, distance * 0.95);
      camera.lookAt(0, 0, 0);
      mesh.scale.x = (fitHeight * camera.aspect) / 34;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    });
    resizeObserver.observe(canvasHost);

    const renderFrame = () => {
      if (disposed || !renderer) return;
      if (activeSource && displacement) {
        heightData.copyWithin(0, vertexCountPerColumn, vertexCount);
        const newestColumn = timeSamples * vertexCountPerColumn;

        if (activeSource === "microphone" && analyser && frameData) {
          analyser.getByteFrequencyData(frameData);
          const nyquist = (audioContext?.sampleRate ?? 48000) / 2;
          const minimumFrequency = 30;
          const maximumFrequency = Math.max(minimumFrequency + 1, nyquist);
          for (let row = 0; row <= frequencySamples; row += 1) {
            const normalized = row / frequencySamples;
            const frequency =
              minimumFrequency *
              Math.pow(maximumFrequency / minimumFrequency, normalized);
            const bin = Math.min(
              frameData.length - 1,
              Math.round((frequency / nyquist) * frameData.length),
            );
            heightData[newestColumn + row] = (frameData[bin] ?? 0) / 255;
          }
        } else if (activeSource === "simulation") {
          const time = performance.now() / 1000;
          writeSimulatedSpectrum(
            heightData,
            newestColumn,
            frequencySamples,
            time,
          );
        }
        displacement.needsUpdate = true;
      }
      renderer.render(scene, camera);
      if (activeSource) animationFrame = requestAnimationFrame(renderFrame);
    };

    renderer?.render(scene, camera);

    const startSimulation = () => {
      requestId += 1;
      cancelAnimationFrame(animationFrame);
      releaseMicrophone();
      setError("");
      activeSource = "simulation";
      setSource("simulation");
      setStarting(false);
      setRunning(true);
      setStatus("Simulation running");
      animationFrame = requestAnimationFrame(renderFrame);
    };

    const startMicrophone = async () => {
      const currentRequest = ++requestId;
      cancelAnimationFrame(animationFrame);
      activeSource = undefined;
      releaseMicrophone();
      setError("");
      setSource("microphone");
      setRunning(false);
      setStarting(true);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Microphone access is unavailable. Use a secure connection and a supported browser.",
        );
        setStarting(false);
        setStatus("Microphone unavailable");
        return;
      }
      setStatus("Requesting microphone access...");
      let nextStream: MediaStream | undefined;
      let nextAudioContext: AudioContext | undefined;
      try {
        nextStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (disposed || currentRequest !== requestId) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        nextAudioContext = new AudioContext();
        const nextAnalyser = nextAudioContext.createAnalyser();
        nextAnalyser.fftSize = 2048;
        nextAnalyser.smoothingTimeConstant = 0.72;
        nextAudioContext
          .createMediaStreamSource(nextStream)
          .connect(nextAnalyser);
        await nextAudioContext.resume();
        if (disposed || currentRequest !== requestId) {
          nextStream.getTracks().forEach((track) => track.stop());
          await nextAudioContext.close();
          return;
        }
        stream = nextStream;
        audioContext = nextAudioContext;
        analyser = nextAnalyser;
        frameData = new Uint8Array(nextAnalyser.frequencyBinCount);
        activeSource = "microphone";
        setStarting(false);
        setRunning(true);
        setStatus("Microphone running");
        animationFrame = requestAnimationFrame(renderFrame);
      } catch (cause) {
        nextStream?.getTracks().forEach((track) => track.stop());
        if (nextAudioContext && nextAudioContext.state !== "closed") {
          void nextAudioContext.close();
        }
        if (currentRequest === requestId) {
          setStarting(false);
          setRunning(false);
          setStatus("Microphone unavailable");
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not start microphone input.",
          );
        }
      }
    };

    selectSource = (nextSource) => {
      if (nextSource === "simulation") startSimulation();
      else void startMicrophone();
    };

    const handleSourceChange = (event: Event) => {
      const selected = (event as CustomEvent<{ value: string }>).detail.value;
      if (selected === "simulation" || selected === "microphone") {
        selectSource(selected);
      }
    };

    const handleStreamClick = () => {
      if (running() || starting()) stopStream();
      else if (source() === "simulation") startSimulation();
      else void startMicrophone();
    };

    sourcePicker.addEventListener("change", handleSourceChange);
    streamButton.addEventListener("click", handleStreamClick);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      sourcePicker.removeEventListener("change", handleSourceChange);
      streamButton.removeEventListener("click", handleStreamClick);
      stopStream();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = undefined;
    };
  };

  return (
    <section class="spectrogram">
      <obc-card>
        <div slot="title">{props.title} controls</div>

        <div class="spectrogram-toolbar">
          <div class="spectrogram-controls">
            <obc-toggle-button-group
              class="spectrogram-source"
              prop:value={source()}
              variant="regular"
              hugText
              aria-label="Audio source"
              ref={sourcePicker}
            >
              <obc-toggle-button-option value="simulation">
                Simulation
              </obc-toggle-button-option>
              <obc-toggle-button-option value="microphone">
                Microphone
              </obc-toggle-button-option>
            </obc-toggle-button-group>
            <obc-button
              class="spectrogram-mic-button"
              variant={running() || starting() ? "raised" : "normal"}
              ref={streamButton}
            >
              {starting() ? "Cancel" : running() ? "Stop" : "Start"}
            </obc-button>
          </div>
        </div>
      </obc-card>
      <br />
      <obc-card class="spectrogram-display-card">
        <div slot="title">{props.title} - {status()}</div>
        {error() && (
          <p class="spectrogram-error" role="alert">
            {error()}
          </p>
        )}
        <div
          class="spectrogram-stage"
          ref={canvasHost}
          aria-label="Live audio spectrogram"
        />
      </obc-card>
    </section>
  );
}
