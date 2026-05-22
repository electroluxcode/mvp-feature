'use client'
/**
 * A single extracted watermark view for display.
 * The image URL can be used directly as an image source.
 */
export type WatermarkContrastView = {
  label: string
  dataUrl: string
}

/**
 * A single extraction can produce multiple views for comparing enhancement modes.
 */
export type WatermarkContrastResult = {
  viewDataUrl: string | null
  views: WatermarkContrastView[]
  viewDataUrls: string[]
  viewCount: number
}

export type LocalDifferenceWatermarkResult = WatermarkContrastView | null

export type WatermarkContrastMode = 'local-difference' | 'dark-ink' | 'bright-ink'

export type WatermarkImageSource = File | Blob | string

/**
 * Information reported when the observer detects watermark removal or attribute changes.
 */
export type TamperInfo =
  | { kind: 'removed' }
  | { kind: 'attr'; attr: string }

/**
 * Options used to mount an invisible page watermark.
 * The config is passed through to the canvas tile generator.
 */
export type InvisibleWatermarkOptions = {
  container: HTMLElement
  text: string
  id?: string
  config?: WatermarkDataUrlOptions
  // Called after the watermark is embedded.
  onEmbedded?: () => void
  // Called after the mutation observer is ready.
  onObserverReady?: () => void
  // Called after the watermark is tampered with.
  onTamper?: (info: TamperInfo) => void
}

/** Default watermark identifier mounted on the page. Can be overridden by options.id. */
export const WATERMARK_DOM_ID = 'magic-watermark'


/** Default watermark tile config. Very low opacity may not render on some iPhones. */
export const WATERMARK_CONFIG = {
  fontSize: 18,
  color: 'rgba(255, 0, 0, 0.016)',
  rotate: -12,
  gapX: 10,
  gapY: 60,
}

/** Default gain values for dark-ink, bright-ink, and local-difference enhancement. */
export const WATERMARK_CONTRAST_RANGE= {
  big: 100,
  middle: 80,
  small: 60,
}

export type WatermarkDataUrlOptions = Partial<typeof WATERMARK_CONFIG>

const MAX_SIDE = 1700
const BACKGROUND_RADII = [9, 18, 32]

/** Clamp any value into the 0-255 pixel channel range. */
function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** Create a canvas optimized for frequent pixel reads. */
function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D')
  return { canvas, ctx }
}

/** Convert RGBA image data into a single-channel grayscale array. */
function toGray(imageData: ImageData) {
  const { data } = imageData
  const gray = new Uint8Array(data.length / 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = clampByte(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }
  return gray
}

/**
 * Build an integral image so rectangular mean queries run in constant time.
 * Local background estimation calls this repeatedly, so we precompute it.
 */
function buildIntegral(values: Uint8Array, width: number, height: number) {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y++) {
    let rowSum = 0
    for (let x = 1; x <= width; x++) {
      rowSum += values[(y - 1) * width + (x - 1)]
      integral[y * (width + 1) + x] =
        integral[(y - 1) * (width + 1) + x] + rowSum
    }
  }
  return integral
}

/** Query the local background mean around a pixel within the given radius. */
function boxMean(
  integral: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
) {
  const x1 = Math.max(0, x - radius)
  const y1 = Math.max(0, y - radius)
  const x2 = Math.min(width - 1, x + radius)
  const y2 = Math.min(height - 1, y + radius)
  const stride = width + 1
  const sum =
    integral[(y2 + 1) * stride + (x2 + 1)] -
    integral[y1 * stride + (x2 + 1)] -
    integral[(y2 + 1) * stride + x1] +
    integral[y1 * stride + x1]
  return sum / ((x2 - x1 + 1) * (y2 - y1 + 1))
}

/** Read a percentile from a grayscale distribution for noise floor or stretch range estimation. */
function percentile(values: Uint8Array, ratio: number) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < values.length; i++) hist[values[i]]++

  const target = Math.max(
    0,
    Math.min(values.length - 1, Math.floor(values.length * ratio))
  )
  let seen = 0
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i]
    if (seen >= target) return i
  }
  return 255
}

