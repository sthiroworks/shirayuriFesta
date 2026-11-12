# 巾着M・通園カバンの商品画像

2026-11-12、組み込みの画像生成ツールで作成。既存の商品画像に合わせた水彩・色鉛筆調のイラスト。背景透過の生成結果を、縦横比とアルファチャンネルを保って256×256pxに縮小した。

| 商品 | 初期設定 | 画像 | 公開用の同一画像 |
| --- | --- | --- | --- |
| 巾着M | 園グッズ・200円 | `assets/icons/drawstring-bag-m.png` | `dist/assets/icons/drawstring-bag-m.png` |
| 通園カバン | 古園服・300円 | `assets/icons/kindergarten-bag.png` | `dist/assets/icons/kindergarten-bag.png` |

実物の写真ではなく、商品を見分けるためのイメージ。生成時は両方とも `transparent_background: true` を指定した。

## 巾着Mの最終プロンプト

```text
Use case: product-mockup. Asset type: a single square transparent PNG product illustration for a Japanese kindergarten fair cash register, used as a small 64px product thumbnail alongside existing hand-painted product icons. Primary request: 巾着M, one medium-sized handmade fabric drawstring pouch. Depict just ONE upright medium cotton drawstring bag, gathered closed at the top with two short navy blue drawstrings looping outward. Warm cream cloth with a pale sky-blue lower panel and a very simple small blue flower print (large sparse flowers, not tiny busy details). Clearly a soft medium-sized pouch for kindergarten belongings, no handles, no shoulder strap, no objects sticking out. Style/medium: charming hand-painted watercolor and colored pencil product illustration, slightly dimensional fabric folds, dark fine navy ink outline, softly shaded, clean distinct silhouette, in the style of small Japanese school-fair merchandise icons. Composition: centered, slight three-quarter front view, the bag fills about 85 percent of a square canvas, include all cords with generous transparent edge margin, subject readable at 64px, isolated object only. Background: genuinely transparent alpha everywhere outside the object; no scene, no ground plane, no backdrop, no opaque white rectangle, no frame. Constraints: no words, no labels, no prices, no letters, no logo, no watermark, no other objects, no surrounding decoration.
```

## 通園カバンの最終プロンプト

```text
Use case: product-mockup. Asset type: a single square transparent PNG product illustration for a Japanese kindergarten fair cash register, used as a small 64px product thumbnail alongside existing watercolor school-clothing and handmade school-bag icons. Primary request: 通園カバン, one traditional Japanese kindergarten child's shoulder schoolbag, NOT a backpack or tote. Subject: a small structured rounded rectangular warm golden-yellow satchel, soft yellow faux leather with subtle seams, a large curved front flap secured by one simple small silver clasp, a narrow golden ochre adjustable long shoulder strap visibly arching in a neat large loop above the bag, attached at each side. No text or school emblem. Style/medium: charming hand-painted watercolor and colored pencil product illustration, dark fine navy ink contour, gentle dimensional shading and material highlights, clean distinct silhouette. Composition: ONE satchel centered, slight three-quarter front view showing a little of the right side, 85 percent of square canvas, entire long shoulder strap loop and bag visible with generous transparent edge margin; recognizable at 64px. Lighting: softly lit, cheerful school merchandise. Background: genuinely transparent alpha outside the object, no scene, no background color, no floor, no white rectangle or frame. Avoid: any words, letters, labels, name tags, prices, logos, watermark, people, backpack straps, books, other objects, decorations. Make the body clearly a compact yellow Japanese kindergarten shoulder satchel with a flap, visibly different from a fabric drawstring pouch or hand tote.
```
