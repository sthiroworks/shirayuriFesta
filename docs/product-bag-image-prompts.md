# 巾着M・通園カバンの商品画像

2026-11-12、組み込みの画像生成ツールで作成。既存の商品画像に合わせた水彩・色鉛筆調のイラスト。背景透過の生成結果を、縦横比とアルファチャンネルを保って256×256pxに縮小した。

| 商品 | 初期設定 | 画像 | 公開用の同一画像 |
| --- | --- | --- | --- |
| 巾着M | 園グッズ・200円 | `assets/icons/drawstring-bag-m.png` | `dist/assets/icons/drawstring-bag-m.png` |
| 通園カバン | 古園服・300円 | `assets/icons/kindergarten-bag-navy-v2.png` | `dist/assets/icons/kindergarten-bag-navy-v2.png` |

実物の写真ではなく、商品を見分けるためのイメージ。生成時は両方とも `transparent_background: true` を指定した。

通園カバンは追加で提供された紺色リュックの正面写真を元に、丸い上部・半円形の前ポケット・丸い金色のボタン・短い持ち手・下部のひもを再現した。縁取りも含めて濃い無地ネイビーで統一。組み込みの画像生成ツールによる画像編集を使用し、既存の `shoe-bag.png` を水彩・色鉛筆調のスタイル参照にした。古い設定ファイルからの参照に備えて旧画像 `kindergarten-bag.png` と `kindergarten-bag-navy.png` も残している。

## 巾着Mの最終プロンプト

```text
Use case: product-mockup. Asset type: a single square transparent PNG product illustration for a Japanese kindergarten fair cash register, used as a small 64px product thumbnail alongside existing hand-painted product icons. Primary request: 巾着M, one medium-sized handmade fabric drawstring pouch. Depict just ONE upright medium cotton drawstring bag, gathered closed at the top with two short navy blue drawstrings looping outward. Warm cream cloth with a pale sky-blue lower panel and a very simple small blue flower print (large sparse flowers, not tiny busy details). Clearly a soft medium-sized pouch for kindergarten belongings, no handles, no shoulder strap, no objects sticking out. Style/medium: charming hand-painted watercolor and colored pencil product illustration, slightly dimensional fabric folds, dark fine navy ink outline, softly shaded, clean distinct silhouette, in the style of small Japanese school-fair merchandise icons. Composition: centered, slight three-quarter front view, the bag fills about 85 percent of a square canvas, include all cords with generous transparent edge margin, subject readable at 64px, isolated object only. Background: genuinely transparent alpha everywhere outside the object; no scene, no ground plane, no backdrop, no opaque white rectangle, no frame. Constraints: no words, no labels, no prices, no letters, no logo, no watermark, no other objects, no surrounding decoration.
```

## 通園カバンの最終プロンプト

```text
Use case: precise-object-edit. Asset type: one transparent PNG product icon for a Japanese kindergarten fair cash register. Input image 1 is the edit target and exact BAG reference. Input image 2 is a STYLE reference only for the watercolor rendering, fine dark outlines and gentle shading used by the existing product icons; do not borrow its bag construction, car print, shoes, colors or other objects. Primary request: turn the dark navy kindergarten backpack in image 1 into a polished hand-painted watercolor and colored pencil illustration consistent with image 2. Preserve image 1's exact rounded rectangular silhouette and FRONT-FACING view, softly arched top, broad semicircular curved flap on the front pocket, single small ROUND GOLD SNAP BUTTON centered on that flap, short navy webbing carry loop above the bag, and two short navy webbing strap tails visible below the bag. The entire body, piping, pocket, handle and straps should be plain solid DEEP DARK NAVY, with soft blue highlights to keep the shapes readable. Keep the gently pebbled faux-leather appearance, simplified for a small icon. The gold button is the sole contrasting colored detail. Keep the large curved pocket flap at the same height and with the same proportions as in image 1. No brown or tan edging, no silver turn-lock clasp, no tartan or other pattern, no long strap loop, no label, emblem, text or logo. Style: softly dimensional charming merchandise illustration, controlled dark navy ink contours, visible but restrained watercolor/colored pencil texture, clean recognizable silhouette readable at 56px. Composition: a single backpack centered in a square canvas, occupying about 86 percent of the canvas height, full top loop and bottom strap tails included, generous clear margin, no cropping. Background: genuinely transparent alpha, remove the wooden tabletop and any flowers from the reference, no white rectangle, no scene, no ground plane, no other objects or decoration.
```
