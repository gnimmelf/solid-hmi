import { createSignal, onSettled, Show, untrack } from "solid-js";
import * as v from "valibot";
import { WindowChannelRegistry } from "../../lib/window-channel";
import {
  getTheme,
  setTheme,
  THEME_CHANGE_EVENT,
  type ThemeName,
} from "../../lib/theme";
import Spectrogram from "../spectrogram";
import {
  SpectrogramChannelSchemas,
  SpectrogramStateSchema,
  type ColormapName,
  type SpectrumSourceOption,
} from "../spectrogram/channel";
import styles from "./style.module.css";

export default function SpectrogramWorkspace() {
  const url = new URL(window.location.href);
  const [assetId, setAssetId] = createSignal(
    url.searchParams.get("assetId") ?? "hydrophone-01",
  );
  const [running, setRunning] = createSignal(false);
  const [colormap, setColormap] = createSignal<ColormapName>("viridis");
  const [spectrumSource, setSpectrumSource] =
    createSignal<SpectrumSourceOption>("simulation");
  const channel = new WindowChannelRegistry(
    "spectrogram_c2_demo",
    window.location.href,
    {
      schemas: SpectrogramChannelSchemas,
      schemaVersion: "2",
      state: {
        schema: SpectrogramStateSchema,
        getSnapshot: () =>
          untrack(() => ({
            assetId: assetId(),
            running: running(),
            colormap: colormap(),
            theme: getTheme(),
            spectrumSource: spectrumSource(),
          })),
        applySnapshot: (state) => {
          const snapshot = v.parse(SpectrogramStateSchema, state);
          setAssetId(snapshot.assetId);
          setRunning(snapshot.running);
          setColormap(snapshot.colormap);
          setTheme(snapshot.theme, false);
          setSpectrumSource(snapshot.spectrumSource);
        },
      },
    },
  );

  onSettled(() => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "spectrogram-controls") {
        setRunning(message.data.running);
        setColormap(message.data.colormap);
        setSpectrumSource(message.data.spectrumSource);
      } else if (message.type === "theme") {
        setTheme(message.data.theme, false);
      }
    });
    const handleThemeChange = (event: Event) => {
      const theme = (event as CustomEvent<ThemeName>).detail;
      void channel.broadcast("theme", { theme });
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    const disconnect = channel.connect();
    return () => {
      unsubscribe();
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      disconnect();
    };
  });

  const broadcastControls = (
    nextRunning: boolean,
    nextColormap: ColormapName,
    nextSpectrumSource: SpectrumSourceOption,
  ) => {
    setRunning(nextRunning);
    setColormap(nextColormap);
    setSpectrumSource(nextSpectrumSource);
    void channel.broadcast("spectrogram-controls", {
      running: nextRunning,
      colormap: nextColormap,
      spectrumSource: nextSpectrumSource,
    });
  };

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <div>
          <span class={styles.eyebrow}>Dedicated analysis · L3</span>
          <h1>Acoustic spectrum workspace</h1>
        </div>
        <div class={styles.identity}>
          <span>{channel.ready() ? "Synchronized" : "Connecting"}</span>
          <code>{channel.windowId.slice(0, 8)}</code>
        </div>
      </header>

      <Show when={channel.error()}>
        {(error) => <p class={styles.error} role="alert">{error()}</p>}
      </Show>

      <section class={styles.surface} aria-label="Detailed spectrum">
        <h2>{assetId()} · detailed spectrum</h2>
        <Spectrogram
          attentionLevel={3}
          assetId={assetId()}
          running={running}
          colormap={colormap}
          spectrumSource={spectrumSource}
          onRunningChange={(nextRunning) =>
            broadcastControls(nextRunning, colormap(), spectrumSource())
          }
          onColormapChange={(nextColormap) =>
            broadcastControls(running(), nextColormap, spectrumSource())
          }
          onSpectrumSourceChange={(nextSpectrumSource) =>
            broadcastControls(running(), colormap(), nextSpectrumSource)
          }
        />
      </section>

      <footer class={styles.footer}>
        <span>L3 isolates detailed monitoring and display controls.</span>
        <span>Operational truth remains in the backend.</span>
      </footer>
    </div>
  );
}