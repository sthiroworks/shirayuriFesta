# 巾着M・通園カバンの商品画像

2026-11-12、組み込みの画像生成ツールで作成。既存の商品画像に合わせた水彩・色鉛筆調のイラスト。背景透過の生成結果を、縦横比とアルファチャンネルを保って256×256pxに縮小した。

| 商品 | 初期設定 | 画像 | 公開用の同一画像 |
| --- | --- | --- | --- |
| 巾着M | 園グッズ・200円 | `assets/icons/drawstring-bag-m.png` | `dist/assets/icons/drawstring-bag-m.png` |
| 通園カバン | 古園服・300円 | `assets/icons/kindergarten-bag-navy.png` | `dist/assets/icons/kindergarten-bag-navy.png` |

実物の写真ではなく、商品を見分けるためのイメージ。生成時は両方とも `transparent_background: true` を指定した。

通園カバンは提供された写真を元に、丸い上部・前面のかぶせポケット・茶色の縁取り・金属の留め金を保ち、チェック柄の布地を濃い無地ネイビーに変更した。組み込みの画像生成ツールによる画像編集を使用。古い設定ファイルからの参照に備えて旧画像 `kindergarten-bag.png` も残している。

## 巾着Mの最終プロンプト

```text
Use case: product-mockup. Asset type: a single square transparent PNG product illustration for a Japanese kindergarten fair cash register, used as a small 64px product thumbnail alongside existing hand-painted product icons. Primary request: 巾着M, one medium-sized handmade fabric drawstring pouch. Depict just ONE upright medium cotton drawstring bag, gathered closed at the top with two short navy blue drawstrings looping outward. Warm cream cloth with a pale sky-blue lower panel and a very simple small blue flower print (large sparse flowers, not tiny busy details). Clearly a soft medium-sized pouch for kindergarten belongings, no handles, no shoulder strap, no objects sticking out. Style/medium: charming hand-painted watercolor and colored pencil product illustration, slightly dimensional fabric folds, dark fine navy ink outline, softly shaded, clean distinct silhouette, in the style of small Japanese school-fair merchandise icons. Composition: centered, slight three-quarter front view, the bag fills about 85 percent of a square canvas, include all cords with generous transparent edge margin, subject readable at 64px, isolated object only. Background: genuinely transparent alpha everywhere outside the object; no scene, no ground plane, no backdrop, no opaque white rectangle, no frame. Constraints: no words, no labels, no prices, no letters, no logo, no watermark, no other objects, no surrounding decoration.
```

## 通園カバンの最終プロンプト

```text
Use case: precise-object-edit. Asset type: transparent PNG product thumbnail illustration for a Japanese kindergarten fair cash register. Input image 1 is the edit target and the exact reference for the BAG SHAPE and construction. Primary request: recreate this same small kindergarten BACKPACK, replacing ALL of its green-and-blue tartan/checkered fabric with PLAIN, SOLID VERY DARK NAVY BLUE fabric (deep midnight navy, clearly blue rather than pure black). Keep its distinctive rounded arch top, upright rectangular lower body, single short top carry loop, dimensional box-shaped flap pocket on the front with the small silver metal clasp, zipper details, and its visible side compartment. Keep the warm brown leather edging/piping, pocket border, handle and leather fastening details from the reference. Keep the same three-quarter view from the front-left, recognizably matching the supplied backpack's silhouette and proportions. There must be absolutely NO tartan, checks, stripes, grids, repeating print, or pattern on any navy panel, including the front flap pocket and side panels. Style: turn the reference into a charming, softly dimensional hand-painted watercolor and colored pencil merchandise illustration, with fine dark ink contours, subtle fabric texture and soft highlights, matching Japanese kindergarten product icons. Composition: one backpack only, centered in a square canvas, all edges and carry loop fully visible, bag about 86 percent of the canvas with transparent margin on all sides. Background: genuinely transparent alpha, no white rectangle, no ground plane, no scene, no person, no cast ground shadow. Constraints: keep the pictured backpack construction, brown trim and small silver clasp; no long arching shoulder strap above the bag; do not make it into a yellow satchel or tote. No words, letters, logo, emblem, watermark, other objects or decorative elements.
```
