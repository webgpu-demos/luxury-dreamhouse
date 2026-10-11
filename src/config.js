// Scale and palette. One real millimetre of brick is MM metres in the game, chosen so a minifig is about 1.8 m tall.
export const MM = 0.045;
export const STUD = 8 * MM; // 0.36 m, the lattice pitch
export const PLATE = 3.2 * MM; // 0.144 m
export const BRICK = 9.6 * MM; // 0.432 m
export const STUD_R = 2.4 * MM;
export const STUD_H = 1.7 * MM;
export const GAP = 0.1 * MM; // clearance on every side of a part, so seams read

// LEGO colours (sRGB), after the LDraw LDConfig table, nudged toward the photos where they disagree.
export const C = {
  white: 0xf4f4f2,
  black: 0x1b2a34,
  red: 0xc91a09,
  darkRed: 0x720e0f,
  yellow: 0xf2cd37,
  brightLightOrange: 0xf8bb3d,
  orange: 0xfe8a18,
  darkOrange: 0xa95500,
  blue: 0x0055bf,
  darkAzure: 0x078bc9,
  mediumAzure: 0x36aebf,
  brightLightBlue: 0x9fc3e9,
  mediumBlue: 0x5a93db,
  darkBlue: 0x0a3463,
  green: 0x237841,
  brightGreen: 0x4b9f4a,
  baseplate: 0x3a9a3c,
  lime: 0xbbe90b,
  yellowishGreen: 0xdfeea5,
  darkGreen: 0x184632,
  sandGreen: 0xa0bcac,
  magenta: 0xa3277e,
  darkPink: 0xc870a0,
  lavender: 0xe1d5ed,
  mediumLavender: 0xac78ba,
  darkPurple: 0x3f3691,
  purple: 0x81007b,
  tan: 0xe4cd9e,
  darkTan: 0x958a73,
  reddishBrown: 0x582a12,
  darkBrown: 0x352100,
  mediumNougat: 0xaa7d55,
  nougat: 0xd09168,
  lightNougat: 0xf6d7b3,
  mediumBrown: 0x755945,
  lightBluishGrey: 0xa0a5a9,
  darkBluishGrey: 0x6c6e68,
  pearlGold: 0xaa7f2e,
  transOrange: 0xf08f1c,
  transYellow: 0xf5cd2f,
  transClear: 0xfcfcfc,
  transLightBlue: 0xaeefec,
  transRed: 0xc91a09,
  transNeonGreen: 0xc0f500,
  transDarkBlue: 0x0020a0,
};

// URL parameters (deterministic stills, debugging).
export const params = new URLSearchParams(location.search);
