const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((component) => {
    const value = parseInt(component, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const directory of ['', 'dist/']) {
  const prefix = directory || 'source/';
  const css = fs.readFileSync(path.join(__dirname, '..', directory, 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', directory, 'index.html'), 'utf8');
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[a-f0-9]{6});/gi)]
    .map((match) => [match[1], match[2]]));

  test(prefix + 'neutral surfaces keep labels and functional colors readable', () => {
    const pairs = [];
    for (const background of ['paper', 'panel', 'surface', 'surface-strong', 'accent-soft']) {
      for (const text of ['ink', 'muted', 'accent']) pairs.push([text, background]);
    }
    pairs.push(['danger', 'danger-soft'], ['warning', 'warning-soft']);
    for (const [text, background] of pairs) {
      assert.ok(contrast(tokens[text], tokens[background]) >= 4.5, text + ' on ' + background);
    }
    for (const background of ['accent', 'accent-dark', 'danger']) {
      assert.ok(contrast('#ffffff', tokens[background]) >= 4.5, 'white on ' + background);
    }
    assert.ok(contrast(tokens.focus, tokens.panel) >= 3, 'keyboard focus remains visible');
  });

  test(prefix + 'header stays translucent and sticky without abstract colored decoration', () => {
    const header = /\.site-header \{([^}]+)\}/.exec(css)[1];
    assert.match(header, /position: sticky/);
    assert.match(header, /background: rgba\(255, 255, 255, \.78\)/);
    assert.doesNotMatch(css, /\.site-header::(?:before|after)/);
    assert.doesNotMatch(css, /(?:linear|radial)-gradient\(/);
    assert.match(html, /name="theme-color" content="#f3f1eb"/);
    assert.match(html, /styles\.css\?v=20261025-paper-palette/);
  });

  test(prefix + 'selection, disabled actions and stock errors retain separate visual states', () => {
    assert.match(css, /\.product-card\.has-quantity \{[^}]*background: var\(--accent-soft\)/);
    assert.match(css, /\.product-card\.has-quantity \{[^}]*box-shadow: inset 0 0 0 1px var\(--accent\)/);
    assert.match(css, /\.confirm-button:disabled \{[^}]*background: var\(--surface-strong\)/);
    assert.match(css, /\.checkout-panel\.is-stock-error \{[^}]*border-color: var\(--danger\)/);
    assert.match(css, /\.checkout-panel\.is-stock-error \.confirm-button:disabled \{[^}]*background: var\(--danger\)/);
    assert.notEqual(tokens.accent, tokens.danger);
    assert.notEqual(tokens['chart-sales'], tokens['chart-quantity']);
  });
}
