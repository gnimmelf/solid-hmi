import '@oicl/openbridge-webcomponents/dist/openbridge.css';
import '@oicl/openbridge-webcomponents/dist/components/card/card.js';
import '@oicl/openbridge-webcomponents/dist/components/button/button.js';

export default function OiclControlSurface() {
  return (
    <main>

      <obc-card showTitle={true}>
        <obc-button variant="normal" onClick={() => console.log('!')}>Click Me!</obc-button>
        <div slot="title">Control Surface</div>
        <div style={{ color: 'var(--element-neutral-color)' }}>
          <p style={{ color: 'var(--alert-alarm-color)' }}>Theme-ready web component demo</p>
          <p>Test</p>
        </div>
      </obc-card>
    </main>
  );
}
