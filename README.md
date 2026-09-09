# Neutron Drift: CANDU

A scientific arcade game about guiding a neutron through a stylized CANDU calandria.

Steer through moving deuterium atoms to slow into the thermal energy band, then enter an orange fuel channel to continue the fission lineage. Avoid glowing green poisoned channels, moving control rods, and the calandria boundary.

## Play

[Play Neutron Drift: CANDU](https://madcapclover.github.io/neutron-drift-candu/)

## Play locally

Requires Node.js 18 or newer.

```bash
npm start
```

Open <http://127.0.0.1:4173/> in a browser.

## Controls

- WASD or arrow keys: steer
- Touch joystick: steer on mobile
- P, Space, or Escape: pause
- Flight guide toggle: show or hide the dotted heading indicator

## Development

The game uses dependency-free browser modules and a deterministic simulation engine.

```bash
npm test
npm run build
```

The reactor physics are deliberately simplified for approachable gameplay and should not be used for reactor analysis.
