import { Title } from '@solidjs/meta';
import OiclControlSurface from '../../components/oicl-control-surface';

export default function Home() {
  const title='Oicl Control Surface';
  return (
    <main>
      <Title>{title}</Title>

      <OiclControlSurface title={title} onButtonClick={() => alert("Click!")}/>
     
    </main>
  );
}
