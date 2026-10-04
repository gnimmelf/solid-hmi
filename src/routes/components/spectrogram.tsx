import { Title } from '@solidjs/meta';
import Spectrogram from '../../components/spectrogram';

export default function Home() {
  const title = 'Spectrogram';
  return (
    <main style={{ display: 'flex', 'flex-direction': 'column', flex: '1', 'min-height': '0' }}>
      <Title>Spectrogram</Title>
      <Spectrogram title={title}/>
    </main>
  );
}
