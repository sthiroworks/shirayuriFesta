# 巾着M・通園カバンの商品画像

2026-11-12、組み込みの画像生成ツールで作成。既存の商品画像に合わせた水彩・色鉛筆調のイラスト。背景透過の生成結果を、縦横比とアルファチャンネルを保って256×256pxに縮小した。

| 商品 | 初期設定 | 画像 | 公開用の同一画像 |
| --- | --- | --- | --- |
| 巾着M | 園グッズ・200円 | `assets/icons/drawstring-bag-m.png` | `dist/assets/icons/drawstring-bag-m.png` |
| 通園カバン | 古園服・300円 | `assets/icons/kindergarten-bag-navy-v4.png` | `dist/assets/icons/kindergarten-bag-navy-v4.png` |

実物の写真ではなく、商品を見分けるためのイメージ。生成時は両方とも `transparent_background: true` を指定した。

通園カバンは提供された紺色リュックの正面写真を元に、丸い上部・半円形の前ポケット・丸い金色のボタン・短い持ち手・下部のひもを再現した。既存の `shoe-bag.png` を水彩・色鉛筆調のスタイル参照にして作成。組み込みの画像生成ツールで形と金色のボタンを保ち、本体・ひも・縁取りを黒に近い濃紺に揃えた後、ポケットの輪郭が読み取りやすくなる程度にわずかに明度を上げた。旧版の画像も保存済み設定からの参照用に保持している。

## 巾着Mの最終プロンプト

```text
Use case: product-mockup. Asset type: a single square transparent PNG product illustration for a Japanese kindergarten fair cash register, used as a small 64px product thumbnail alongside existing hand-painted product icons. Primary request: 巾着M, one medium-sized handmade fabric drawstring pouch. Depict just ONE upright medium cotton drawstring bag, gathered closed at the top with two short navy blue drawstrings looping outward. Warm cream cloth with a pale sky-blue lower panel and a very simple small blue flower print (large sparse flowers, not tiny busy details). Clearly a soft medium-sized pouch for kindergarten belongings, no handles, no shoulder strap, no objects sticking out. Style/medium: charming hand-painted watercolor and colored pencil product illustration, slightly dimensional fabric folds, dark fine navy ink outline, softly shaded, clean distinct silhouette, in the style of small Japanese school-fair merchandise icons. Composition: centered, slight three-quarter front view, the bag fills about 85 percent of a square canvas, include all cords with generous transparent edge margin, subject readable at 64px, isolated object only. Background: genuinely transparent alpha everywhere outside the object; no scene, no ground plane, no backdrop, no opaque white rectangle, no frame. Constraints: no words, no labels, no prices, no letters, no logo, no watermark, no other objects, no surrounding decoration.
```

## 通園カバンの最終プロンプト

```text
Use case: precise-object-edit. Input image 1 is the ONLY edit target: the current almost-black midnight navy watercolor illustration of a front-facing kindergarten backpack with one gold button. Make a VERY SMALL BRIGHTNESS-ONLY adjustment to the navy areas: lift the dark navy body, curved front pocket, piping, top loop and bottom webbing straps just a little, roughly a 10 percent perceived brightness increase. Keep it distinctly very dark, close-to-black navy. Aim for soft dark navy midtones near #152131 with restrained highlights near #293747 and deep shadows still near #0A111B. This is a subtle small lift, not a return to a medium or bright blue bag. Let the watercolor texture and curved pocket edge read a little more easily. Do not increase saturation or add strong shiny highlights. Preserve EXACTLY the same silhouette, shape, proportions, front view, curved pocket flap, seams, loop, two short strap tails, scale, composition, edge margins, colored-pencil/watercolor material and all other details. Keep the round gold snap button completely unchanged in its color, brightness, size and position. Do not redesign the backpack. Preserve the genuinely transparent alpha background with no scene or ground shadow. Do not add patterns, text, logos, borders or other objects. Output a single square transparent PNG containing the same complete uncropped backpack, only slightly brighter in its navy areas.
```