/**
 * Dark-ink enhancement: extract pixels darker than their local background.
 * Best for gray or dark transparent watermarks on light backgrounds.
 */
function watermarkResidualFromImageData(
  imageData: ImageData,
  radius: number,
  gain: number
) {
  const { width, height, data } = imageData
  const gray = toGray(imageData)
  const integral = buildIntegral(gray, width, height)
  const residual = new Uint8Array(width * height)

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const x = j % width
    const y = Math.floor(j / width)
    const background = boxMean(integral, width, height, x, y, radius)
    const darkInk = Math.max(0, background - gray[j])
    const greenInk = Math.max(0, data[i + 1] - (data[i] + data[i + 2]) / 2)
    residual[j] = clampByte(Math.max(darkInk * gain, greenInk * 34))
  }

  const noiseFloor = percentile(residual, 0.68)
  const out = new ImageData(width, height)
  for (let i = 0, j = 0; j < residual.length; i += 4, j++) {
    const value = 255 - clampByte((residual[j] - noiseFloor) * 2.8)
    out.data[i] = out.data[i + 1] = out.data[i + 2] = value
    out.data[i + 3] = 255
  }
  return out
}

/**
 * Bright-ink enhancement: extract pixels brighter than their local background.
 * Best for light transparent watermarks on dark backgrounds.
 */
function brightWatermarkResidualFromImageData(
  imageData: ImageData,
  radius: number,
  gain: number
) {
  const { width, height } = imageData
  const gray = toGray(imageData)
  const integral = buildIntegral(gray, width, height)
  const residual = new Uint8Array(width * height)

  for (let j = 0; j < gray.length; j++) {
    const x = j % width
    const y = Math.floor(j / width)
    const background = boxMean(integral, width, height, x, y, radius)
    residual[j] = clampByte(Math.max(0, gray[j] - background) * gain)
  }

  const noiseFloor = percentile(residual, 0.68)
  const out = new ImageData(width, height)
  for (let i = 0, j = 0; j < residual.length; i += 4, j++) {
    const value = 255 - clampByte((residual[j] - noiseFloor) * 2.8)
    out.data[i] = out.data[i + 1] = out.data[i + 2] = value
    out.data[i + 3] = 255
  }
  return out
}

/**
 * Local difference enhancement: use the absolute difference from local background.
 * It responds to both dark and bright marks, but may also enhance complex textures.
 */
function adaptiveResidualFromImageData(
  imageData: ImageData,
  radius: number,
  gain: number
) {
  const { width, height } = imageData
  const gray = toGray(imageData)
  const integral = buildIntegral(gray, width, height)
  const residual = new Uint8Array(width * height)

  for (let j = 0; j < gray.length; j++) {
    const x = j % width
    const y = Math.floor(j / width)
    const background = boxMean(integral, width, height, x, y, radius)
    residual[j] = clampByte(Math.abs(gray[j] - background) * gain)
  }

  const low = percentile(residual, 0.72)
  const high = Math.max(low + 1, percentile(residual, 0.998))
  const out = new ImageData(width, height)

  for (let i = 0, j = 0; j < residual.length; i += 4, j++) {
    const ink = clampByte(((residual[j] - low) * 255) / (high - low))
    const value = 255 - ink
    out.data[i] = out.data[i + 1] = out.data[i + 2] = value
    out.data[i + 3] = 255
  }

  return out
}

