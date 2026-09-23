import { Title } from '@solidjs/meta';
import ChannelApi from '../../components/channel-api';

export default function Home() {
  const title = 'Channel Api';
  return (
    <main>
      <Title>Channel Api</Title>
      <ChannelApi title={title}/>    
    </main>
  );
}
