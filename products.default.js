(function (root) {
  // 2026-10-22 のレジ設定を初回起動用に採用。商品ID・並び順・価格・在庫上限・改行位置を保持する。
  // 販売済み数と会計履歴は含めず、保存済みの端末データも上書きしない。
  const products = [
    ["園グッズ", "手提げ", 800, "tote-bag.png"],
    ["園グッズ", "上履き袋", 500, "shoe-bag.png"],
    ["園グッズ", "コップ袋", 100, "cup-bag.png"],
    ["園グッズ", "お弁当袋", 500, "lunch-bag.png"],
    ["園グッズ", "ナフキン", 150, "napkin.png"],
    ["園グッズ", "水筒紐カバー", 150, "bottle-strap-cover.png"],
    ["園グッズ", "献金用財布", 100, "donation-wallet.png"],
    ["園グッズ", "スモックフタ", 100, "smock-cover.png"],
    ["園グッズ", "雑巾（２枚）", 50, "cleaning-cloths.png"],
    ["園グッズ", "ガーゼハンカチ", 50, "gauze-handkerchief.png"],
    ["古園服", "冬服ブレザー", 400, "winter-blazer.png"],
    ["古園服", "冬服ブラウス", 200, "winter-blouse.png"],
    ["古園服", "冬服ズボン・スカート", 300, "winter-bottoms.png"],
    ["古園服", "夏服セーラー", 200, "summer-sailor.png", undefined, undefined, true],
    ["古園服", "夏服ズボン・スカート", 300, "summer-bottoms.png"],
    ["古園服", "体操服・長袖", 300, "gym-long.png", undefined, undefined, true],
    ["古園服", "体操服・半袖", 300, "gym-short.png"],
    ["古園服", "カーディガン", 200, "cardigan.png", undefined, undefined, true],
    ["古園服", "タイツ・レギンス", 100, "tights-leggings.png"],
    ["古園服【その他】", "お買い得品（一律）", 50, "bargain-tag.png", "古園服::お買い得品（一律）"],
    ["チケット販売", "おまとめチケット", 500, "ticket-bundle.png"],
    ["チケット販売", "もぐらたたき&\nたこ焼きビンゴ", 100, "mole-whack.png"],
    ["チケット販売", "お魚釣り(お菓子)", 150, "candy-fishing.png"],
    ["チケット販売", "お宝すくい", 150, "treasure-scoop.png"],
    ["チケット販売", "先生スタンプラリー", 100, "takoyaki-bingo.png"],
    ["チケット販売", "A ブレスレット作り(09:20〜)", 200, "bracelet-resin-coral.png", "チケット販売::ブレスレット作り(09:20〜)", 13, true],
    ["チケット販売", "B ブレスレット作り(09:40〜)", 200, "bracelet-resin-aqua.png", "チケット販売::ブレスレット作り(09:40〜)", 13],
    ["チケット販売", "C ブレスレット作り(10:00〜)", 200, "bracelet-resin-lavender.png", "チケット販売::ブレスレット作り(10:00〜)", 13],
    ["チケット販売", "D ブレスレット作り(10:20〜)", 200, "bracelet-resin-mint.png", "チケット販売::ブレスレット作り(10:20〜)", 13],
    ["チケット販売", "E ブレスレット作り(10:40〜)", 200, "bracelet-resin-pink-aqua.png", "チケット販売::ブレスレット作り(10:40〜)", 13],
    ["チケット販売", "F ブレスレット作り(11:00〜)", 200, "bracelet-resin-orange.png", "チケット販売::ブレスレット作り(11:00〜)", 13],
    ["チケット販売", "G ブレスレット作り(11:20〜)", 200, "bracelet-resin-rainbow.png", "チケット販売::ブレスレット作り(11:20〜)", 13],
    ["チケット販売【予約】", "【予約】A ブレスレット作り(09:20〜)", 100, "bracelet-resin-coral.png", "園グッズ::【予約】A ブレスレット作り(09:20〜)", 2],
    ["チケット販売【予約】", "【予約】B ブレスレット作り(09:40〜)", 200, "bracelet-resin-aqua.png", "90d55210-502d-4946-a965-152887a6aa28", 2],
    ["チケット販売【予約】", "【予約】C ブレスレット作り(10:00〜)", 200, "bracelet-resin-lavender.png", "969a390e-023e-4296-8c58-687ce8898931", 2],
    ["チケット販売【予約】", "【予約】D ブレスレット作り(10:20〜)", 200, "bracelet-resin-mint.png", "51d8d3e1-630f-4be6-901a-8f2d39a56e9d", 2],
    ["チケット販売【予約】", "【予約】E ブレスレット作り(10:40〜)", 200, "bracelet-resin-pink-aqua.png", "d43ae7e3-0d9e-43a6-9f48-c3ed7c91d2ab", 2],
    ["チケット販売【予約】", "【予約】F ブレスレット作り(11:00〜)", 200, "bracelet-resin-orange.png", "ce16ba16-6307-4b6a-ab8f-5cad1b12f292", 2],
    ["チケット販売【予約】", "【予約】G ブレスレット作り(11:20〜)", 200, "bracelet-resin-rainbow.png", "666f73cd-167a-4751-8191-52c1ad6c9ae3", 2],
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
    "autoBackupEnabled": false,
    "autoBackupIntervalMinutes": 5
  });

  root.DEFAULT_PRODUCTS = products;
  root.DEFAULT_SETTINGS = settings;
  if (typeof module !== "undefined" && module.exports)
    module.exports = { DEFAULT_PRODUCTS: products, DEFAULT_SETTINGS: settings };
})(typeof window !== "undefined" ? window : globalThis);
