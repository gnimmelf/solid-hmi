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
import { ColormapNames, SpectrumSourceOption, type ColormapName } from "./channel";
import { createSpectrumSource } from "./spectrum-source.js";
import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import "@oicl/openbridge-webcomponents/dist/components/dropdown-button/dropdown-button.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-group/toggle-button-group.js";
import "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import styles from "./style.module.css";

export type SpectrogramAttentionLevel = 1 | 2 | 3;

type SpectrogramProps = {
  attentionLevel: SpectrogramAttentionLevel;
  assetId: string;
  running?: Accessor<boolean>;
  colormap?: Accessor<ColormapName>;
  spectrumSource?: Accessor<SpectrumSourceOption>;
  onRunningChange?: (running: boolean) => void;
  onColormapChange?: (colormap: ColormapName) => void;
  onSpectrumSourceChange?: (spectrumSource: SpectrumSourceOption) => void
};

export default function Spectrogram(props: SpectrogramProps) {
  const attentionLevel = () => props.attentionLevel;
  const controlledRunning = untrack(() => props.running);
  const controlledColormap = untrack(() => props.colormap);
  const controlledSpectrumSource = untrack(() => props.spectrumSource);
  const onRunningChange = untrack(() => props.onRunningChange);
  const onColormapChange = untrack(() => props.onColormapChange);
  const onSpectrumSourceChange = untrack(() => props.onSpectrumSourceChange);
  const [colormapPicker, setColormapPicker] =
    createSignal<ObcDropdownButton>();
  const colormapOptions: ObcDropdownButton["options"] = ColormapNames.map(
    (value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }),
  );
  const spectrumSource = createSpectrumSource({ onRunningChange });
  const [cameraMode, setCameraMode] = createSignal<"fixed" | "orbit">("fixed");
  const [localColormap, setLocalColormap] = createSignal<ColormapName>("viridis");
  const running = () => controlledRunning?.() ?? spectrumSource.running();
  const colormap = () => controlledColormap?.() ?? localColormap();

  createEffect(
    () => ({
      running: controlledRunning?.(),
      source: controlledSpectrumSource?.(),
    }),
    ({ running: nextRunning, source: nextSource }) => {
      if (nextRunning !== undefined && nextSource !== undefined) {
        spectrumSource.applyState(nextSource, nextRunning);
      } else if (nextRunning !== undefined) {
        spectrumSource.applyRunning(nextRunning);
      } else if (nextSource !== undefined) {
        spectrumSource.applySource(nextSource);
      }
    },
  );

  createEffect(
    () => colormap(),
    (nextColormap) => {
      const picker = colormapPicker();
      if (picker) picker.value = nextColormap;
    },
  );

  const handleSourceChange = (event: Event) => {
    const selected = (event as CustomEvent<{ value: string }>).detail.value;
    if (selected === "simulation" || selected === "microphone") {
      spectrumSource.start(selected, true);
      onSpectrumSourceChange?.(selected)
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
      const picker = colormapPicker();
      if (picker) picker.value = nextColormap;
      setLocalColormap(nextColormap);
      onColormapChange?.(nextColormap);
    }
  };

  const handleStreamClick = () => spectrumSource.toggle(running());

  onSettled(() => {
    return spectrumSource.dispose;
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
            prop:value={spectrumSource.source()}
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
            variant={running() || spectrumSource.starting() ? "raised" : "normal"}
            onClick={handleStreamClick}
          >
            {spectrumSource.starting() ? "Cancel" : running() ? "Stop" : "Start"}
          </obc-button>
          <obc-dropdown-button
            onChange={handleColormapChange}
            ref={(element) => {
              element.options = colormapOptions;
              element.value = colormap();
              setColormapPicker(element);
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
        <span>L{attentionLevel()} · {spectrumSource.status()}</span>
      </div>
      <Show when={spectrumSource.error()}>
        <p class={styles.error} role="alert">{spectrumSource.error()}</p>
      </Show>
      <div class={styles.scene}>
        <SpectrogramScene
          running={running}
          frameData={spectrumSource.getFrameData}
          colormap={colormap}
          orbitEnabled={() => attentionLevel() === 3 && cameraMode() === "orbit"}
          onError={spectrumSource.setError}
        />
      </div>
    </section>
  );
}