# UI assets

Icons are SVG exports from the approved [Clash Tank Figma design](https://www.figma.com/design/l3fe9OmtvpMyYDG1LJJbcF/clashTank?node-id=5-21). File prefixes identify the source state; root dimensions and vector artwork are preserved. Fonts are bundled locally from Fontsource dependencies.

`controller/` contains the six state exports from the [approved latched controller component](https://www.figma.com/design/l3fe9OmtvpMyYDG1LJJbcF/clashTank?node-id=43-275): neutral, forward, left, right, backward, and offline. The original 352 × 352 SVG bounds include 13 px of shadow around the 326 × 326 interaction area. These files are bundled locally; runtime code does not depend on temporary Figma URLs.
