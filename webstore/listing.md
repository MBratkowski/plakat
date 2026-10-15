# Chrome Web Store kit: Plakat 0.2.0

Everything needed to submit Plakat in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Creating the developer account, paying the one-time registration fee and pressing **Submit for review** are manual steps.

## Files

| What | Where | Dashboard field |
|---|---|---|
| Package | `dist/plakat-0.2.0.zip`, built by `python3 dev/package.py` | Package → Upload new package |
| Store icon, 128×128 | `icons/icon128.png` | Store listing → Store icon |
| Screenshots, 1280×800 | `webstore/screenshots/pl/` and `webstore/screenshots/en/`, rendered by `python3 dev/webstore.py` | Store listing → Screenshots, per language |
| Small promo tile, 440×280 | `webstore/promo-tile-440x280.png` | Store listing → Small promo tile |
| Marquee, 1400×560 (optional) | `webstore/marquee-1400x560.png` | Store listing → Marquee promo tile |
| Privacy policy | https://mbratkowski.github.io/plakat/privacy.html | Privacy → Privacy policy URL |
| Homepage | https://mbratkowski.github.io/plakat/ | Store listing → Homepage URL |
| Support | https://github.com/MBratkowski/plakat/issues | Store listing → Support URL |

`dev/package.py` refuses to build when a referenced file is missing or the name or summary is over the store's limits (75 and 132 characters).

## Store listing

The name and the summary come from the package: `_locales/pl/messages.json` (default) and `_locales/en/messages.json`, which holds only the name and summary, so English-speaking users see an English listing while the settings stay in Polish.

- **Name:** pl "Plakat — miniatury jak plakaty", en "Plakat — thumbnails as posters"
- **Summary:** pl "Zamienia miniatury i awatary kanałów na YouTube w generatywne plakaty. Każdy kanał dostaje własną serię w jednym z pięciu stylów." en "Turns YouTube thumbnails and channel avatars into generative posters. Every channel gets its own series in one of five styles."
- **Category:** the dashboard's personalisation or look-and-feel category for extensions that change how sites look.
- **Languages:** Polish (default) and English. Upload the screenshots from the matching folder for each.

### Description, Polish

```text
Plakat zamienia miniatury filmów i awatary kanałów na YouTube w generatywne plakaty.

Każdy kanał dostaje własną serię: styl, paletę i układ wyznacza seed kanału, a każdy film jest nowym wariantem tej serii. Kanał zawsze wygląda jak on sam, a feed zaczyna przypominać ścianę plakatów zamiast mozaiki krzykliwych miniatur.

STYLE
• Szwajcarski: siatka, grotesk i jeden mocny gest: ogromny numer odcinka, koło albo pierścienie.
• Bauhaus: siatka prostych form w kolorach podstawowych, każdy kanał z własnym słownikiem kształtów.
• Konstruktywizm: przekątne, czerwony klin, czarny pas z tytułem i fotomontaż z miniatury.
• Jazz '60: okładka płyty, zdjęcie w duotonie i jedno wielkie słowo z tytułu.
• Ma 間: pustka, jedno koło i szeryfowy tytuł.
• Terminal i Kod (do włączenia w ustawieniach): konsola i edytor kodu dla kanałów technologicznych.

AWATARY
Awatary kanałów przy filmach, w wynikach wyszukiwania, w subskrypcjach, na stronie filmu i w nagłówku kanału należą do tej samej serii co miniatury. Autorzy komentarzy zachowują swoje zdjęcia, chyba że włączysz inaczej.

JAK UŻYWAĆ
• Najechanie na plakat pokazuje oryginalną miniaturę.
• Alt+Shift+P włącza i wyłącza plakaty.
• W ustawieniach przypniesz styl do kanału, przelosujesz serię albo zaprojektujesz własny styl i wymienisz go z innymi jako plik JSON.

PRYWATNOŚĆ
Plakat działa w całości w przeglądarce. Nie ma serwerów, analityki ani kont i niczego nie wysyła. Lokalnie zapisuje ustawienia i listę widzianych kanałów, która służy do podglądu w ustawieniach. Listę wyczyścisz jednym przyciskiem.
Polityka prywatności: https://mbratkowski.github.io/plakat/privacy.html

Plakat nie jest powiązany z YouTube ani Google.
Kod źródłowy: https://github.com/MBratkowski/plakat
```

