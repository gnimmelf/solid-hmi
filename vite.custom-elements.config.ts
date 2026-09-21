import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';

type CustomElementDefinition = {
  tag: string;
  source: string;
  props?: string[];
  events?: string[];
};

const projectRoot = process.cwd();
const indexPath = resolve(projectRoot, 'src/custom-elements/index.json');
const outputDirectory = resolve(projectRoot, 'dist/custom-elements');
const docsDirectory = resolve(projectRoot, 'dist/docs');
const definitions = JSON.parse(
  readFileSync(indexPath, 'utf8'),
) as CustomElementDefinition[];

function copyOpenBridgeCss(): Plugin {
  const stylesheet = resolve(
    projectRoot,
    'node_modules/@oicl/openbridge-webcomponents/dist/openbridge.css',
  );

  return {
    name: 'copy-openbridge-css',
    closeBundle() {
      mkdirSync(docsDirectory, { recursive: true });
      writeFileSync(join(docsDirectory, 'openbridge.css'), readFileSync(stylesheet, 'utf8'));
    },
  };
}

function customElementEntries(): Plugin {
  return {
    name: 'custom-element-entries',
    resolveId(id) {
      return id.startsWith('custom-element:') ? id : undefined;
    },
    load(id) {
      if (!id.startsWith('custom-element:')) {
        return undefined;
      }

      const tag = id.slice('custom-element:'.length);
      const definition = definitions.find((entry) => entry.tag === tag);

      if (!definition) {
        throw new Error(`No custom element definition found for ${tag}`);
      }

      const source = isAbsolute(definition.source)
        ? definition.source
        : resolve(dirname(indexPath), definition.source);
      const adapter = resolve(
        projectRoot,
        'src/custom-elements/solid-custom-element.tsx',
      );
      const propFactory = definition.props?.length
        ? `element => ({ ${definition.props
            .map((prop) => `${prop}: element.getAttribute(${JSON.stringify(prop)}) ?? ''`)
            .join(', ')}${definition.events?.includes('button-click') ? ", onButtonClick: () => element.dispatchEvent(new CustomEvent('button-click', { bubbles: true, composed: true }))" : ''} })`
        : 'undefined';

      return [
        `import component from ${JSON.stringify(source)};`,
        `import { defineSolidCustomElement } from ${JSON.stringify(adapter)};`,
        `defineSolidCustomElement(${JSON.stringify(tag)}, component, ${propFactory});`,
      ].join('\n');
    },
    closeBundle() {
      mkdirSync(outputDirectory, { recursive: true });
      mkdirSync(docsDirectory, { recursive: true });

      for (const definition of definitions) {
        const declaration = [
          `export interface ${toTypeName(definition.tag)}Element extends HTMLElement {`,
          ...(definition.props ?? []).map((prop) => `  ${prop}: string;`),
          '}',
          '',
          'declare global {',
          '  interface HTMLElementTagNameMap {',
          `    '${definition.tag}': ${toTypeName(definition.tag)}Element;`,
          '  }',
          ...(definition.events ?? []).map(
            (event) => `  interface GlobalEventHandlersEventMap { '${event}': CustomEvent<void>; }`,
          ),
          '}',
          '',
          'export {};',
          '',
        ].join('\n');

        writeFileSync(
          join(outputDirectory, `${definition.tag}.d.ts`),
          declaration,
        );

        const exportDirectory = join(docsDirectory, definition.tag);
        mkdirSync(exportDirectory, { recursive: true });
        writeFileSync(
          join(exportDirectory, 'index.html'),
          createCutomeElementDriverPage(definition, {
            cssPath: '../openbridge.css',
            modulePath: `../../custom-elements/${definition.tag}.js`,
          }),
        );
      }

      const indexDeclaration = definitions
        .map((definition) => `export * from './${definition.tag}.js';`)
        .join('\n');
      writeFileSync(join(outputDirectory, 'index.d.ts'), `${indexDeclaration}\n`);

      const indexModule = definitions
        .map((definition) => `import './${definition.tag}.js';`)
        .join('\n');
      writeFileSync(join(outputDirectory, 'index.js'), `${indexModule}\n`);
      writeFileSync(join(docsDirectory, 'index.html'), createDocsIndexPage());
    },
  };
}

function createCutomeElementDriverPage(
  definition: CustomElementDefinition,
  paths: { cssPath: string; modulePath: string },
) {
  const attributes = (definition.props ?? [])
    .map((prop) => ` ${prop}="${prop === 'title' ? 'Custom element test' : ''}"`)
    .join('');
  const eventLogger = (definition.events ?? [])
    .map(
      (event) =>
        `element.addEventListener(${JSON.stringify(event)}, () => output.textContent = ${JSON.stringify(`${event} received`)});`,
    )
    .join('\n      ');

  return `<!doctype html>
<html lang="en" data-obc-theme="night">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${definition.tag}</title>
    <link rel="stylesheet" href="${paths.cssPath}">
    <style>body { margin: 2rem; font-family: sans-serif; } #output { margin-top: 1rem; }</style>
  </head>
  <body>
    <h1>${definition.tag}</h1>
    <${definition.tag}${attributes}></${definition.tag}>
    <p id="output">Events will appear here.</p>
    <script type="module">
      import ${JSON.stringify(paths.modulePath)};
      const element = document.querySelector(${JSON.stringify(definition.tag)});
      const output = document.querySelector('#output');
      ${eventLogger}
    </script>
  </body>
</html>
`;
}

function createDocsIndexPage() {
  const links = definitions
    .map((definition) => `      <li><a href="./docs/${definition.tag}/index.html">${definition.tag}</a></li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Custom elements</title>
    <link rel="stylesheet" href="./openbridge.css">
    <style>body { margin: 2rem; font-family: sans-serif; } section { margin-bottom: 2rem; }</style>
  </head>
  <body>
    <h1>Custom elements</h1>
    <nav><ul>
${links}
    </ul></nav>
  </body>
</html>
`;
}

function toTypeName(tag: string) {
  return tag
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join('');
}

export default defineConfig({
  publicDir: false,
  plugins: [
    copyOpenBridgeCss(),
    solid({
      compiler: 'babel',
      ssr: false,
      solid: { generate: 'dom' },
      extensions: ['.jsx', '.tsx'],
    }),
    customElementEntries(),
  ],
  build: {
    target: 'esnext',
    outDir: outputDirectory,
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        definitions.map((definition) => [
          definition.tag,
          `custom-element:${definition.tag}`,
        ]),
      ),
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
    },
  },
});