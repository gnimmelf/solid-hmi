import { createSignal, onSettled, Show } from "solid-js";
import * as v from "valibot";
import { WindowChannelRegistry } from "../../lib/window-channel";
import Spectrogram from "../spectrogram";
import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import styles from "./style.module.css";

const AssetStateSchema = v.strictObject({ assetId: v.string() });

export default function SpectrogramWorkspace() {
  const url = new URL(window.location.href);
  const [assetId, setAssetId] = createSignal(
    url.searchParams.get("assetId") ?? "hydrophone-01",
  );
  const channel = new WindowChannelRegistry(
    "spectrogram_c2_demo",
    window.location.href,
    {
      schemaVersion: "1",
      state: {
        schema: AssetStateSchema,
        getSnapshot: () => ({ assetId: assetId() }),
        applySnapshot: (state) => {
          setAssetId(v.parse(AssetStateSchema, state).assetId);
        },
      },
    },
  );

  onSettled(() => channel.connect());

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
        <Spectrogram attentionLevel={3} assetId={assetId()} />
      </obc-card>

      <footer class={styles.footer}>
        <span>L3 isolates detailed monitoring and display controls.</span>
        <span>Operational truth remains in the backend.</span>
      </footer>
    </div>
  );
}