### Description, English

```text
Plakat redraws YouTube video thumbnails and channel avatars as generative posters.

Every channel gets its own series: the channel's seed sets the style, the palette and the layout, and every video is a new variant of that series. A channel always looks like itself, and your feed starts to look like a wall of posters instead of a mosaic of loud thumbnails.

STYLES
• Swiss: a grid, grotesque type and one loud gesture: a giant episode number, a circle or rings.
• Bauhaus: a grid of primitives in primary colours, with a shape vocabulary of its own for each channel.
• Constructivism: diagonals, a red wedge, a black title band and a photomontage cut from the thumbnail.
• Jazz '60: a record sleeve with a duotone photo and one huge word from the title.
• Ma 間: emptiness, a single circle and a serif title.
• Terminal and Kod (opt-in in the settings): a console and a code editor for tech channels.

AVATARS
Channel avatars next to videos, in search results, in your subscriptions, on the watch page and in channel headers belong to the same series as the thumbnails. Comment authors keep their own pictures unless you switch that on.

HOW TO USE
• Hover any poster to see the original thumbnail.
• Alt+Shift+P turns the posters on and off.
• In the settings, pin a style to a channel, reroll a series, or design your own style and share it as a JSON file.
The settings page is in Polish for now.

PRIVACY
Plakat runs entirely in your browser. It has no servers, no analytics and no account, and it sends nothing. It stores your settings and a list of channels you have seen on your device, used to preview them in the settings and to recognise each channel's topic. One button clears the list.
Privacy policy: https://mbratkowski.github.io/plakat/privacy.html

Plakat is not affiliated with YouTube or Google.
Source code: https://github.com/MBratkowski/plakat
```

## Privacy practices

### Single purpose

```text
Plakat restyles YouTube: it draws generative posters over video thumbnails and channel avatars on www.youtube.com, one consistent visual series per channel.
```

### Permission justifications

`storage`:

```text
Stores the user's settings (on/off switches, the styles in the draw, custom styles, per-channel choices, style by topic and the styles each topic draws from), a local list of channels the user has seen on YouTube (channel handle and name, IDs and titles of up to 12 recent videos, avatar image URL; for channel and video pages the user opens, the page's keywords, tags and category) and the topic recognised for each channel, so the settings page can preview each channel's posters on its real titles and, when the user turns it on, a channel's style can follow its topic. Nothing is transmitted.
```

Host permission (the content script on `https://www.youtube.com/*`):

```text
The content script runs only on https://www.youtube.com/* to read video titles, channel names, image URLs and, on watch and channel pages, the page's meta keywords and category, and to draw the poster overlays there. It does not run on any other site and makes no network requests of its own.
```

### Remote code

Select **No, I am not using remote code**. All JavaScript, CSS and fonts ship in the package.

### Data usage

Plakat reads video titles, channel names and page keywords and categories from YouTube pages and keeps some of them on the device. Nothing leaves the browser, but the honest, low-risk choice is to declare it:

- Tick **Website content** (titles, channel names, page keywords and categories read from YouTube pages, stored locally).
- Leave every other category unticked.
- Tick all three certifications: the data is not sold or transferred to third parties outside the approved use cases, not used for purposes unrelated to the single purpose, and not used to determine creditworthiness or for lending.

The privacy policy describes exactly what is stored, says nothing is sent, includes the Limited Use statement, and points to the **Wyczyść listę kanałów** button that clears the list.

## Distribution

- **Visibility:** start with **Unlisted** so testers can install from the link, then switch to **Public**.
- **Regions:** all.
- **Price:** free.

## Before each submission

- [ ] `python3 dev/e2e.py editor` passes.
- [ ] `version` in `manifest.json` is higher than the version in the store.
- [ ] `python3 dev/package.py` builds `dist/plakat-<version>.zip`.
- [ ] `python3 dev/webstore.py` was rerun if the look changed.
- [ ] https://mbratkowski.github.io/plakat/privacy.html loads and its date matches any change in data handling.
