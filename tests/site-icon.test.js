const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const projectRoot = path.resolve(__dirname, '..');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function inspectPng(bytes, expectedSize) {
  assert.deepEqual(bytes.subarray(0, 8), pngSignature);
  assert.equal(bytes.readUInt32BE(8), 13);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), expectedSize);
  assert.equal(bytes.readUInt32BE(20), expectedSize);
  assert.equal(bytes[24], 8, '8-bit channels');
  assert.equal(bytes[25], 6, 'RGBA pixels');
  assert.equal(bytes[28], 0, 'non-interlaced PNG');
  const compressed = [];
  let endFound = false;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    const next = offset + length + 12;
    assert.ok(next <= bytes.length, 'chunk is complete');
    if (kind === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (kind === 'IEND') {
      assert.equal(length, 0);
      assert.equal(next, bytes.length);
      endFound = true;
    }
    offset = next;
  }
  assert.ok(endFound && compressed.length);
  const pixels = zlib.inflateSync(Buffer.concat(compressed));
  assert.equal(pixels.length, (expectedSize * 4 + 1) * expectedSize);
}

for (const directory of ['', 'dist/']) {
  const prefix = directory || 'source/';
  const read = (filename) => fs.readFileSync(path.join(projectRoot, directory, filename));

  test(prefix + 'site icon is a self-contained vector with accessible name and no external artwork', () => {
    const svg = read('assets/site-icon.svg').toString('utf8');
    assert.match(svg, /viewBox="0 0 64 64"/);
    assert.match(svg, /<title id="title">白ゆりフェスタ レジ<\/title>/);
    assert.match(svg, /aria-labelledby="title desc"/);
    assert.match(svg, /fill="#36533f"/);
    assert.match(svg, /fill="#fffdf5"/);
    assert.match(svg, /fill="#d9bd80"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|href=|url\(|gradient/i);
  });

  test(prefix + 'white lily and recognizable register features are both included in the vector', () => {
    const svg = read('assets/site-icon.svg').toString('utf8');
    for (const id of ['register-display', 'register-body', 'register-keys', 'register-drawer', 'lily-bloom']) {
      assert.match(svg, new RegExp('<path id="' + id + '"[^>]*d="[^"]+'), id + ' has vector geometry');
    }
    assert.match(svg, /金額表示・キー・引き出し/);
    assert.match(svg, /id="lily-bloom" fill="#fffdf5"/);
  });

  test(prefix + 'all icon links work under a project subdirectory and include a cache version', () => {
    const html = read('index.html').toString('utf8');
    const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
    const links = [...head.matchAll(/<link\b[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((match) => match[0]);
    assert.equal(links.length, 5);
    for (const link of links) {
      const href = /href="([^"]+)"/.exec(link)[1];
      assert.ok(!href.startsWith('/') && !href.includes('://'), 'use a project-relative path');
      assert.match(href, /\?v=20261103-lily-register$/);
      const resolved = new URL(href, 'https://example.test/shirayuriFesta/index.html');
      assert.ok(resolved.pathname.startsWith('/shirayuriFesta/'));
      assert.ok(fs.existsSync(path.join(projectRoot, directory, href.split('?')[0])));
    }
    assert.ok(links.some((link) => /type="image\/svg\+xml"/.test(link) && /sizes="any"/.test(link)));
    assert.ok(links.some((link) => /rel="apple-touch-icon"/.test(link) && /sizes="180x180"/.test(link)));
    assert.ok(links.some((link) => /favicon\.ico/.test(link) && /sizes="16x16 32x32"/.test(link)));
  });

  test(prefix + 'PNG fallback and home-screen artwork have valid pixels at the declared sizes', () => {
    inspectPng(read('assets/site-icon-32.png'), 32);
    inspectPng(read('assets/apple-touch-icon.png'), 180);
    inspectPng(read('assets/site-icon-192.png'), 192);
  });

  test(prefix + 'ICO contains complete 16px and 32px artwork and matches the PNG fallback', () => {
    const ico = read('favicon.ico');
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 2);
    let expectedOffset = 38;
    for (const [index, size] of [16, 32].entries()) {
      const offset = 6 + index * 16;
      assert.equal(ico[offset], size);
      assert.equal(ico[offset + 1], size);
      assert.equal(ico.readUInt16LE(offset + 4), 1);
      assert.equal(ico.readUInt16LE(offset + 6), 32);
      const length = ico.readUInt32LE(offset + 8);
      const dataOffset = ico.readUInt32LE(offset + 12);
      assert.equal(dataOffset, expectedOffset);
      assert.ok(dataOffset + length <= ico.length);
      const pixels = ico.subarray(dataOffset, dataOffset + length);
      inspectPng(pixels, size);
      if (size === 32) assert.deepEqual(pixels, read('assets/site-icon-32.png'));
      expectedOffset += length;
    }
    assert.equal(expectedOffset, ico.length);
  });
}

test('source and deployed icons remain byte-for-byte identical', () => {
  for (const filename of [
    'favicon.ico', 'assets/site-icon.svg', 'assets/site-icon-32.png',
    'assets/apple-touch-icon.png', 'assets/site-icon-192.png',
  ]) {
    assert.deepEqual(fs.readFileSync(path.join(projectRoot, filename)), fs.readFileSync(path.join(projectRoot, 'dist', filename)));
  }
});
