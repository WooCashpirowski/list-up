const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
const MAX_EDGE = 2048

export async function normalizeChatPhoto(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Photo exceeds 20 MB')
  const heic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)
  let source: Blob = file
  if (heic) {
    const { default: convert } = await import('heic2any')
    const converted = await convert({ blob: file, toType: 'image/jpeg' })
    source = Array.isArray(converted) ? converted[0] : converted
  } else if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Unsupported photo format')
  }

  const sourceUrl = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare photo')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.88, 0.76, 0.64, 0.52]) {
      const output = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (output && output.size <= MAX_OUTPUT_BYTES) return output
    }
    throw new Error('Prepared photo exceeds 5 MB')
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
