import { onSettled, createSignal } from "solid-js";
import type { ObcButton } from "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import type { ObcToggleButtonGroup } from "@oicl/openbridge-webcomponents/dist/components/toggle-button-group/toggle-button-group.js";
import SpectrogramScene from "./scene";
import { writeSimulatedSpectrum } from "./simulator.js";
import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-group/toggle-button-group.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import "./style.css";

type AudioSource = "simulation" | "microphone";

export default function Spectrogram(props: { title: string }) {
  let sourcePicker!: ObcToggleButtonGroup;
  let streamButton!: ObcButton;
  let audioContext: AudioContext | undefined;
  let stream: MediaStream | undefined;
  let analyser: AnalyserNode | undefined;
  let microphoneFrame: Uint8Array<ArrayBuffer> | undefined;
  let disposed = false;
  let requestId = 0;
  const frequencySamples = 128;
  const spectrumFrame = new Float32Array(frequencySamples + 1);
  let selectSource = (_source: AudioSource) => {};
  const [source, setSource] = createSignal<AudioSource>("simulation");
  const [activeSource, setActiveSource] = createSignal<AudioSource>();
  const [running, setRunning] = createSignal(false);
  const [starting, setStarting] = createSignal(false);
  const [status, setStatus] = createSignal("Stopped");
  const [error, setError] = createSignal("");

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
        performance.now() / 1000,
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

  const stopStream = () => {
    requestId += 1;
    setActiveSource(undefined);
    releaseMicrophone();
    setRunning(false);
    setStarting(false);
    setStatus("Stopped");
  };

  onSettled(() => {
    const startSimulation = () => {
      requestId += 1;
      releaseMicrophone();
      setError("");
      setActiveSource("simulation");
      setSource("simulation");
      setStarting(false);
      setRunning(true);
      setStatus("Simulation running");
    };

    const startMicrophone = async () => {
      const currentRequest = ++requestId;
      setActiveSource(undefined);
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
        microphoneFrame = new Uint8Array(nextAnalyser.frequencyBinCount);
        setActiveSource("microphone");
        setStarting(false);
        setRunning(true);
        setStatus("Microphone running");
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
      sourcePicker.removeEventListener("change", handleSourceChange);
      streamButton.removeEventListener("click", handleStreamClick);
      stopStream();
    };
  });

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
        <SpectrogramScene
          running={running}
          frameData={getFrameData}
          onError={setError}
        />
      </obc-card>
    </section>
  );
}
