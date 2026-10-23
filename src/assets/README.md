# UI assets

Icons are SVG exports from the approved [Clash Tank Figma design](https://www.figma.com/design/l3fe9OmtvpMyYDG1LJJbcF/clashTank?node-id=5-21). File prefixes identify the source state; root dimensions and vector artwork are preserved. Fonts are bundled locally from Fontsource dependencies.

`controller/` contains the six state exports from the [approved latched controller component](https://www.figma.com/design/l3fe9OmtvpMyYDG1LJJbcF/clashTank?node-id=43-275): neutral, forward, left, right, backward, and offline. The 351 × 351 SVG bounds include the neumorphic shadows around the 326 × 326 interaction area (10 px above/left, 15 px below/right). These files are bundled locally; runtime code does not depend on temporary Figma URLs.

The orange microphone, combat icons, and connection progress indicator are exports from the latest Figma revision. Combat controls are intentionally disabled until the direct-control protocol supports them; they do not publish voice commands or replace the current movement session.