/** Convert processed pixel data into a displayable image URL. */
function imageDataToDataUrl(imageData: ImageData) {
  const { canvas, ctx } = createCanvas(imageData.width, imageData.height)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function normalizeBase64DataUrl(value: string) {
  return value.startsWith('data:image/')
    ? value
    : `data:image/png;base64,${value}`
}

async function base64ToBlob(value: string) {
  const response = await fetch(normalizeBase64DataUrl(value))
  return response.blob()
}

async function createImageBitmapFromSource(source: WatermarkImageSource) {
  if (typeof source === 'string') {
    return createImageBitmap(await base64ToBlob(source))
  }

  return createImageBitmap(source)
}

function createModeContrastView(
  bitmap: ImageBitmap,
  mode: WatermarkContrastMode
): WatermarkContrastView {
  const maxSide = Math.max(bitmap.width, bitmap.height)
  const baseScale = Math.min(1, MAX_SIDE / Math.max(1, maxSide))
  const width = Math.max(1, Math.round(bitmap.width * baseScale))
  const height = Math.max(1, Math.round(bitmap.height * baseScale))
  const { ctx } = createCanvas(width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  if (mode === 'dark-ink') {
    return {
      label: '暗纹增强（大范围）',
      dataUrl: imageDataToDataUrl(
        watermarkResidualFromImageData(imageData, BACKGROUND_RADII[2], WATERMARK_CONTRAST_RANGE.big)
      ),
    }
  }

  if (mode === 'bright-ink') {
    return {
      label: '亮纹增强（大范围）',
      dataUrl: imageDataToDataUrl(
        brightWatermarkResidualFromImageData(imageData, BACKGROUND_RADII[2], WATERMARK_CONTRAST_RANGE.big)
      ),
    }
  }

  return {
    label: '明暗通用（局部差分）',
    dataUrl: imageDataToDataUrl(
      adaptiveResidualFromImageData(imageData, BACKGROUND_RADII[2], WATERMARK_CONTRAST_RANGE.small)
    ),
  }
}

/** Read an image source and produce all contrast-enhanced extraction views. */
async function extractHighContrastWatermarkFromFile(
  file: WatermarkImageSource
): Promise<WatermarkContrastResult> {
  const bitmap = await createImageBitmapFromSource(file)
  try {
    const views: WatermarkContrastView[] = [
      createModeContrastView(bitmap, 'local-difference'),
      createModeContrastView(bitmap, 'dark-ink'),
      createModeContrastView(bitmap, 'bright-ink'),
    ]
    const viewDataUrls = views.map((view) => view.dataUrl)
    return {
      viewDataUrl: views[0]?.dataUrl ?? null,
      views,
      viewDataUrls,
      viewCount: views.length,
    }
  } finally {
    bitmap.close()
  }
}

/** Read an image source and produce only the requested enhancement view. */
async function extractWatermarkContrastViewFromFile(
  file: WatermarkImageSource,
  mode: WatermarkContrastMode
): Promise<WatermarkContrastView> {
  const bitmap = await createImageBitmapFromSource(file)
  try {
    return createModeContrastView(bitmap, mode)
  } finally {
    bitmap.close()
  }
}

/**
 * Generate a repeatable invisible watermark tile from text.
 * The returned image URL can be used as a CSS background or preview image.
 */
function createWatermarkDataURL(
  text: string,
  config: WatermarkDataUrlOptions = {}
) {
  const {
    fontSize = WATERMARK_CONFIG.fontSize,
    color = WATERMARK_CONFIG.color,
    rotate = WATERMARK_CONFIG.rotate,
    gapX = WATERMARK_CONFIG.gapX,
    gapY = WATERMARK_CONFIG.gapY,
  } = config

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D')

  const font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`
  ctx.font = font
  const metrics = ctx.measureText(text)
  const textW = metrics.width
  const textH = fontSize * 1.2

  const canvasW = textW + gapX
  const canvasH = textH + gapY
  canvas.width = canvasW * 2
  canvas.height = canvasH * 2

  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'

  const cx1 = canvasW / 2
  const cy1 = canvasH / 2
  ctx.save()
  ctx.translate(cx1, cy1)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.fillText(text, -textW / 2, 0)
  ctx.restore()

  const cx2 = canvasW / 2 + canvasW
  const cy2 = canvasH / 2 + canvasH
  ctx.save()
  ctx.translate(cx2, cy2)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.fillText(text, -textW / 2, 0)
  ctx.restore()

  return canvas.toDataURL('image/png')
}

/** Create the fullscreen invisible watermark layer that is mounted onto the page. */
function createWatermarkElement(
  text: string,
  wmId: string,
  config: WatermarkDataUrlOptions = {}
) {
  const el = document.createElement('div')
  el.setAttribute('data-wm-id', wmId)
  const dataURL = createWatermarkDataURL(text, config)
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    width: '100vw',
    height: '100dvh',
    backgroundImage: `url(${dataURL})`,
    backgroundRepeat: 'repeat',
    pointerEvents: 'none',
    zIndex: '9999',
    opacity: '1',
    visibility: 'visible',
    display: 'block',
  })
  return el
}

/** Unified class entry exposed by the watermark module. */
export class WatermarkService {
  private wmId = WATERMARK_DOM_ID
  private observer: MutationObserver | null = null
  private options: InvisibleWatermarkOptions | null = null

  /** Generate a watermark tile image URL. */
  createDataUrl(text: string, options: WatermarkDataUrlOptions = {}) {
    return createWatermarkDataURL(text, options)
  }

  /** Create a watermark page element. Most business code should call mount instead. */
  createElement(text: string, wmId: string, config: WatermarkDataUrlOptions = {}) {
    return createWatermarkElement(text, wmId, config)
  }

  /** Mount the watermark and start tamper observation. */
  mount(options: InvisibleWatermarkOptions) {
    this.options = options
    this.wmId = options.id ?? WATERMARK_DOM_ID
    this.mountWatermark()
    this.setupObserver()
    options.onEmbedded?.()
  }

  /** Update the watermark text and optionally override the generation config. */
  updateText(text: string, config = this.options?.config) {
    if (!this.options) return
    this.options = { ...this.options, text, config }
    this.mountWatermark()
  }

  /** Remove the watermark and stop observing. */
  destroy() {
    this.observer?.disconnect()
    this.observer = null
    this.removeWatermark()
    this.options = null
  }

  /** Rebuild the watermark node so this service keeps only one managed node. */
  private mountWatermark() {
    if (!this.options) return
    const { container, text, config } = this.options
    const existing = container.querySelector(`[data-wm-id="${this.wmId}"]`)
    if (existing) existing.remove()

    const wmEl = createWatermarkElement(text, this.wmId, config)
    container.appendChild(wmEl)
    return wmEl
  }

  /** Observe watermark removal or key attribute changes and restore it automatically. */
  private setupObserver() {
    if (!this.options) return
    const { container } = this.options
    this.observer?.disconnect()
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const isWatermarkRemoved = Array.from(mutation.removedNodes).some((node) => {
            if (
              node.nodeType === 1 &&
              (node as Element).getAttribute('data-wm-id') === this.wmId
            ) {
              this.options?.onTamper?.({ kind: 'removed' })
              setTimeout(() => this.mountWatermark(), 0)
              return true
            }
            return false
          })
          if (isWatermarkRemoved) return
        }
        if (mutation.type === 'attributes') {
          const target = mutation.target as Node
          if (target.nodeType !== Node.ELEMENT_NODE) continue
          const el = target as Element
          if (el.getAttribute('data-wm-id') === this.wmId) {
            const attr = mutation.attributeName
            if (attr === 'style' || attr === 'class') {
              this.options?.onTamper?.({
                kind: 'attr',
                attr,
              })
              el.remove()
              setTimeout(() => this.mountWatermark(), 0)
              return
            }
          }
        }
      }
    })

    observer.observe(container, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['style', 'class'],
    })

    this.observer = observer
    this.options.onObserverReady?.()
  }

  /** Remove the watermark node managed by this service. */
  private removeWatermark() {
    this.options?.container
      .querySelector(`[data-wm-id="${this.wmId}"]`)
      ?.remove()
  }

  /** Return all enhancement views, useful for debugging or batch display. */
  async extractContrastViews(file: WatermarkImageSource): Promise<WatermarkContrastResult> {
    return extractHighContrastWatermarkFromFile(file)
  }

  /** Extract the default local-difference view. */
  async extractLocalDifferenceView(file: WatermarkImageSource): Promise<LocalDifferenceWatermarkResult> {
    return extractWatermarkContrastViewFromFile(file, 'local-difference')
  }

  /** Return the enhancement view matching the selected page mode. */
  async extractContrastViewByMode(
    file: WatermarkImageSource,
    mode: WatermarkContrastMode
  ): Promise<LocalDifferenceWatermarkResult> {
    return extractWatermarkContrastViewFromFile(file, mode)
  }
}

const watermarkService = new WatermarkService()
if (typeof window !== 'undefined') {
  (window as any).watermarkService = watermarkService
}
export {
  watermarkService,
}
