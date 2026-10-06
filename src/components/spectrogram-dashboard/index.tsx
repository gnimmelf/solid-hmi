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
} from "../spectrogram/channel";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import styles from "./style.module.css";

export default function SpectrogramDashboard() {
  const [attentionLevel, setAttentionLevel] = createSignal<1 | 2>(1);
  const [assetId, setAssetId] = createSignal("hydrophone-01");
  const [running, setRunning] = createSignal(true);
  const [colormap, setColormap] = createSignal<ColormapName>("viridis");
  const [popupError, setPopupError] = createSignal("");
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
          })),
        applySnapshot: (state) => {
          const snapshot = v.parse(SpectrogramStateSchema, state);
          setAssetId(snapshot.assetId);
          setRunning(snapshot.running);
          setColormap(snapshot.colormap);
          setTheme(snapshot.theme, false);
        },
      },
    },
  );

  onSettled(() => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "spectrogram-controls") {
        setRunning(message.data.running);
        setColormap(message.data.colormap);
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

  const broadcastControls = (nextRunning: boolean, nextColormap: ColormapName) => {
    if (attentionLevel() < 2) return;
    setRunning(nextRunning);
    setColormap(nextColormap);
    void channel.broadcast("spectrogram-controls", {
      running: nextRunning,
      colormap: nextColormap,
    });
  };

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
            <Spectrogram
              attentionLevel={attentionLevel()}
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
