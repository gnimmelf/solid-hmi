import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import { createEffect, createSignal, onSettled, Show } from "solid-js";
import "./style.css";

type MessageType = "volume" | "register";

type Message = {
  type: MessageType;
  sender: string;
  ts: string;
  data: any;
};

const ID_PARAM = "uuid";

function getWindowId() {
  const url = new URL(window.location.href);
  return url.searchParams.get(ID_PARAM) ?? "root";
}

export default function ChannelApi(props: { title: string }) {
  const myChannel = new BroadcastChannel("app_window_sync");

  const [messages, setMessages] = createSignal<any[]>([]);
  const [peers, setPeers] = createSignal<any[]>([]);

  const windowId = getWindowId();

  const [volume, setVolume] = createSignal(0);
  const [outboundVolume, setOutboundVolume] = createSignal<number>();

  myChannel.onmessage = (event) => {
    const message = JSON.parse(event.data) as Message;
    if (message.type === "volume") {
      setVolume(message.data.value);
    } else if (message.type === "register") {
      setPeers([peers(), message.sender]);
    } else {
      setMessages([...messages(), message]);
    }
  };

  const launchNewWindow = (url = window.location.href) => {
    const newWindow = window.open(
      `${url}?${ID_PARAM}=${crypto.randomUUID()}`,
      "_blank",
    );

    if (!newWindow) {
      console.error("Popup blocked! Please allow popups for this site.");
    }
  };

  const broadcast = (data: any, type?: MessageType) => {
    myChannel.postMessage(
      JSON.stringify({
        type: type ?? "",
        sender: windowId,
        ts: new Date(),
        data,
      }),
    );
  };

  const syncVolume = (value: number) => {
    console.log("!");
    broadcast({ value }, "volume");
  };

  createEffect(
    () => outboundVolume(),
    (value) => {
      if (value !== undefined) {
        syncVolume(value);
      }
    },
  );

  onSettled(() => {
    broadcast({}, "register");
  });

  return (
    <obc-card>
      <div slot="title">
        {props.title} - {windowId}
      </div>
      <Show when={windowId === "root"}>
        <div class="controls">
          <obc-button onClick={() => launchNewWindow()}>
            Launch other Window
          </obc-button>
          <div>Sub window count: {peers().length}</div>
        </div>
      </Show>

      <div class="controls">
        <obc-button onClick={() => broadcast({ propA: "value" })}>
          Send test message
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
              setOutboundVolume(value);
            }}
          />
        </div>
      </div>

      <div>
        <div>Received messages</div>
        {messages().map((message: Message) => (
          <div>{JSON.stringify(message)}</div>
        ))}
      </div>
    </obc-card>
  );
}
