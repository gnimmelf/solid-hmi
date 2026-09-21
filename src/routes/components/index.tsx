import { Title } from '@solidjs/meta';

const pageEntries = Object.entries(import.meta.glob('./*.tsx', { eager: true }))
  .filter(([file]) => file !== './index.tsx')
  .map(([file, module]) => {
    const slug = file.replace(/^\.\//, '').replace(/\.tsx$/, '');

    return {
      href: `/components/${slug}`,
      label: slug
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      module,
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export default function ComponentsIndex() {
  return (
    <main>
      <Title>Components</Title>
      <h1>Components</h1>
      <nav>
        <ul>
          {pageEntries.map((page) => (
            <li>
              <a href={page.href}>{page.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
