# 巾着M・通園カバンの商品画像

2026-11-12、組み込みの画像生成ツールで作成。既存の商品画像に合わせた水彩・色鉛筆調のイラスト。背景透過の生成結果を、縦横比とアルファチャンネルを保って256×256pxに縮小した。

| 商品 | 初期設定 | 画像 | 公開用の同一画像 |
| --- | --- | --- | --- |
| 巾着M | 園グッズ・200円 | `assets/icons/drawstring-bag-m.png` | `dist/assets/icons/drawstring-bag-m.png` |
| 通園カバン | 古園服・300円 | `assets/icons/kindergarten-bag-navy-v3.png` | `dist/assets/icons/kindergarten-bag-navy-v3.png` |

実物の写真ではなく、商品を見分けるためのイメージ。生成時は両方とも `transparent_background: true` を指定した。

通園カバンは提供された紺色リュックの正面写真を元に、丸い上部・半円形の前ポケット・丸い金色のボタン・短い持ち手・下部のひもを再現した。既存の `shoe-bag.png` を水彩・色鉛筆調のスタイル参照にして作成後、組み込みの画像生成ツールで形と金色のボタンを保ったまま色だけを黒に近い濃紺へ変更。明るい青色のハイライトも抑えた。古い設定ファイルからの参照に備えて旧画像 `kindergarten-bag.png`・`kindergarten-bag-navy.png`・`kindergarten-bag-navy-v2.png` も残している。

## 巾着Mの最終プロンプト

```text
Use case: product-mockup. Asset type: a single square transparent PNG product illustration for a Japanese kindergarten fair cash register, used as a small 64px product thumbnail alongside existing hand-painted product icons. Primary request: 巾着M, one medium-sized handmade fabric drawstring pouch. Depict just ONE upright medium cotton drawstring bag, gathered closed at the top with two short navy blue drawstrings looping outward. Warm cream cloth with a pale sky-blue lower panel and a very simple small blue flower print (large sparse flowers, not tiny busy details). Clearly a soft medium-sized pouch for kindergarten belongings, no handles, no shoulder strap, no objects sticking out. Style/medium: charming hand-painted watercolor and colored pencil product illustration, slightly dimensional fabric folds, dark fine navy ink outline, softly shaded, clean distinct silhouette, in the style of small Japanese school-fair merchandise icons. Composition: centered, slight three-quarter front view, the bag fills about 85 percent of a square canvas, include all cords with generous transparent edge margin, subject readable at 64px, isolated object only. Background: genuinely transparent alpha everywhere outside the object; no scene, no ground plane, no backdrop, no opaque white rectangle, no frame. Constraints: no words, no labels, no prices, no letters, no logo, no watermark, no other objects, no surrounding decoration.
```

## 通園カバンの最終プロンプト

```text
Use case: precise-object-edit. Input image 1 is the ONLY edit target: the existing transparent watercolor illustration of a front-facing kindergarten backpack. Make a STRICT COLOR-ONLY edit. Darken every navy part of the backpack, including body, curved front pocket flap, piping, top carry loop and bottom webbing straps, to a very deep almost-BLACK midnight navy. The body base color should be around #0D1420, shadows around #080D15, with only restrained dark slate navy highlights around #202A38. The overall first impression must be BLACK with a faint navy undertone, substantially darker than the current blue. Preserve enough soft shading and fine outlines for the front pocket and arched silhouette to remain visible, but remove the bright blue and silvery-blue highlights from the current rendering. Keep EXACTLY the same shape, proportions, front view, curved flap outline, round gold snap button including its size, color and position, loop, two strap tails, edge margins, watercolor/colored pencil texture, and all other geometry. Do not redesign or change materials. Keep the gold button unchanged as the single small contrasting accent. Preserve the genuinely transparent alpha background. Do not add a backdrop, scene, shadows on the ground, text, logo, other objects, patterns or decorative elements. Output a single square transparent PNG product illustration, retaining the original composition and full uncropped backpack.
```
