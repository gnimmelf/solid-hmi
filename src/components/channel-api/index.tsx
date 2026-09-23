import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import { createSignal } from "solid-js";

export default function ChannelApi(props: { title: string }) {
  const myChannel = new BroadcastChannel("app_window_sync");

  const [messages, setMessages] = createSignal<any[]>([]);

  myChannel.onmessage = (event) => {
    setMessages([
      ...messages(),
      {
        data: event.data,
        ts: new Date(),
      },
    ]);
  };

  const launchNewWindow = (url = window.location.href) => {
    const newWindow = window.open(url, "_blank");

    if (!newWindow) {
      console.error("Popup blocked! Please allow popups for this site.");
    }
  };

  const sendMessageToWindows = (data: any) => {
    myChannel.postMessage(data);
  };

  return (
    <obc-card>
      <div slot="title">{props.title}</div>
      <div>
        <obc-button onClick={() => launchNewWindow()}>
          Launch other Window
        </obc-button>
        <obc-button
          onClick={() => sendMessageToWindows(`Message: ${messages().length}`)}
        >
          Send message
        </obc-button>
      </div>
      <div>
        <div>Recieved messages</div>
        {messages().map((message: any) => (
          <div>{JSON.stringify(message)}</div>
        ))}
      </div>
    </obc-card>
  );
}
