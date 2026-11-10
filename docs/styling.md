This covers the Fresh Lime design as I built it, light and dark. It doesn't include changes you've made by hand on the canvas.

## Fonts
| Use | Font | Weights | Sizes |
|---|---|---|---|
| Headings, logo, card ranks, table code | **Sora** | 600, 700, 800 | Hero 64 · page title 40–44 · section 20–28 · table code 40 |
| Body, labels, buttons | **Inter** | 400–800 | Body 15–16 · small 13 · caption 12 |

Headings use letter-spacing −0.03em. Small uppercase labels use +0.08em.

## Colours: light
| Role | Hex |
|---|---|
| Page background | `#F4F6F3` |
| Card / surface | `#FFFFFF` |
| Secondary surface (inputs, chips) | `#EEF2EC` |
| Border | `#DCE3D8` |
| Text / ink | `#0F1A14` |
| Muted text | `#56635B` |
| **Lime (primary accent)** | `#B8F23A` (text on it: `#132003`) |
| Lime as text / links | `#3F6B00` |
| Lime soft (selected state) | `#F2FBDF` |
| **Teal (table felt, feature panels)** | `#0E9F8E` · line `#2DB8A6` · icons `#0B7D70` |
| Text on teal | `#FFFFFF`, `#E6FFFB`, `#CFF5EF` |
| Dark cards (stats, table code) | `#0F1A14` · inner tiles `#1E2B25` · muted `#B9C4BD` |
| Positive / negative | `#2F7A00` / `#C2264F` |
| Danger zone | bg `#FFF5F8` · border `#F5C2D0` |

## Colours: dark
| Role | Hex |
|---|---|
| Page background | `#0B110E` |
| Card / surface | `#141C18` |
| Secondary surface | `#1C2621` |
| Border | `#2A3731` |
| Text | `#EEF3EF` |
| Muted text | `#9AA8A0` |
| Lime accent and lime text | `#B8F23A` · soft `#1F2B14` |
| Teal panels / felt | `#0B7D70` · felt line `#22A090` · icons `#5FD4C4` |
| Inverted buttons | bg `#EEF3EF` · text `#0F1A14` |
| Stat tiles | `#26332C` |
| Positive / negative | `#9BE15D` / `#FF7A98` |
| Danger zone | bg `#22141A` · border `#5A2433` |

## Game colours
| Element | Hex |
|---|---|
| Table edge | `#0F1A14` (dark mode `#050806`) |
| Chips | `#FF5FA2`, dashed edge `#FFD6E8` |
| Dealer button | `#FFC93C`, text `#2A1E00` |
| Call button | `#5B8CFF`, text `#061433` |
| Card face | `#FFFFFF` · red suits `#E0245E` · black suits `#0F1A14` |
| Card back | lime stripes `#B8F23A` / `#9AD61F`, edge `#0F1A14` |
| Camera tile background | `#1E2B25` (dark mode `#18231E`) |
| Name strip on video | `rgba(8,8,14,0.72)` |
| **Player colours** | `#B8F23A` · `#FF5FA2` · `#5B8CFF` · `#FFB020` · `#2DD4BF` · `#C084FC` (initials in `#15161A`) |

## Shapes and spacing
- **Corner radius:** buttons and pills fully round (999px) · panels 20 · feature cards 24–28 · camera tiles 18–22 · inputs 14 · playing cards 10 · icon boxes 10–12 · table 120.
- **Button heights:** primary 52 (Start game 60) · secondary 44 · nav and pills 40 · quick-bet buttons 32. Everything you can click is at least 44px tall, except the 40px nav links and pills and the 32px quick-bet buttons.
- **Layout:** page padding 32 · gap between columns 24 · gaps inside cards 12–20 · content max width 1360 (table screen 1480).
- **Shadows:**
  - playing cards `0 6px 16px rgba(15,26,20,.25)`
  - active player's tile: lime ring `0 0 0 6px rgba(184,242,58,.45)`
  - table: an offset "base" `0 20px 0 -4px #CFE0D9` plus a soft teal glow
- **Icons:** drawn line icons, 2px stroke with rounded ends, mostly 20px.

## Using it in code

Never write a hex value in a component. Every value above is a CSS variable, and the dark theme swaps them automatically.

| File | Contains |
|---|---|
| `ui/src/styles/tokens.css` | All colours, fonts, sizes, radii and shadows as variables, light and dark |
| `ui/src/styles/base.css` | Reset, headings, `.label`, `.muted`, `.positive` / `.negative`, `.page` layout |
| `ui/src/styles/components.css` | `.btn` + variants, `.pill`, `.input`, `.switch`, `.panel` (`--feature`, `--dark`, `--danger`), `.stat`, `.banner` |
| `ui/src/components/` | `Button`, `PlayingCard` (takes engine cards like `"As"`), `Avatar` (initials + player colour), `ChipAmount`, `DealerButton` |

Naming: `--color-<role>` (`--color-lime`, `--color-muted`), `--player-1` … `--player-6`, `--radius-<thing>`, `--height-<button>`, `--space-<n>` (4px steps), `--text-<size>`. Open http://localhost:5173/styleguide to see them all in both themes.

The theme follows the operating system. `setTheme('light' | 'dark' | 'system')` in `ui/src/theme.js` forces one.