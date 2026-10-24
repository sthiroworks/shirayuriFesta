const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const Core = require('../core.js');

function backupHarness(directory = '', { folderSupported = false, shareError = null, canShare = true, onShare } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', directory, 'app.js'), 'utf8');
  const names = [
    'supportsDirectoryBackup', 'formatBackupDate', 'setBackupReminderDue', 'postponeBackupReminder',
    'updateBackupStatus', 'updateUnsupportedFeatureVisibility', 'recordHistoryBackupSuccess',
    'shareExportFile', 'shareCsvFile', 'shareCsv', 'selectBackupDirectory', 'backupNow',
    'maybeRunAutoBackup', 'startAutoBackupTimer',
  ];
  const functions = names.map((name) => {
    const match = new RegExp('^  (?:async )?function ' + name + '\\(', 'm').exec(source);
    assert.ok(match, name + ' is present');
    const tail = source.slice(match.index + match[0].length);
    const next = /\n  (?:async )?function \w+\(/.exec(tail);
    assert.ok(next, name + ' has a function boundary');
    return source.slice(match.index, match.index + match[0].length + next.index);
  }).join('\n');
  let now = new Date(2026, 9, 25, 10).getTime();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const makeElement = () => {
    const classes = new Set();
    return {
      hidden: false, textContent: '',
      classList: {
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
    };
  };
  const elements = Object.fromEntries([
    'backupOptions', 'backupFolder', 'backupOptionsTitle', 'backupEnabledLabel',
    'backupIntervalLabel', 'backupSettingsSave', 'backupNow', 'backupStatus', 'backupReminder',
  ].map((name) => [name, makeElement()]));
  elements.backupReminder.hidden = true;
  const calls = { shares: [], downloads: [], writes: [], intervals: [], statuses: [], saved: [], folders: 0 };
  const state = {
    settings: { autoBackupEnabled: true, autoBackupIntervalMinutes: 5 },
    transactions: [{
      id: 'test-sale', recordedAt: new ClockDate().toISOString(), total: 200, received: 200, change: 0, itemCount: 1,
      items: [{ category: '園グッズ', name: '確認用商品', quantity: 1, unitPrice: 200, subtotal: 200 }],
    }],
    backupReminderStartedAt: now, backupReminderSnoozedUntil: 0, backupReminderDue: false,
    autoBackupInProgress: false, autoBackupTimer: null, backupDirectoryHandle: null, lastBackupError: '',
  };
  const root = {
    File, document: { visibilityState: 'visible' },
    navigator: {
      canShare: () => canShare,
      share(data) {
        calls.shares.push(data);
        if (onShare) return onShare(data);
        return shareError ? Promise.reject(shareError) : Promise.resolve();
      },
    },
    setInterval(callback, delay) { calls.intervals.push({ callback, delay }); return calls.intervals.length; },
    clearInterval() {},
  };
  if (folderSupported) {
    root.indexedDB = {};
    root.showDirectoryPicker = async () => { calls.folders += 1; return { name: 'backup-folder' }; };
  }
  const context = {
    root, state, elements, Core, Date: ClockDate, storage: {},
    Storage: { saveSettings(_storage, settings) { calls.saved.push(settings); } },
    setStatus(message, type) { calls.statuses.push({ message, type }); },
    downloadTextFile(filename, contents, type) { calls.downloads.push({ filename, contents, type }); },
    saveBackupDirectoryHandle: async () => {},
    exportBackupFiles: async (options) => { calls.writes.push(options || {}); return true; },
  };
  const api = vm.runInNewContext(functions + '\n({' + names.join(',') + '});', context);
  return { api, root, state, elements, calls, advance(minutes) { now += minutes * 60000; } };
}

for (const directory of ['', 'dist/']) {
  const prefix = directory || 'source/';

  test(prefix + 'unsupported browsers get reminder settings and no unusable folder selector', () => {
    const h = backupHarness(directory);
    h.api.updateUnsupportedFeatureVisibility();
    h.api.updateBackupStatus();
    assert.equal(h.elements.backupOptions.hidden, false);
    assert.equal(h.elements.backupFolder.hidden, true);
    assert.equal(h.elements.backupFolder.classList.contains('is-hidden'), true);
    assert.equal(h.elements.backupOptionsTitle.textContent, '定期バックアップの通知');
    assert.equal(h.elements.backupNow.textContent, '今すぐ保存・共有');
    assert.match(h.elements.backupStatus.textContent, /5分ごと/);
    assert.match(h.elements.backupStatus.textContent, /ファイルに保存/);
    assert.doesNotMatch(h.elements.backupStatus.textContent, /Chrome|Edge/);
  });

  test(prefix + 'manual backup calls file sharing synchronously from the tap and records success', async () => {
    let active = true;
    const h = backupHarness(directory, { onShare() { assert.equal(active, true); return Promise.resolve(); } });
    h.api.setBackupReminderDue(true);
    const pending = h.api.backupNow();
    assert.equal(h.calls.shares.length, 1, 'share starts before yielding the click activation');
    active = false;
    await pending;
    assert.equal(h.calls.downloads.length, 0);
    assert.equal(h.calls.folders, 0);
    const file = h.calls.shares[0].files[0];
    assert.equal(file.type, 'text/csv');
    assert.match(file.name, /\.csv$/);
    const parsed = Core.parseTransactionCsv(await file.text());
    assert.equal(parsed.transactions.length, 1);
    assert.equal(parsed.transactions[0].id, 'test-sale');
    assert.equal(h.state.settings.historyBackupLastType, 'manual');
    assert.ok(h.state.settings.historyBackupLastAt);
    assert.equal(h.state.backupReminderDue, false);
    assert.equal(h.state.autoBackupInProgress, false);
  });

  test(prefix + 'timer only shows a reminder, supports snooze, and waits while the page is hidden', async () => {
    const h = backupHarness(directory);
    h.advance(4);
    await h.api.maybeRunAutoBackup();
    assert.equal(h.state.backupReminderDue, false);
    h.advance(1);
    await h.api.maybeRunAutoBackup();
    assert.equal(h.state.backupReminderDue, true);
    assert.equal(h.elements.backupReminder.hidden, false);
    assert.equal(h.calls.shares.length + h.calls.downloads.length + h.calls.writes.length, 0);
    h.api.postponeBackupReminder();
    h.advance(4);
    await h.api.maybeRunAutoBackup();
    assert.equal(h.state.backupReminderDue, false);
    h.root.document.visibilityState = 'hidden';
    h.advance(1);
    await h.api.maybeRunAutoBackup();
    assert.equal(h.state.backupReminderDue, false);
    h.root.document.visibilityState = 'visible';
    await h.api.maybeRunAutoBackup();
    assert.equal(h.state.backupReminderDue, true);
    h.state.transactions = [];
    await h.api.maybeRunAutoBackup();
    assert.equal(h.state.backupReminderDue, false, 'do not remind for an empty register');
    h.api.setBackupReminderDue(true);
    h.state.settings.autoBackupEnabled = false;
    h.api.startAutoBackupTimer();
    assert.equal(h.state.backupReminderDue, false);
    assert.equal(h.state.autoBackupTimer, null);
  });

  test(prefix + 'cancelling sharing does not mark a backup complete or dismiss its reminder', async () => {
    const h = backupHarness(directory, { shareError: Object.assign(new Error('cancelled'), { name: 'AbortError' }) });
    h.api.setBackupReminderDue(true);
    await h.api.backupNow();
    assert.equal(h.calls.downloads.length, 0);
    assert.equal(h.calls.saved.length, 0);
    assert.equal(h.state.settings.historyBackupLastAt, undefined);
    assert.equal(h.state.backupReminderDue, true);
    assert.equal(h.state.autoBackupInProgress, false);
  });

  test(prefix + 'share rejection or lack of file sharing falls back to CSV download', async () => {
    for (const options of [
      { shareError: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) },
      { canShare: false },
    ]) {
      const h = backupHarness(directory, options);
      h.api.setBackupReminderDue(true);
      await h.api.backupNow();
      assert.equal(h.calls.downloads.length, 1);
      assert.match(h.calls.downloads[0].contents, /確認用商品/);
      assert.ok(h.state.settings.historyBackupLastAt);
      assert.equal(h.state.backupReminderDue, false);
    }
  });

  test(prefix + 'folder-capable browsers keep folder selection and automatic CSV writing', async () => {
    const h = backupHarness(directory, { folderSupported: true });
    h.api.updateUnsupportedFeatureVisibility();
    assert.equal(h.elements.backupFolder.hidden, false);
    assert.equal(h.elements.backupOptionsTitle.textContent, '自動バックアップの設定');
    await h.api.backupNow();
    assert.equal(h.calls.folders, 1);
    assert.equal(h.calls.writes.length, 1);
    assert.equal(h.calls.shares.length, 0);
    h.calls.writes.length = 0;
    await h.api.maybeRunAutoBackup();
    assert.equal(h.calls.writes.length, 1);
    assert.equal(h.calls.writes[0].automatic, true);
    assert.equal(h.state.backupReminderDue, false);
  });
}
