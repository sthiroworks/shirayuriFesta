(function (root) {
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
    ["古園服", "夏服セーラー", 200, "summer-sailor.png"],
    ["古園服", "夏服ズボン・スカート", 300, "summer-bottoms.png"],
    ["古園服", "体操服・長袖", 300, "gym-long.png"],
    ["古園服", "体操服・半袖", 300, "gym-short.png"],
    ["古園服", "カーディガン", 200, "cardigan.png"],
    ["古園服", "タイツ・レギンス", 100, "tights-leggings.png"],
    ["古園服", "お買い得品（一律）", 50, "bargain-tag.png"],
    ["チケット販売", "おまとめチケット", 500, "ticket-bundle.png"],
    ["チケット販売", "もぐらたたき&\nたこ焼きビンゴ", 100, "mole-whack.png"],
    ["チケット販売", "お魚釣り(お菓子)", 150, "candy-fishing.png"],
    ["チケット販売", "お宝すくい", 150, "treasure-scoop.png"],
    ["チケット販売", "先生スタンプラリー", 100, "takoyaki-bingo.png"],
    ["チケット販売", "ブレスレット作り(09:20〜)", 200, "bracelet-coral.png"],
    ["チケット販売", "ブレスレット作り(09:40〜)", 200, "bracelet-aqua.png"],
    ["チケット販売", "ブレスレット作り(10:00〜)", 200, "bracelet-lavender.png"],
    ["チケット販売", "ブレスレット作り(10:20〜)", 200, "bracelet-mint.png"],
    [
      "チケット販売",
      "ブレスレット作り(10:40〜)",
      200,
      "bracelet-pink-aqua.png"
    ],
    ["チケット販売", "ブレスレット作り(11:00〜)", 200, "bracelet-orange.png"],
    ["チケット販売", "ブレスレット作り(11:20〜)", 200, "bracelet-rainbow.png"],
    ["他", "ありがとうチケット", -50, "thank-you-ticket.png"]
  ].map(([category, name, unitPrice, iconFile]) => ({
    id: `${category}::${name}`,
    category,
    name,
    unitPrice,
    iconPath: `assets/icons/${iconFile}`,
    ...(name.startsWith("ブレスレット作り") ? { stockLimit: 15 } : {})
  }));

  root.DEFAULT_PRODUCTS = products;
  if (typeof module !== "undefined" && module.exports)
    module.exports = { DEFAULT_PRODUCTS: products };
})(typeof window !== "undefined" ? window : globalThis);
