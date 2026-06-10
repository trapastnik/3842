# FONTS-NEEDED · МТК 38 v2 — письменности под Noto

Для координатора (зона `assets/shared/fonts/noto/`). Выведено из `data/mtk38.json`
(52 языка). Бренд-шрифты (Nolde, 21 Cent, 20 Kopeek) покрывают **латиницу и кириллицу** —
они остаются в `mtk38-globe/fonts/`. Ниже — **29 не-латинских/некириллических письменностей**,
которым нужен bundled Noto, иначе на киоске будут квадраты `▯▯▯`.

| ISO 15924 | Письменность | Языки (id) | Рекомендуемый файл Noto |
|---|---|---|---|
| Hans | китайская упрощ. | zho | NotoSansSC |
| Hant | китайская традиц. | yue | NotoSansTC |
| Jpan | японская | jpn | NotoSansJP |
| Kore | хангыль | kor | NotoSansKR |
| Arab | арабица | ara, bal, prs, urd, uig | NotoSansArabic (+ NotoNaskhArabic) |
| Deva | деванагари | awa | NotoSansDevanagari |
| Beng | бенгальская | asm, ben | NotoSansBengali |
| Gujr | гуджарати | guj | NotoSansGujarati |
| Guru | гурмукхи | pan | NotoSansGurmukhi |
| Orya | ория | ory | NotoSansOriya |
| Taml | тамильская | tam | NotoSansTamil |
| Telu | телугу | tel | NotoSansTelugu |
| Knda | каннада | kan | NotoSansKannada |
| Mlym | малаялам | mal | NotoSansMalayalam |
| Sinh | сингальская | sin | NotoSansSinhala |
| Khmr | кхмерская | khm | NotoSansKhmer |
| Laoo | лаосская | lao | NotoSansLao |
| Mymr | мьянманская | mya, shn | NotoSansMyanmar |
| Tibt | тибетская | bod | NotoSansTibetan |
| Mtei | мейтей-маєк | mni | NotoSansMeeteiMayek |
| Olck | ол-чики | sat | NotoSansOlChiki |
| Ethi | эфиопская | amh | NotoSansEthiopic |
| Armn | армянская | hye | NotoSansArmenian |
| Geor | грузинская | kat | NotoSansGeorgian |
| Grek | греческая | ell | NotoSansGreek (или базовый NotoSans) |
| Hebr | еврейская | heb, yid | NotoSansHebrew |
| Thaa | тхана | div | NotoSansThaana |
| Nkoo | нко | nqo | NotoSansNKo |
| Tfng | тифинаг | tzm | NotoSansTifinagh |

Итого 29 файлов (CJK можно одним `NotoSansCJK`, но раздельные SC/TC/JP/KR легче по весу).
Все — SIL OFL, коммитятся в git. Источник: Google Fonts / notofonts.github.io.

Подключение из варианта:
```css
@font-face { font-family: "Noto Arabic"; src: url("../assets/shared/fonts/noto/NotoSansArabic-Regular.woff2"); }
```

**RTL-письменности** (арабица, иврит, тхана, нко) — нужен `direction: rtl` / `unicode-bidi`
в местах вывода `writing`/`endonym`, иначе порядок глифов поедет.
