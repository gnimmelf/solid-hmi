import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import { createSignal, For, onSettled, Show } from "solid-js";
import {
  WindowChannelRegistry,
  type WindowChannelMessage,
} from "../../lib/window-channel";
import styles from "./style.module.css";

export default function ChannelApi(props: { title: string }) {
  const channel = new WindowChannelRegistry("app_window_sync");
  const [messages, setMessages] = createSignal<WindowChannelMessage[]>([]);
  const [volume, setVolume] = createSignal(0);

  onSettled(() => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "volume") {
        const data = message.data as { value?: unknown };
        if (typeof data.value === "number") setVolume(data.value);
      } else {
        setMessages((messages) => [...messages, message]);
      }
    });
    const disconnect = channel.connect();

    return () => {
      unsubscribe();
      disconnect();
    };
  });

  return (
    <obc-card class={styles.root}>
      <div slot="title">
        {props.title} - {channel.windowId}
      </div>

      <div class={styles["card-content"]}>

        <section class={styles.controls}>
          <Show when={channel.isRoot}>
            <div class={styles.controls}>
              <obc-button
                onClick={() => {
                  if (!channel.openChild()) {
                    console.error(
                      "Popup blocked! Please allow popups for this site.",
                    );
                  }
                }}
              >
                Launch other Window
              </obc-button>
              <div>Sub window count: {channel.peers().length}</div>
            </div>
          </Show>

          <div class={styles.controls}>
            <obc-button
              onClick={() => channel.broadcast("message", { propA: "value" })}
            >
              Broadcast test message
            </obc-button>
            <div>
              <label for="volume">Volume Control:</label>
              <br />
              <input
                type="range"
                id="volume"
                name="volume"
                min="0"
                max="100"
                value={volume()}
                step="5"
                onInput={(event) => {
                  const value = parseInt(event.currentTarget.value);
                  setVolume(value);
                  channel.broadcast("volume", { value });
                }}
              />
            </div>
          </div>
        </section>

        <section class={styles.messages}>
          <div>Received messages</div>
          <For each={messages()}>
            {(message) => <div>{JSON.stringify(message)}</div>}
          </For>
        </section>
      </div>
    </obc-card>
  );
}
