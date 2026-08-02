import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const svg = readFileSync(join(publicDir, 'favicon.svg'))
const background = '#0f172a'

async function writeIcon(size, filename) {
  await sharp(svg)
    .resize(size, size, { fit: 'contain', background })
    .png()
    .toFile(join(publicDir, filename))
}

async function writeBadge() {
  const size = 72
  const svgBadge = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r="28" fill="#ffffff"/>
      <rect x="24" y="26" width="24" height="20" rx="5" fill="#0f172a"/>
      <circle cx="30" cy="36" r="2.5" fill="#ffffff"/>
      <circle cx="42" cy="36" r="2.5" fill="#ffffff"/>
    </svg>
  `
  await sharp(Buffer.from(svgBadge)).png().toFile(join(publicDir, 'pwa-badge-72.png'))
}

async function writeNotifIcon(filename, fill, glyph) {
  const size = 192
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 192 192">
      <rect width="192" height="192" rx="40" fill="${fill}"/>
      ${glyph}
    </svg>
  `
  await sharp(Buffer.from(svgIcon)).png().toFile(join(publicDir, filename))
}

await writeIcon(192, 'pwa-192.png')
await writeIcon(512, 'pwa-512.png')
await writeBadge()

await writeNotifIcon(
  'notif-habits.png',
  '#059669',
  `<path d="M56 104 L84 132 L136 72" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
)

await writeNotifIcon(
  'notif-expenses.png',
  '#D97706',
  `<text x="96" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#ffffff">₱</text>`,
)

await writeNotifIcon(
  'notif-tasks.png',
  '#2563EB',
  `<rect x="58" y="52" width="76" height="88" rx="10" fill="none" stroke="#ffffff" stroke-width="10"/>
   <path d="M76 78 H116 M76 100 H116 M76 122 H104" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>`,
)

console.log(
  'Generated public/pwa-192.png, pwa-512.png, pwa-badge-72.png, notif-habits.png, notif-expenses.png, notif-tasks.png',
)
