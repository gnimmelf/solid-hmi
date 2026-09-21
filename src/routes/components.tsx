import { Title } from '@solidjs/meta';
import OiclControlSurface from '../components/OiclControlSurface/OiclControlSurface';

export default function Home() {
  return (
    <main>
      <Title>OICL - Webcomponents PoC</Title>

      <OiclControlSurface title='Oicl Control Surface' onButtonClick={() => alert("Click!")}/>

      
    </main>
  );
}
