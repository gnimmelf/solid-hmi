import '@oicl/openbridge-webcomponents/dist/components/card/card.js';
import '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import './style.css';


export default function OiclControlSurface(props: {
  title: string;
  onButtonClick?: () => void;
}) {
  return (
    <main>
      <obc-card showTitle={true}>
        <obc-button variant="normal" onClick={() => props.onButtonClick?.()}>Click Me!</obc-button>
        <div slot="title">{props.title}</div>
        <div>
          <p>Theme-ready web component demo</p>
          <p>
            Style tests:
          </p>        
            <ul>
              <li class="alert alarm">--alert-alarm-color</li>
              <li class="alert warning">--alert-warning-color</li>
              <li class="alert caution">--alert-caution-color</li>
            </ul>
        </div>
      </obc-card>
    </main>
  );
}
