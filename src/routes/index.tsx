import { marked } from 'marked';
import readme from '../../README.md?raw';

const readmeHtml = marked.parse(readme) as string;

export default function Home() {
  return (
    <main>
      {/* oxlint-disable-next-line solid/no-innerhtml -- README.md is bundled from this repository. */}
      <article class="readme" innerHTML={readmeHtml} />
    </main>
  );
}
