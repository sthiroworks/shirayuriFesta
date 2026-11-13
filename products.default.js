(function (root) {
  // 2026-10-24 のレジ設定を初回起動用に採用。商品ID・並び順・価格・在庫上限・改行位置を保持する。
  // 販売済み数と会計履歴は含めず、保存済みの端末データも上書きしない。
  // 2026-11-02: 予約A枠の誤価格を修正。ブレスレットは全枠200円。
  // 2026-11-13: 当日販売は各枠15点。予約枠は初期設定から削除。
  // 2026-11-13: 古園服の上下を分割し、体操服ズボンとハイソックスを追加。
  const products = [
    ["園グッズ", "手提げ", 800, "tote-bag.png"],
    ["園グッズ", "上履き袋", 500, "shoe-bag.png"],
    ["園グッズ", "コップ袋", 100, "cup-bag.png"],
    ["園グッズ", "お弁当袋", 500, "lunch-bag.png"],
    ["園グッズ", "ナフキン", 150, "napkin.png"],
    ["園グッズ", "水筒紐カバー", 200, "bottle-strap-cover.png"],
    ["園グッズ", "献金用財布", 100, "donation-wallet.png"],
    ["園グッズ", "スモックフタ", 100, "smock-cover.png"],
    ["園グッズ", "雑巾（２枚）", 50, "cleaning-cloths.png"],
    ["園グッズ", "ガーゼハンカチ", 50, "gauze-handkerchief.png"],
    ["園グッズ", "巾着M", 200, "drawstring-bag-m-illustrated.png"],
    ["古園服", "冬服ブレザー", 400, "winter-blazer.png"],
    ["古園服", "冬服ブラウス", 200, "winter-blouse.png"],
    ["古園服", "冬服ズボン", 300, "winter-pants.png"],
    ["古園服", "冬服スカート", 300, "winter-skirt.png"],
    ["古園服", "夏服セーラー", 200, "summer-sailor.png", undefined, undefined, true],
    ["古園服", "夏服ズボン", 300, "summer-pants.png"],
    ["古園服", "夏服スカート", 300, "summer-skirt.png"],
    ["古園服", "体操服・長袖", 300, "gym-long-shirt.png", undefined, undefined, true],
    ["古園服", "体操服・半袖", 300, "gym-short-shirt.png"],
    ["古園服", "体操服・ズボン", 300, "gym-shorts.png"],
    ["古園服", "通園カバン", 300, "kindergarten-bag-navy-illustrated.png"],
    ["古園服【その他】", "カーディガン", 200, "cardigan.png", "古園服::カーディガン", undefined, true],
    ["古園服【その他】", "タイツ・レギンス・ハイソックス", 100, "tights-leggings-high-socks.png", "古園服::タイツ・レギンス"],
    ["古園服【その他】", "お買い得品（一律）", 50, "bargain-tag.png", "古園服::お買い得品（一律）"],
    ["チケット販売", "おまとめチケット", 500, "ticket-bundle.png"],
    ["チケット販売", "もぐらたたき&たこ焼きビンゴ", 100, "mole-whack.png"],
    ["チケット販売", "お魚釣り(お菓子)", 150, "candy-fishing.png"],
    ["チケット販売", "お宝すくい", 150, "treasure-scoop.png"],
    ["チケット販売", "先生スタンプラリー", 100, "teacher-stamp-rally.png"],
    ["チケット販売", "A ブレスレット作り(09:20〜)", 200, "bracelet-resin-coral.png", "チケット販売::ブレスレット作り(09:20〜)", 15, true],
    ["チケット販売", "B ブレスレット作り(09:40〜)", 200, "bracelet-resin-aqua.png", "チケット販売::ブレスレット作り(09:40〜)", 15],
    ["チケット販売", "C ブレスレット作り(10:00〜)", 200, "bracelet-resin-lavender.png", "チケット販売::ブレスレット作り(10:00〜)", 15],
    ["チケット販売", "D ブレスレット作り(10:20〜)", 200, "bracelet-resin-mint.png", "チケット販売::ブレスレット作り(10:20〜)", 15],
    ["チケット販売", "E ブレスレット作り(10:40〜)", 200, "bracelet-resin-pink-aqua.png", "チケット販売::ブレスレット作り(10:40〜)", 15],
    ["チケット販売", "F ブレスレット作り(11:00〜)", 200, "bracelet-resin-orange.png", "チケット販売::ブレスレット作り(11:00〜)", 15],
    ["チケット販売", "G ブレスレット作り(11:20〜)", 200, "bracelet-resin-rainbow.png", "チケット販売::ブレスレット作り(11:20〜)", 15],
    ["他", "ありがとうチケット", -50, "thank-you-ticket.png"]
  ].map(([category, name, unitPrice, iconFile, id, stockLimit, startNewRow]) => ({
    id: id || `${category}::${name}`,
    category,
    name,
    unitPrice,
    iconPath: `assets/icons/${iconFile}`,
    ...(stockLimit === undefined ? {} : { stockLimit }),
    ...(startNewRow === true ? { startNewRow: true } : {})
  }));
  const settings = Object.freeze({
    "enabled": true,
    "category": "古園服",
    "siblings": 1,
    "perSibling": 4,
    "productColumnWidth": "standard",
    "autoBackupEnabled": true,
    "autoBackupIntervalMinutes": 5
  });

  root.DEFAULT_PRODUCTS = products;
  root.DEFAULT_SETTINGS = settings;
  if (typeof module !== "undefined" && module.exports)
    module.exports = { DEFAULT_PRODUCTS: products, DEFAULT_SETTINGS: settings };
})(typeof window !== "undefined" ? window : globalThis);
