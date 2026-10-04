import { marked } from 'marked';
import readme from '../../README.md?raw';
import { Title } from '@solidjs/meta';

const readmeHtml = marked.parse(readme) as string;

export default function Home() {
  return (
    <main>
      <Title>Solid HMI</Title>
      <article class="readme" innerHTML={readmeHtml} />
    </main>
  );
}
