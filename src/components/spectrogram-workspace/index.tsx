import { createSignal, onSettled, Show, untrack } from "solid-js";
import * as v from "valibot";
import { WindowChannelRegistry } from "../../lib/window-channel";
import Spectrogram from "../spectrogram";
import {
  SpectrogramChannelSchemas,
  SpectrogramStateSchema,
  type ColormapName,
} from "../spectrogram/channel";
import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import styles from "./style.module.css";

export default function SpectrogramWorkspace() {
  const url = new URL(window.location.href);
  const [assetId, setAssetId] = createSignal(
    url.searchParams.get("assetId") ?? "hydrophone-01",
  );
  const [running, setRunning] = createSignal(false);
  const [colormap, setColormap] = createSignal<ColormapName>("viridis");
  const channel = new WindowChannelRegistry(
    "spectrogram_c2_demo",
    window.location.href,
    {
      schemas: SpectrogramChannelSchemas,
      schemaVersion: "1",
      state: {
        schema: SpectrogramStateSchema,
        getSnapshot: () =>
          untrack(() => ({
            assetId: assetId(),
            running: running(),
            colormap: colormap(),
          })),
        applySnapshot: (state) => {
          const snapshot = v.parse(SpectrogramStateSchema, state);
          setAssetId(snapshot.assetId);
          setRunning(snapshot.running);
          setColormap(snapshot.colormap);
        },
      },
    },
  );

  onSettled(() => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "spectrogram-controls") return;
      setRunning(message.data.running);
      setColormap(message.data.colormap);
    });
    const disconnect = channel.connect();
    return () => {
      unsubscribe();
      disconnect();
    };
  });

  const broadcastControls = (nextRunning: boolean, nextColormap: ColormapName) => {
    setRunning(nextRunning);
    setColormap(nextColormap);
    void channel.broadcast("spectrogram-controls", {
      running: nextRunning,
      colormap: nextColormap,
    });
  };

  return (
    <div class={styles.workspace}>
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

      <obc-card class={styles.surface}>
        <div slot="title">{assetId()} · detailed spectrum</div>
        <Spectrogram
          attentionLevel={3}
          assetId={assetId()}
          running={running}
          colormap={colormap}
          onRunningChange={(nextRunning) =>
            broadcastControls(nextRunning, colormap())
          }
          onColormapChange={(nextColormap) =>
            broadcastControls(running(), nextColormap)
          }
        />
      </obc-card>

      <footer class={styles.footer}>
        <span>L3 isolates detailed monitoring and display controls.</span>
        <span>Operational truth remains in the backend.</span>
      </footer>
    </div>
  );
}