'use client'

import Tesseract from 'tesseract.js'

type OcrWord = {
  text?: string
  confidence?: number
}

type OcrPageData = {
  text: string
  confidence: number
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: OcrWord[]
      }>
    }>
  }> | null
}

export type FrequentString = {
  text: string
  count: number
  confidence?: number
}

export type RecognizeTesseractImageOptions = {
  imageFile: File
  language: string
  rotationDegrees?: number
  frequentStringLimit?: number
  logger?: (progress: Tesseract.LoggerMessage) => void
}

export type RecognizeTesseractImageResult = {
  text: string
  confidence: number
  frequentStrings: FrequentString[]
  correctedImageDataUrl: string | null
  rawResult: Tesseract.RecognizeResult
}

export class TesseractOcr {
  async recognizeImage({
    imageFile,
    language,
    rotationDegrees = 0,
    frequentStringLimit = 5,
    logger,
  }: RecognizeTesseractImageOptions): Promise<RecognizeTesseractImageResult> {
    const normalizedRotationDegrees = Number(rotationDegrees) || 0
    const correctedCanvas = normalizedRotationDegrees === 0
      ? null
      : await this.createRotationCorrectedImage(imageFile, normalizedRotationDegrees)
    const recognizeImage = correctedCanvas ?? imageFile
    const rawResult = await Tesseract.recognize(recognizeImage, language, { logger })

    return {
      text: rawResult.data.text,
      confidence: rawResult.data.confidence,
      frequentStrings: this.getFrequentStrings(rawResult.data, frequentStringLimit),
      correctedImageDataUrl: correctedCanvas?.toDataURL('image/png') ?? null,
      rawResult,
    }
  }

  getFrequentStrings(data: OcrPageData, limit = 5): FrequentString[] {
    const words = data.blocks
      ?.flatMap((block) => block.paragraphs ?? [])
      .flatMap((paragraph) => paragraph.lines ?? [])
      .flatMap((line) => line.words ?? [])
      .filter((word) => this.normalizeRecognizedString(word.text ?? ''))

    const candidates = words?.length
      ? words
      : data.text
        .split(/\s+/)
        .filter(Boolean)
        .map((text) => ({ text, confidence: data.confidence }))

    const stats = new Map<string, { count: number; confidenceTotal: number; confidenceCount: number }>()

    candidates.forEach((word) => {
      const text = this.normalizeRecognizedString(word.text ?? '')
      if (!text) return

      const current = stats.get(text) ?? {
        count: 0,
        confidenceTotal: 0,
        confidenceCount: 0,
      }

      current.count += 1

      if (typeof word.confidence === 'number') {
        current.confidenceTotal += word.confidence
        current.confidenceCount += 1
      }

      stats.set(text, current)
    })

    return Array.from(stats.entries())
      .map(([text, stat]) => ({
        text,
        count: stat.count,
        confidence: stat.confidenceCount > 0
          ? Number((stat.confidenceTotal / stat.confidenceCount).toFixed(2))
          : undefined,
      }))
      .sort((a, b) => b.count - a.count || (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, limit)
  }

  private normalizeRecognizedString(text: string) {
    return text.trim()
  }

  private async createRotationCorrectedImage(file: File, rotationDegrees: number) {
    const imageUrl = URL.createObjectURL(file)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = imageUrl
      })

      const radians = rotationDegrees * Math.PI / 180
      const sin = Math.abs(Math.sin(radians))
      const cos = Math.abs(Math.cos(radians))
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(image.width * cos + image.height * sin)
      canvas.height = Math.ceil(image.width * sin + image.height * cos)

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Canvas context 创建失败')
      }

      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(radians)
      ctx.drawImage(image, -image.width / 2, -image.height / 2)

      return canvas
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  }
}

export const tesseractOcr = new TesseractOcr()
