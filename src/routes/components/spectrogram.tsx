import { Title } from '@solidjs/meta';
import Spectrogram from '../../components/spectrogram';

export default function Home() {
  const title = 'Spectrogram';
  return (
    <main>
      <Title>Spectrogram</Title>
      <Spectrogram title={title}/>
    </main>
  );
}
