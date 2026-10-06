import { createSignal, onSettled, Show } from "solid-js";
import * as v from "valibot";
import { WindowChannelRegistry } from "../../lib/window-channel";
import Spectrogram from "../spectrogram";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import styles from "./style.module.css";

const AssetStateSchema = v.strictObject({ assetId: v.string() });

export default function SpectrogramDashboard() {
  const [attentionLevel, setAttentionLevel] = createSignal<1 | 2>(1);
  const [assetId, setAssetId] = createSignal("hydrophone-01");
  const [popupError, setPopupError] = createSignal("");
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

  const castToL3 = () => {
    const target = new URL("/pages/spectrogram-detail", window.location.origin);
    target.searchParams.set("assetId", assetId());
    target.searchParams.set("level", "3");
    if (channel.openChild(target.href)) {
      setPopupError("");
    } else {
      setPopupError("The L3 window was blocked. Allow popups and try again.");
    }
  };

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <h1>Acoustic operations</h1>
        <span>
          {channel.peers().length} detailed view
          {channel.peers().length === 1 ? "" : "s"}
        </span>
      </header>

      <div class={styles.layout}>
        <section class={styles.overview} aria-label="Operational overview">
          <section class={styles.widget}>
            <h2>Forward hydrophone array</h2>
            <div class={styles.actions}>
              <obc-button
                variant={attentionLevel() === 2 ? "raised" : "normal"}
                onClick={() =>
                  setAttentionLevel((level) => (level === 1 ? 2 : 1))
                }
              >
                {attentionLevel() === 1 ? "Inspect at L2" : "Return to L1"}
              </obc-button>
              <obc-button variant="raised" onClick={castToL3}>
                Open L3 workspace
              </obc-button>
            </div>
            <Show
              when={attentionLevel() === 1}
              fallback={<Spectrogram attentionLevel={2} assetId={assetId()} />}
            >
              <Spectrogram attentionLevel={1} assetId={assetId()} />
            </Show>
          </section>

          <dl class={styles.summary}>
            <div>
              <dt>Array state</dt>
              <dd>Nominal</dd>
            </div>
            <div>
              <dt>Peak band</dt>
              <dd>2.4 kHz</dd>
            </div>
            <div>
              <dt>Signal margin</dt>
              <dd>18 dB</dd>
            </div>
          </dl>
        </section>

        <aside class={styles.context}>
          <span>Attention model</span>
          <h2>{attentionLevel() === 1 ? "Monitor" : "Inspect"}</h2>
          <p>
            {attentionLevel() === 1
              ? "L1 keeps status and attention cues compact inside the operational overview."
              : "L2 expands the live view and basic controls while preserving dashboard context."}
          </p>
          <dl class={styles.details}>
            <div><dt>Asset</dt><dd>{assetId()}</dd></div>
            <div><dt>Current level</dt><dd>L{attentionLevel()}</dd></div>
            <div><dt>L3 peers</dt><dd>{channel.peers().length}</dd></div>
          </dl>
          <Show when={popupError()}>
            <p class={styles.error} role="alert">{popupError()}</p>
          </Show>
          <Show when={channel.error()}>
            {(error) => <p class={styles.error} role="alert">{error()}</p>}
          </Show>
        </aside>
      </div>
    </div>
  );
}
