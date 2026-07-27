import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

// QR rendu en SVG : net à toutes les tailles, et scannable depuis un écran de
// téléphone tenu par quelqu'un d'autre — c'est le cas d'usage réel.

export function QrCode({ valeur, taille = 176 }: { valeur: string; taille?: number }) {
  const chemin = useMemo(() => {
    // Correction 'M' : assez robuste pour un écran un peu sale, sans gonfler
    // la densité au point de gêner la lecture à distance.
    const qr = qrcode(0, 'M')
    qr.addData(valeur)
    qr.make()
    const modules = qr.getModuleCount()
    let d = ''
    for (let ligne = 0; ligne < modules; ligne++) {
      for (let col = 0; col < modules; col++) {
        if (qr.isDark(ligne, col)) d += `M${col} ${ligne}h1v1h-1z`
      }
    }
    return { d, modules }
  }, [valeur])

  const marge = 2
  const cote = chemin.modules + marge * 2

  return (
    <svg
      viewBox={`0 0 ${cote} ${cote}`}
      width={taille}
      height={taille}
      role="img"
      aria-label={`QR code vers ${valeur}`}
      className="rounded-xl bg-white p-1 shadow-lg"
      shapeRendering="crispEdges"
    >
      <rect width={cote} height={cote} fill="#ffffff" />
      <g transform={`translate(${marge} ${marge})`} fill="#0d0716">
        <path d={chemin.d} />
      </g>
    </svg>
  )
}
