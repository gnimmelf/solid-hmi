import "@oicl/openbridge-webcomponents/dist/components/card/card.js";
import "@oicl/openbridge-webcomponents/dist/components/button/button.js";
import "./style.css";

export default function Spectrogram(props: { title: string }) {


  return (
    <obc-card>
      <div slot="title">
        {props.title}
      </div>
      Spectrogram component content goes here.
    </obc-card>
  );
}
