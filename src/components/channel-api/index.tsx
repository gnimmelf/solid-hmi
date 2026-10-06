import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import { createSignal, For, onSettled, Show } from "solid-js";
import * as v from "valibot";
import {
  WindowChannelRegistry,
  type WindowChannelMessage,
} from "../../lib/window-channel";
import styles from "./style.module.css";

const MessageSchemas = {
  message: v.strictObject({ propA: v.string() }),
  volume: v.strictObject({
    value: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  }),
};
const StateSchema = v.strictObject({
  volume: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
});

export default function ChannelApi(props: { title: string }) {
  const [messages, setMessages] = createSignal<WindowChannelMessage[]>([]);
  const [volume, setVolume] = createSignal(0);
  const channel = new WindowChannelRegistry(
    "app_window_sync",
    window.location.href,
    {
      schemas: MessageSchemas,
      schemaVersion: "1",
      state: {
        schema: StateSchema,
        getSnapshot: () => ({ volume: volume() }),
        applySnapshot: (state) => {
          const snapshot = v.parse(StateSchema, state);
          setVolume(snapshot.volume);
        },
      },
    },
  );

  onSettled(() => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "volume") {
        setVolume(message.data.value);
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
        {props.title} - {channel.isRoot ? "Root window" : "Child window"} -
        Window ID: {channel.windowId}
      </div>

      <div class={styles["card-content"]}>
        <section class={styles.controls}>
          <div class={styles["section-title"]}>Window channel controls</div>
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
                Open child HMI window
              </obc-button>
              <div>Live child window peers: {channel.peers().length}</div>
              <For each={channel.peers()}>
                {(peerId) => (
                  <obc-button
                    onClick={() =>
                      channel.sendDirect(peerId, "message", {
                        propA: `Addressed message from root window to ${peerId}`,
                      })
                    }
                  >
                    Send addressed message to {peerId}
                  </obc-button>
                )}
              </For>
            </div>
          </Show>

          <Show when={!channel.isRoot}>            
            <obc-button
              onClick={() =>
                channel.sendDirect(channel.rootId, "message", {
                  propA: "Addressed message from child window to root window",
                })
              }
            >
              Send addressed message to root window
            </obc-button>
            <div>Root window ID: {channel.rootId}</div>
          </Show>

          <div class={styles.controls}>
            <obc-button
              onClick={() => channel.broadcast("message", { propA: "value" })}
            >
              Broadcast application message
            </obc-button>
            <div>
              <label for="volume">Synchronized presentation volume:</label>
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
          <div class={styles["section-title"]}>
            Received application messages
          </div>
          <For each={messages()}>
            {(message) => (
              <div class={styles["recieved-message"]}>
                {JSON.stringify(message)}
              </div>
            )}
          </For>
        </section>
      </div>
    </obc-card>
  );
}
