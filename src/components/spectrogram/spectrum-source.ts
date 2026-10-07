import { createSignal, untrack } from "solid-js";
import { writeSimulatedSpectrum } from "../../lib/spectrogram-simulator.js";

export type AudioSource = "simulation" | "microphone";

type SpectrumSourceOptions = {
  onRunningChange?: (running: boolean) => void;
};

const FREQUENCY_SAMPLES = 128;
const MINIMUM_FREQUENCY_HZ = 30;

export function createSpectrumSource(options: SpectrumSourceOptions) {
  const resources: {
    audioContext?: AudioContext;
    stream?: MediaStream;
    analyser?: AnalyserNode;
    microphoneFrame?: Uint8Array<ArrayBuffer>;
    disposed: boolean;
    requestId: number;
  } = {
    disposed: false,
    requestId: 0,
  };
  const spectrumFrame = new Float32Array(FREQUENCY_SAMPLES + 1);
  const [source, setSource] = createSignal<AudioSource>("simulation");
  const [activeSource, setActiveSource] = createSignal<AudioSource>();
  const [running, setRunning] = createSignal(false);
  const [starting, setStarting] = createSignal(false);
  const [status, setStatus] = createSignal("Stopped");
  const [error, setError] = createSignal("");

  const releaseMicrophone = () => {
    resources.stream?.getTracks().forEach((track) => track.stop());
    if (
      resources.audioContext &&
      resources.audioContext.state !== "closed"
    ) {
      void resources.audioContext.close();
    }
    resources.stream = undefined;
    resources.audioContext = undefined;
    resources.analyser = undefined;
    resources.microphoneFrame = undefined;
  };

  const stop = (notify = false) => {
    resources.requestId += 1;
    setActiveSource(undefined);
    releaseMicrophone();
    setRunning(false);
    setStarting(false);
    setStatus("Stopped");
    if (notify) options.onRunningChange?.(false);
  };

  const startSimulation = (notify = false) => {
    resources.requestId += 1;
    releaseMicrophone();
    setError("");
    setActiveSource("simulation");
    setSource("simulation");
    setStarting(false);
    setRunning(true);
    setStatus("Simulation running");
    if (notify) options.onRunningChange?.(true);
  };

  const startMicrophone = async (notify = false) => {
    const currentRequest = ++resources.requestId;
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
      if (resources.disposed || currentRequest !== resources.requestId) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      nextAudioContext = new AudioContext();
      const nextAnalyser = nextAudioContext.createAnalyser();
      nextAnalyser.fftSize = 2048;
      nextAnalyser.smoothingTimeConstant = 0.72;
      nextAudioContext.createMediaStreamSource(nextStream).connect(nextAnalyser);
      await nextAudioContext.resume();
      if (resources.disposed || currentRequest !== resources.requestId) {
        nextStream.getTracks().forEach((track) => track.stop());
        await nextAudioContext.close();
        return;
      }
      resources.stream = nextStream;
      resources.audioContext = nextAudioContext;
      resources.analyser = nextAnalyser;
      resources.microphoneFrame = new Uint8Array(
        nextAnalyser.frequencyBinCount,
      );
      setActiveSource("microphone");
      setStarting(false);
      setRunning(true);
      setStatus("Microphone running");
      if (notify) options.onRunningChange?.(true);
    } catch (cause) {
      nextStream?.getTracks().forEach((track) => track.stop());
      if (nextAudioContext && nextAudioContext.state !== "closed") {
        void nextAudioContext.close();
      }
      if (currentRequest === resources.requestId) {
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

  const start = (nextSource: AudioSource, notify = false) => {
    if (nextSource === "simulation") startSimulation(notify);
    else void startMicrophone(notify);
  };

  const applyRunning = (nextRunning: boolean) => {
    untrack(() => {
      if (!nextRunning) {
        if (activeSource() || starting()) stop();
      } else if (!activeSource() && !starting()) {
        start(source());
      }
    });
  };

  const applySource = (nextSource: AudioSource) => {
    untrack(() => {
      if (nextSource === source()) return;
      if (activeSource() || starting()) start(nextSource);
      else setSource(nextSource);
    });
  };

  const toggle = (effectiveRunning: boolean) => {
    if (effectiveRunning || starting()) stop(true);
    else start(source(), true);
  };

  const getFrameData = () => {
    if (
      activeSource() === "microphone" &&
      resources.analyser &&
      resources.microphoneFrame
    ) {
      resources.analyser.getByteFrequencyData(resources.microphoneFrame);
      const nyquist = (resources.audioContext?.sampleRate ?? 48000) / 2;
      const maximumFrequency = Math.max(MINIMUM_FREQUENCY_HZ + 1, nyquist);
      for (let row = 0; row <= FREQUENCY_SAMPLES; row += 1) {
        const normalized = row / FREQUENCY_SAMPLES;
        const frequency =
          MINIMUM_FREQUENCY_HZ *
          Math.pow(maximumFrequency / MINIMUM_FREQUENCY_HZ, normalized);
        const bin = Math.min(
          resources.microphoneFrame.length - 1,
          Math.round(
            (frequency / nyquist) * resources.microphoneFrame.length,
          ),
        );
        spectrumFrame[row] = (resources.microphoneFrame[bin] ?? 0) / 255;
      }
      return spectrumFrame;
    }
    if (activeSource() === "simulation") {
      writeSimulatedSpectrum(spectrumFrame, 0, FREQUENCY_SAMPLES);
      return spectrumFrame;
    }
    return undefined;
  };

  const dispose = () => {
    resources.disposed = true;
    stop();
  };

  return {
    source,
    running,
    starting,
    status,
    error,
    setError,
    start,
    applyRunning,
    applySource,
    toggle,
    getFrameData,
    dispose,
  };
}