import {
  createEffect,
  createSignal,
  onSettled,
  Show,
  untrack,
  type Accessor,
} from "solid-js";
import type { ObcDropdownButton } from "@oicl/openbridge-webcomponents/dist/components/dropdown-button/dropdown-button.js";
import SpectrogramScene from "../spectrogram-scene";
import { writeSimulatedSpectrum } from "../../lib/spectrogram-simulator.js";
import { ColormapNames, type ColormapName } from "./channel";
import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import "@oicl/openbridge-webcomponents/dist/components/dropdown-button/dropdown-button.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-group/toggle-button-group.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import styles from "./style.module.css";

type AudioSource = "simulation" | "microphone";
export type SpectrogramAttentionLevel = 1 | 2 | 3;

type SpectrogramProps = {
  attentionLevel: SpectrogramAttentionLevel;
  assetId: string;
  running?: Accessor<boolean>;
  colormap?: Accessor<ColormapName>;
  onRunningChange?: (running: boolean) => void;
  onColormapChange?: (colormap: ColormapName) => void;
};

export default function Spectrogram(props: SpectrogramProps) {
  const attentionLevel = () => props.attentionLevel;
  const controlledRunning = untrack(() => props.running);
  const controlledColormap = untrack(() => props.colormap);
  const onRunningChange = untrack(() => props.onRunningChange);
  const onColormapChange = untrack(() => props.onColormapChange);
  let colormapPicker!: ObcDropdownButton;
  let audioContext: AudioContext | undefined;
  let stream: MediaStream | undefined;
  let analyser: AnalyserNode | undefined;
  let microphoneFrame: Uint8Array<ArrayBuffer> | undefined;
  let disposed = false;
  let requestId = 0;
  const frequencySamples = 128;
  const spectrumFrame = new Float32Array(frequencySamples + 1);
  const colormapOptions: ObcDropdownButton["options"] = ColormapNames.map(
    (value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }),
  );
  let selectSource = (_source: AudioSource) => {};
  let applyRunning = (_running: boolean) => {};
  let toggleStream = () => {};
  const [source, setSource] = createSignal<AudioSource>("simulation");
  const [cameraMode, setCameraMode] = createSignal<"fixed" | "orbit">("fixed");
  const [localColormap, setLocalColormap] = createSignal<ColormapName>("viridis");
  const [activeSource, setActiveSource] = createSignal<AudioSource>();
  const [localRunning, setLocalRunning] = createSignal(false);
  const [starting, setStarting] = createSignal(false);
  const [status, setStatus] = createSignal("Stopped");
  const [error, setError] = createSignal("");
  const running = () => controlledRunning?.() ?? localRunning();
  const colormap = () => controlledColormap?.() ?? localColormap();

  createEffect(
    () => controlledRunning?.(),
    (nextRunning) => {
      if (nextRunning !== undefined) applyRunning(nextRunning);
    },
  );

  createEffect(
    () => colormap(),
    (nextColormap) => {
      if (colormapPicker) colormapPicker.value = nextColormap;
    },
  );

  const getFrameData = () => {
    const currentSource = activeSource();

    if (currentSource === "microphone" && analyser && microphoneFrame) {
      analyser.getByteFrequencyData(microphoneFrame);
      const nyquist = (audioContext?.sampleRate ?? 48000) / 2;
      const minimumFrequency = 30;
      const maximumFrequency = Math.max(minimumFrequency + 1, nyquist);
      for (let row = 0; row <= frequencySamples; row += 1) {
        const normalized = row / frequencySamples;
        const frequency =
          minimumFrequency *
          Math.pow(maximumFrequency / minimumFrequency, normalized);
        const bin = Math.min(
          microphoneFrame.length - 1,
          Math.round((frequency / nyquist) * microphoneFrame.length),
        );
        spectrumFrame[row] = (microphoneFrame[bin] ?? 0) / 255;
      }
      return spectrumFrame;
    }
    if (currentSource === "simulation") {
      writeSimulatedSpectrum(
        spectrumFrame,
        0,
        frequencySamples,
      );
      return spectrumFrame;
    }
    return undefined;
  };

  const releaseMicrophone = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    analyser = undefined;
    microphoneFrame = undefined;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
    audioContext = undefined;
  };

  const stopStream = (notify = false) => {
    requestId += 1;
    setActiveSource(undefined);
    releaseMicrophone();
    setLocalRunning(false);
    setStarting(false);
    setStatus("Stopped");
    if (notify) onRunningChange?.(false);
  };

  const handleSourceChange = (event: Event) => {
    const selected = (event as CustomEvent<{ value: string }>).detail.value;
    if (selected === "simulation" || selected === "microphone") {
      selectSource(selected);
    }
  };

  const handleCameraModeChange = (event: Event) => {
    const selected = (event as CustomEvent<{ value: string }>).detail.value;
    if (selected === "fixed" || selected === "orbit") {
      setCameraMode(selected);
    }
  };

  const handleColormapChange = (event: Event) => {
    const selected = (event as CustomEvent<{ value: string }>).detail.value;
    if (ColormapNames.includes(selected as ColormapName)) {
      const nextColormap = selected as ColormapName;
      colormapPicker.value = nextColormap;
      setLocalColormap(nextColormap);
      onColormapChange?.(nextColormap);
    }
  };

  const handleStreamClick = () => toggleStream();

  onSettled(() => {
    const startSimulation = (notify = false) => {
      requestId += 1;
      releaseMicrophone();
      setError("");
      setActiveSource("simulation");
      setSource("simulation");
      setStarting(false);
      setLocalRunning(true);
      setStatus("Simulation running");
      if (notify) onRunningChange?.(true);
    };

    const startMicrophone = async (notify = false) => {
      const currentRequest = ++requestId;
      setActiveSource(undefined);
      releaseMicrophone();
      setError("");
      setSource("microphone");
      setLocalRunning(false);
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
        microphoneFrame = new Uint8Array(nextAnalyser.frequencyBinCount);
        setActiveSource("microphone");
        setStarting(false);
        setLocalRunning(true);
        setStatus("Microphone running");
        if (notify) onRunningChange?.(true);
      } catch (cause) {
        nextStream?.getTracks().forEach((track) => track.stop());
        if (nextAudioContext && nextAudioContext.state !== "closed") {
          void nextAudioContext.close();
        }
        if (currentRequest === requestId) {
          setStarting(false);
          setLocalRunning(false);
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
      if (nextSource === "simulation") startSimulation(true);
      else void startMicrophone(true);
    };

    applyRunning = (nextRunning) => {
      untrack(() => {
        if (!nextRunning) {
          if (activeSource() || starting()) stopStream();
        } else if (!activeSource() && !starting()) {
          if (source() === "simulation") startSimulation();
          else void startMicrophone();
        }
      });
    };

    toggleStream = () => {
      if (running() || starting()) stopStream(true);
      else if (source() === "simulation") startSimulation(true);
      else void startMicrophone(true);
    };

    if (controlledRunning) applyRunning(controlledRunning());
    else if (attentionLevel() === 1) startSimulation();

    return () => {
      disposed = true;
      stopStream();
    };
  });

  return (
    <section
      class={styles.spectrogram}
      data-attention-level={attentionLevel()}
    >
      <Show when={attentionLevel() >= 2}>
        <div class={styles.controls}>
          <obc-toggle-button-group
            class={styles.source}
            prop:value={source()}
            variant="regular"
            hugText
            aria-label="Audio source"
            onChange={handleSourceChange}
          >
            <obc-toggle-button-option value="simulation">
              Simulation
            </obc-toggle-button-option>
            <obc-toggle-button-option value="microphone">
              Microphone
            </obc-toggle-button-option>
          </obc-toggle-button-group>
          <obc-button
            variant={running() || starting() ? "raised" : "normal"}
            onClick={handleStreamClick}
          >
            {starting() ? "Cancel" : running() ? "Stop" : "Start"}
          </obc-button>
          <obc-dropdown-button
            onChange={handleColormapChange}
            ref={(element) => {
              colormapPicker = element;
              colormapPicker.options = colormapOptions;
              colormapPicker.value = colormap();
            }}
          />
          <Show when={attentionLevel() === 3}>
            <obc-toggle-button-group
              class={styles.source}
              prop:value={cameraMode()}
              variant="regular"
              hugText
              aria-label="Camera controls"
              onChange={handleCameraModeChange}
            >
              <obc-toggle-button-option value="fixed">
                Fixed
              </obc-toggle-button-option>
              <obc-toggle-button-option value="orbit">
                Orbit
              </obc-toggle-button-option>
            </obc-toggle-button-group>
          </Show>
        </div>
      </Show>

      <div class={styles.heading}>
        <strong>{props.assetId}</strong>
        <span>L{attentionLevel()} · {status()}</span>
      </div>
      <Show when={error()}>
        <p class={styles.error} role="alert">{error()}</p>
      </Show>
      <div class={styles.scene}>
        <SpectrogramScene
          running={running}
          frameData={getFrameData}
          colormap={colormap}
          orbitEnabled={() => attentionLevel() === 3 && cameraMode() === "orbit"}
          onError={setError}
        />
      </div>
    </section>
  );
}