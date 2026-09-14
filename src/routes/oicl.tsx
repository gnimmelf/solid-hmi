import { Title } from '@solidjs/meta';
import OiclControlSurface from '../components/OiclControlSurface/OiclControlSurface';

export default function Home() {
  return (
    <main>
      <Title>OICL - Webcomponents PoC</Title>
      Component below:
      <OiclControlSurface title='Oicl COntrol Surface' onButtonClick={() => console.log("!")}/>
    </main>
  );
}
