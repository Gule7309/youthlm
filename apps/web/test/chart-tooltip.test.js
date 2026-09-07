import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadComponentSource(relativePath, requireModule = require) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(sourceUrl, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const componentModule = { exports: {} };
  compileFunction(outputText, ['require', 'module', 'exports'], {
    filename: fileURLToPath(sourceUrl),
  })(requireModule, componentModule, componentModule.exports);
  return componentModule.exports;
}

const utils = loadComponentSource('../src/app/components/ui/utils.ts');
const { ChartContainer, ChartTooltipContent } = loadComponentSource(
  '../src/app/components/ui/chart.tsx',
  (specifier) => {
    if (specifier === './utils') return utils;
    if (specifier === 'recharts') {
      return {
        ...require('recharts'),
        // SSR has no measured viewport. Replace only the layout wrapper;
        // render the real chart provider and tooltip, including its JSX guard.
        ResponsiveContainer: ({ children }) => React.createElement(React.Fragment, null, children),
      };
    }
    return require(specifier);
  },
);

function renderTooltip(value, overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(
      ChartContainer,
      { config: { count: { label: '統計值' } } },
      React.createElement(ChartTooltipContent, {
        active: true,
        hideLabel: true,
        payload: [{ dataKey: 'count', name: 'count', value, payload: { count: value } }],
        ...overrides,
      }),
    ),
  );
}

function renderedValues(html) {
  return [...html.matchAll(/<span class="[^"]*\btabular-nums\b[^"]*">([^<]*)<\/span>/g)]
    .map((match) => match[1]);
}

test('zero renders inside the formatted tooltip value span', () => {
  // Checking for any "0" text would miss the old guard: React renders a bare
  // zero for `0 && <span>`, without the value element or its typography.
  assert.deepEqual(renderedValues(renderTooltip(0)), ['0']);
});

test('positive and negative tooltip values retain locale formatting', () => {
  for (const value of [1234.5, -1234.5]) {
    assert.deepEqual(renderedValues(renderTooltip(value)), [value.toLocaleString()]);
  }
});

test('null omits the tooltip value span without throwing', () => {
  assert.deepEqual(renderedValues(renderTooltip(null)), []);
});

test('undefined omits the tooltip value span without throwing', () => {
  assert.deepEqual(renderedValues(renderTooltip(undefined)), []);
});

test('a custom tooltip formatter still receives zero', () => {
  const receivedValues = [];
  const html = renderTooltip(0, {
    formatter: (value) => {
      receivedValues.push(value);
      return React.createElement('strong', null, `值：${value}`);
    },
  });
  assert.deepEqual(receivedValues, [0]);
  assert.match(html, /<strong>值：0<\/strong>/);
  assert.deepEqual(renderedValues(html), []);
});

test('inactive and empty tooltips do not render a value', () => {
  assert.deepEqual(renderedValues(renderTooltip(0, { active: false })), []);
  assert.deepEqual(renderedValues(renderTooltip(0, { payload: [] })), []);
});
