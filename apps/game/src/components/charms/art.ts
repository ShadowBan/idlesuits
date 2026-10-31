/**
 * The charms' illustrations, one style for all: a 64×64 drawing with a thick
 * dark outline, flat colour and a single highlight, so they read like
 * keepsakes on a shelf at any size. Inner SVG markup, keyed by charm id.
 */

const O = 'stroke="#2a1a12" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
const T = 'stroke="#2a1a12" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
/** A soft white shine, laid over a shape's upper left. */
const shine = (d: string) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/>`;

export const CHARM_ART: Record<string, string> = {
  'lucky-penny': `
    <circle cx="32" cy="32" r="24" fill="#c8743a" ${O}/>
    <circle cx="32" cy="32" r="18.5" fill="#dd8b4c" ${T}/>
    <path d="M14 32a18 18 0 0 1 36 0" fill="none" stroke="#b8642e" stroke-width="1.2" stroke-dasharray="1.5 2.5"/>
    <text x="32" y="40" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="22" fill="#8a4419">1¢</text>
    <text x="32" y="50" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="6" letter-spacing="1.2" fill="#8a4419">LUCKY</text>
    ${shine('M14 26a19 19 0 0 1 9-11')}`,

  acorn: `
    <path d="M32 6c1 3 1 5 0 8" fill="none" ${O}/>
    <path d="M18 34c0 11 6 22 14 24 8-2 14-13 14-24z" fill="#d9a35b" ${O}/>
    <path d="M13 31c0-9 8-17 19-17s19 8 19 17c0 3-2 4-4 4H17c-2 0-4-1-4-4z" fill="#8a5a34" ${O}/>
    <path d="M19 22l26 9M17 29l22-12M27 16l18 16M22 34l20-18" stroke="#6b4325" stroke-width="1.4" fill="none"/>
    ${shine('M23 40c0 6 2 10 5 13')}`,

  'fuzzy-dice': `
    <path d="M24 4v12M40 4v16" fill="none" ${T}/>
    <rect x="8" y="16" width="26" height="26" rx="6" fill="#f38bb5" transform="rotate(-12 21 29)" ${O} stroke-dasharray="3 1.4"/>
    <rect x="30" y="22" width="26" height="26" rx="6" fill="#f6f1ea" transform="rotate(10 43 35)" ${O} stroke-dasharray="3 1.4"/>
    <g fill="#2a1a12"><circle cx="15" cy="25" r="2.2"/><circle cx="21" cy="29" r="2.2"/><circle cx="26" cy="33" r="2.2"/>
    <circle cx="37" cy="29" r="2.2"/><circle cx="49" cy="31" r="2.2"/><circle cx="36" cy="41" r="2.2"/><circle cx="48" cy="43" r="2.2"/></g>`,

  wishbone: `
    <path d="M32 54V36M32 36C26 30 16 22 12 10M32 36c6-6 16-14 20-26" fill="none" stroke="#2a1a12" stroke-width="10" stroke-linecap="round"/>
    <path d="M32 54V36M32 36C26 30 16 22 12 10M32 36c6-6 16-14 20-26" fill="none" stroke="#f3e4c4" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="12" cy="10" r="5" fill="#f3e4c4" ${O}/><circle cx="52" cy="10" r="5" fill="#f3e4c4" ${O}/><circle cx="32" cy="55" r="5" fill="#f3e4c4" ${O}/>`,

  'lucky-socks': `
    <path d="M20 6h20v28c0 4 2 7 6 10 5 4 6 11 0 14-4 2-9 1-13-2L18 44c-3-3-4-6-4-10V6z" fill="#f4ede0" ${O}/>
    <path d="M20 6h20v7H20z" fill="#d4443b" ${T}/><path d="M20 18h20v5H20z" fill="#3d7be0" ${T}/>
    <path d="M16 6h28" ${O}/>
    <path d="M34 50c3 2 7 3 10 2" fill="none" stroke="#d4443b" stroke-width="5" stroke-linecap="round"/>
    ${shine('M24 28v10')}`,

  horseshoe: `
    <path d="M14 12v18c0 11 8 20 18 20s18-9 18-20V12h-9v18c0 6-4 10-9 10s-9-4-9-10V12z" fill="#a7adb6" ${O}/>
    <rect x="12" y="8" width="11" height="6" rx="2" fill="#8e949d" ${T}/><rect x="41" y="8" width="11" height="6" rx="2" fill="#8e949d" ${T}/>
    <g fill="#2a1a12"><circle cx="18.5" cy="22" r="1.6"/><circle cx="19.5" cy="33" r="1.6"/><circle cx="26" cy="43" r="1.6"/>
    <circle cx="45.5" cy="22" r="1.6"/><circle cx="44.5" cy="33" r="1.6"/><circle cx="38" cy="43" r="1.6"/></g>
    ${shine('M17 16v12')}`,

  ladybug: `
    <circle cx="32" cy="17" r="8" fill="#2a1a12"/>
    <path d="M27 11l-5-5M37 11l5-5" ${O}/>
    <ellipse cx="32" cy="36" rx="20" ry="19" fill="#e0453a" ${O}/>
    <path d="M32 18v36" ${O}/>
    <g fill="#2a1a12"><circle cx="22" cy="30" r="3.5"/><circle cx="42" cy="30" r="3.5"/><circle cx="24" cy="43" r="3"/><circle cx="40" cy="43" r="3"/><circle cx="32" cy="24" r="0"/></g>
    ${shine('M17 30c1-5 4-8 8-10')}`,

  'lucky-cricket': `
    <path d="M38 20c6-10 14-14 22-14M40 22c8-6 16-6 22-4" fill="none" ${T}/>
    <ellipse cx="30" cy="36" rx="20" ry="10" fill="#6aa84f" ${O}/>
    <circle cx="46" cy="30" r="7" fill="#7cbf5e" ${O}/><circle cx="48" cy="28" r="1.8" fill="#2a1a12"/>
    <path d="M18 40l-8 12h8M30 44l-4 12M14 30L6 20l14 6" fill="none" ${O}/>
    <path d="M14 34c8-6 22-7 30-4" fill="none" stroke="#4f8a38" stroke-width="2"/>
    ${shine('M16 32c4-3 9-4 14-4')}`,

  'silver-dollar': `
    <circle cx="32" cy="32" r="25" fill="#c9ced6" ${O}/>
    <circle cx="32" cy="32" r="19" fill="#e4e8ee" ${T}/>
    <g fill="#9aa1ab">${Array.from({ length: 13 }, (_, i) => {
      const a = (i / 13) * Math.PI * 2;
      return `<circle cx="${(32 + Math.cos(a) * 22).toFixed(1)}" cy="${(32 + Math.sin(a) * 22).toFixed(1)}" r="1.3"/>`;
    }).join('')}</g>
    <text x="32" y="40" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="20" fill="#6c737d">$1</text>
    ${shine('M15 24a19 19 0 0 1 11-11')}`,

  'fortune-cookie': `
    <path d="M8 38c4-14 16-22 28-20 10 2 18 10 20 20-6-4-12-4-17 0-3-6-9-9-15-7-6 1-11 4-16 7z" fill="#e8b45c" ${O}/>
    <path d="M10 37c6 8 16 12 26 10 4-1 2-6 3-9" fill="#d69a3f" ${O}/>
    <path d="M30 34l20 14 3-4-20-13z" fill="#fbf7ee" ${T}/>
    <path d="M36 39l8 6M41 39l5 3.5" stroke="#d4443b" stroke-width="1.2"/>
    ${shine('M16 27c4-4 9-6 14-6')}`,

  'magic-8-ball': `
    <circle cx="32" cy="32" r="25" fill="#1d1d22" ${O}/>
    <circle cx="34" cy="29" r="11" fill="#f6f2ea" ${T}/>
    <text x="34" y="35" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="15" fill="#1d1d22">8</text>
    ${shine('M14 24a19 19 0 0 1 9-11')}`,

  'pair-of-dice': `
    <rect x="6" y="20" width="26" height="26" rx="5" fill="#e2403a" transform="rotate(-14 19 33)" ${O}/>
    <rect x="30" y="16" width="26" height="26" rx="5" fill="#e2403a" transform="rotate(12 43 29)" ${O}/>
    <g fill="#fff"><circle cx="13" cy="28" r="2.4"/><circle cx="25" cy="38" r="2.4"/><circle cx="19" cy="33" r="2.4"/>
    <circle cx="37" cy="21" r="2.4"/><circle cx="49" cy="24" r="2.4"/><circle cx="35" cy="33" r="2.4"/><circle cx="47" cy="36" r="2.4"/></g>`,

  'golden-ticket': `
    <path d="M6 18h52v8a6 6 0 0 0 0 12v8H6v-8a6 6 0 0 0 0-12z" fill="#f2c64e" ${O} transform="rotate(-8 32 32)"/>
    <g transform="rotate(-8 32 32)">
      <path d="M44 18v28" stroke="#b08423" stroke-width="1.6" stroke-dasharray="3 2.5"/>
      <text x="25" y="31" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="8" fill="#7a5810">ADMIT</text>
      <text x="25" y="40" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="8" fill="#7a5810">ONE</text>
      <path d="M51 28l1.5 3 3 .4-2.2 2 .6 3.2-2.9-1.6-2.9 1.6.6-3.2-2.2-2 3-.4z" fill="#fff6c8" ${T}/>
    </g>`,

  'mojo-bag': `
    <path d="M22 18c-8 8-12 18-10 28 2 9 10 12 20 12s18-3 20-12c2-10-2-20-10-28z" fill="#c2332b" ${O}/>
    <path d="M20 18c4 3 20 3 24 0" fill="none" ${O}/>
    <path d="M24 12c3 3 13 3 16 0l2 6H22z" fill="#a52a24" ${O}/>
    <path d="M32 19c-2 6-8 7-12 4M32 19c2 6 8 7 12 4" fill="none" stroke="#e8b64c" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="32" cy="19" r="2.4" fill="#e8b64c" ${T}/>
    ${shine('M18 34c0-5 2-9 5-12')}`,

  'lucky-bamboo': `
    <path d="M18 46h28l-3 12H21z" fill="#3d7be0" ${O}/>
    <rect x="16" y="42" width="32" height="6" rx="2" fill="#5b93ec" ${O}/>
    <path d="M24 42V12M32 42V6M40 42V16" stroke="#2a1a12" stroke-width="7" stroke-linecap="round"/>
    <path d="M24 42V12M32 42V6M40 42V16" stroke="#7cc46a" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M22 26h4M30 20h4M30 32h4M38 28h4" stroke="#2a1a12" stroke-width="1.6"/>
    <path d="M24 16c-6-2-10 0-12 4 5 1 9 0 12-4zM40 20c6-3 10-2 12 2-5 2-9 1-12-2zM32 12c4-4 9-4 12-1-4 3-8 3-12 1z" fill="#5fae4e" ${T}/>`,

  'four-leaf-clover': `
    <path d="M32 34c4 8 4 16 10 24" fill="none" stroke="#2a1a12" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 34c4 8 4 16 10 24" fill="none" stroke="#3c9a4e" stroke-width="2.2" stroke-linecap="round"/>
    ${[0, 90, 180, 270]
      .map(
        (r) =>
          `<path d="M32 32C26 26 19 20 23 14c3-4 8-3 9 1 1-4 6-5 9-1 4 6-3 12-9 18z" fill="#46b35c" ${O} transform="rotate(${r + 45} 32 32)"/>`,
      )
      .join('')}
    <circle cx="32" cy="32" r="2.5" fill="#2f8a42"/>
    ${shine('M18 22c2-3 5-3 7-2')}`,

  'rabbits-foot': `
    <circle cx="40" cy="8" r="5.5" fill="none" stroke="#c9ced6" stroke-width="3"/><circle cx="40" cy="8" r="5.5" fill="none" ${T}/>
    <g transform="rotate(-24 32 34)">
      <path d="M28 12h11l-1 7H29z" fill="#e8b64c" ${O}/>
      <path d="M27 19c-6 7-9 15-9 22 0 3 1 6 3 8-2 2-1 6 2 6 1 2 4 3 6 1 2 2 5 2 7 0 3 1 6-1 6-4 2-2 3-5 2-8 0-9-3-18-8-25z"
        fill="#f7f3ec" ${O}/>
      <path d="M23 49c3 1 6 1 8-1M31 50c3 1 6 0 8-2" fill="none" stroke="#d8cfc0" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M25 30l-3-2M38 27l3-2M24 38l-3 0M40 36l3 1" stroke="#d8cfc0" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="30" cy="54" rx="2.4" ry="1.6" fill="#f2a7b0"/><ellipse cx="36" cy="54" rx="2.4" ry="1.6" fill="#f2a7b0"/>
    </g>
    ${shine('M22 33c1-5 3-9 6-12')}`,

  'maneki-neko': `
    <path d="M42 22c2-8 6-14 10-14 3 6 1 12-2 16" fill="#f7f3ec" ${O}/>
    <ellipse cx="30" cy="44" rx="17" ry="15" fill="#f7f3ec" ${O}/>
    <circle cx="30" cy="26" r="14" fill="#f7f3ec" ${O}/>
    <path d="M18 18l1-10 8 6M42 18l-1-10-8 6" fill="#f7f3ec" ${O}/>
    <path d="M20 13l1 3M40 13l-1 3" stroke="#f08a91" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M23 26c1-1.6 3-1.6 4 0M33 26c1-1.6 3-1.6 4 0" fill="none" ${T}/>
    <path d="M28 31c1 1 3 1 4 0" fill="none" ${T}/>
    <path d="M17 37c8 4 18 4 26 0" fill="none" stroke="#d4443b" stroke-width="4" stroke-linecap="round"/>
    <circle cx="30" cy="42" r="3.6" fill="#e8b64c" ${T}/>
    <ellipse cx="22" cy="50" rx="5" ry="4" fill="#f7f3ec" ${T}/>`,

  'iching-coins': `
    <path d="M6 54c8-10 20-30 28-48" fill="none" stroke="#d4443b" stroke-width="3.5" stroke-linecap="round"/>
    ${[
      [32, 14],
      [24, 30],
      [14, 46],
    ]
      .map(
        ([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#e3b04a" ${O}/>
      <rect x="${x! - 3.5}" y="${y! - 3.5}" width="7" height="7" fill="#7a4a1a" ${T}/>
      <circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#b07f24" stroke-width="1.2"/>`,
      )
      .join('')}
    <path d="M44 30l12-6M46 38l12 2" stroke="#d4443b" stroke-width="3" stroke-linecap="round"/>`,

  'lucky-ace': `
    <rect x="14" y="7" width="36" height="50" rx="5" fill="#faf6ec" ${O} transform="rotate(8 32 32)"/>
    <g transform="rotate(8 32 32)">
      <text x="20" y="18" font-family="Oswald,sans-serif" font-weight="700" font-size="9" fill="#1d1d22">A</text>
      <path d="M32 22c-6 6-11 9-11 14 0 4 4 6 8 4l-2 6h10l-2-6c4 2 8 0 8-4 0-5-5-8-11-14z" fill="#1d1d22"/>
    </g>
    ${shine('M18 14v10')}`,

  'lucky-elephant': `
    <path d="M8 46c-2-11 5-20 16-20h12c6 0 10 4 10 10v16h-7v-7h-6v7h-7v-7h-6v7H8z" fill="#a9b0bb" ${O}/>
    <path d="M8 40c-3 0-5 2-5 5" fill="none" ${T}/>
    <path d="M46 34c6 0 9-4 10-10 1-6 0-11 3-14 2-2 5-1 4 2" fill="none" stroke="#2a1a12" stroke-width="8" stroke-linecap="round"/>
    <path d="M46 34c6 0 9-4 10-10 1-6 0-11 3-14 2-2 5-1 4 2" fill="none" stroke="#a9b0bb" stroke-width="4.2" stroke-linecap="round"/>
    <circle cx="44" cy="30" r="10" fill="#a9b0bb" ${O}/>
    <path d="M40 22c-7-2-12 4-10 10 2 4 7 4 10 1z" fill="#959ca7" ${O}/>
    <circle cx="47" cy="28" r="1.8" fill="#2a1a12"/>
    <path d="M50 36l5 2" stroke="#f6f1e6" stroke-width="3" stroke-linecap="round"/>
    ${shine('M14 34c2-3 5-5 9-6')}`,

  'golden-toad': `
    <ellipse cx="32" cy="54" rx="22" ry="5" fill="#d9a63c" ${O}/>
    <path d="M12 46c0-14 9-24 20-24s20 10 20 24c0 4-3 6-6 6H18c-3 0-6-2-6-6z" fill="#e8b64c" ${O}/>
    <circle cx="22" cy="24" r="6" fill="#e8b64c" ${O}/><circle cx="42" cy="24" r="6" fill="#e8b64c" ${O}/>
    <circle cx="22" cy="24" r="2.5" fill="#2a1a12"/><circle cx="42" cy="24" r="2.5" fill="#2a1a12"/>
    <path d="M22 36c6 4 14 4 20 0" fill="none" ${O}/>
    <circle cx="32" cy="38" r="5" fill="#f2c64e" ${T}/><rect x="30.5" y="36.5" width="3" height="3" fill="#7a4a1a"/>
    <g fill="#c48f2a"><circle cx="20" cy="44" r="1.6"/><circle cx="44" cy="44" r="1.6"/><circle cx="26" cy="47" r="1.3"/><circle cx="38" cy="47" r="1.3"/></g>
    ${shine('M17 38c1-5 3-8 6-10')}`,

  hamsa: `
    <path d="M18 34V16c0-2 1.5-3.5 3.5-3.5S25 14 25 16v12V10c0-2 1.5-3.5 3.5-3.5S32 8 32 10v18V10c0-2 1.5-3.5 3.5-3.5S39 8 39 10v18V16c0-2 1.5-3.5 3.5-3.5S46 14 46 16v18c0 12-6 22-14 22s-14-10-14-22z" fill="#3d7be0" ${O}/>
    <path d="M18 34l-6-6c-2-2 0-5 3-4l5 3M46 34l6-6c2-2 0-5-3-4l-5 3" fill="#3d7be0" ${O}/>
    <path d="M22 40c4-6 16-6 20 0-4 6-16 6-20 0z" fill="#fff" ${T}/>
    <circle cx="32" cy="40" r="4" fill="#5fb0f0" ${T}/><circle cx="32" cy="40" r="1.8" fill="#1d1d22"/>
    ${shine('M22 18v8')}`,

  'evil-eye': `
    <circle cx="32" cy="32" r="25" fill="#1f4fbf" ${O}/>
    <circle cx="32" cy="32" r="17" fill="#f7f7f7" ${T}/>
    <circle cx="32" cy="32" r="11" fill="#7ec8f2" ${T}/>
    <circle cx="32" cy="32" r="5.5" fill="#1d1d22"/>
    ${shine('M14 22a20 20 0 0 1 9-9')}<circle cx="29" cy="29" r="1.6" fill="#fff"/>`,

  'pot-of-gold': `
    <path d="M6 34a26 26 0 0 1 52 0" fill="none" stroke="#e0453a" stroke-width="3.5"/>
    <path d="M10 34a22 22 0 0 1 44 0" fill="none" stroke="#f2c64e" stroke-width="3.5"/>
    <path d="M14 34a18 18 0 0 1 36 0" fill="none" stroke="#46b35c" stroke-width="3.5"/>
    <path d="M18 34a14 14 0 0 1 28 0" fill="none" stroke="#3d7be0" stroke-width="3.5"/>
    <g fill="#f2c64e" ${T}><circle cx="24" cy="33" r="5"/><circle cx="33" cy="30" r="5"/><circle cx="41" cy="33" r="5"/><circle cx="29" cy="36" r="5"/><circle cx="37" cy="36" r="5"/></g>
    <path d="M12 38h40c0 10-8 18-20 18S12 48 12 38z" fill="#2c2c33" ${O}/>
    <rect x="10" y="36" width="44" height="5" rx="2.5" fill="#3d3d46" ${O}/>
    ${shine('M18 44c1 4 4 7 8 8')}`,

  'st-cajetan': `
    <path d="M32 4c-5 0-8 3-8 6" fill="none" stroke="#e8b64c" stroke-width="3"/><circle cx="32" cy="7" r="3.5" fill="none" ${T}/>
    <ellipse cx="32" cy="35" rx="19" ry="24" fill="#e8b64c" ${O}/>
    <ellipse cx="32" cy="35" rx="14" ry="19" fill="#f2c64e" ${T}/>
    <circle cx="32" cy="27" r="7" fill="none" stroke="#fff6c8" stroke-width="2"/>
    <circle cx="32" cy="28" r="4" fill="#c48f2a"/>
    <path d="M24 48c0-7 4-13 8-13s8 6 8 13" fill="#c48f2a"/>
    ${shine('M18 26c1-6 4-10 8-13')}`,

  'golden-horseshoe': `
    <path d="M14 12v18c0 11 8 20 18 20s18-9 18-20V12h-9v18c0 6-4 10-9 10s-9-4-9-10V12z" fill="#f2c64e" ${O}/>
    <rect x="12" y="8" width="11" height="6" rx="2" fill="#e0a832" ${T}/><rect x="41" y="8" width="11" height="6" rx="2" fill="#e0a832" ${T}/>
    <g fill="#8a5a14"><circle cx="18.5" cy="22" r="1.6"/><circle cx="19.5" cy="33" r="1.6"/><circle cx="26" cy="43" r="1.6"/>
    <circle cx="45.5" cy="22" r="1.6"/><circle cx="44.5" cy="33" r="1.6"/><circle cx="38" cy="43" r="1.6"/></g>
    <path d="M54 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM8 48l1.5 3.5 3.5 1.5-3.5 1.5L8 58l-1.5-3.5L3 53l3.5-1.5z" fill="#fff6c8" ${T}/>
    ${shine('M17 16v12')}`,

  'jade-dragon': `
    <circle cx="10" cy="14" r="6" fill="#f7f3ec" ${O}/>
    <circle cx="10" cy="14" r="9" fill="none" stroke="#f7f3ec" stroke-opacity=".35" stroke-width="2"/>
    ${[
      [12, 44, -60],
      [17, 33, -10],
      [27, 33, 30],
      [35, 41, 10],
      [45, 38, -40],
    ]
      .map(([x, y, r]) => `<path d="M-4 0l4-8 4 8z" fill="#2f8f70" ${T} transform="translate(${x} ${y}) rotate(${r})"/>`)
      .join('')}
    <path d="M10 56c-6-10 0-20 9-20 8 0 10 9 18 9 7 0 10-5 10-12" fill="none" stroke="#2a1a12" stroke-width="12" stroke-linecap="round"/>
    <path d="M10 56c-6-10 0-20 9-20 8 0 10 9 18 9 7 0 10-5 10-12" fill="none" stroke="#3fae8c" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M12 52c-3-6 0-11 4-12M24 39c3 1 6 4 10 5" fill="none" stroke="#9be8c8" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M18 46l-6 4M30 48l-2 7" ${O}/>
    <path d="M18 46l-6 4M30 48l-2 7" stroke="#3fae8c" stroke-width="2" stroke-linecap="round"/>
    <path d="M40 26c0-7 5-13 12-13 5 0 9 3 9 7 0 3-2 5-5 6l3 4c-3 1-6 0-8-2-3 3-8 2-11-2z" fill="#3fae8c" ${O}/>
    <path d="M47 14l-5-9 8 6M55 13l3-9 1 9" fill="#e8b64c" ${T}/>
    <path d="M61 22c3 0 3 4 1 5M58 27c2 3 0 6-3 6" fill="none" stroke="#e8b64c" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="52" cy="19" r="2" fill="#2a1a12"/><circle cx="52.6" cy="18.4" r=".6" fill="#fff"/>
    <path d="M17 12l-4-6M5 22l-3 4" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>`,
};

/** Rarity colours: the frame, glow and label for each tier. */
export const RARITY_COLOR: Record<string, string> = {
  common: '#a8b3ad',
  uncommon: '#5cc77a',
  rare: '#5cb6ff',
  epic: '#c27bff',
  legendary: '#ffbf3c',
};
