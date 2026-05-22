'use client'

import { useState } from 'react'
import { Button, Card, Image, Input, InputNumber, Space, Upload, message } from 'antd'
import { UploadOutlined, ScanOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { tesseractOcr } from '@/lib/ocr/tesseract'
import type { FrequentString } from '@/lib/ocr/tesseract'

export default function TesseractTestPage() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [correctedPreview, setCorrectedPreview] = useState<string | null>(null)
  const [language, setLanguage] = useState('eng+chi_sim')
  const [rotationDegrees, setRotationDegrees] = useState(12)
  const [recognizing, setRecognizing] = useState(false)
  const [recognizedText, setRecognizedText] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [frequentStrings, setFrequentStrings] = useState<FrequentString[]>([])

  const uploadProps: UploadProps = {
    accept: 'image/*',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
      if (correctedPreview) {
        URL.revokeObjectURL(correctedPreview)
      }

      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
      setCorrectedPreview(null)
      setRecognizedText('')
      setConfidence(null)
      setFrequentStrings([])
      return false
    },
  }

  const handleRecognize = async () => {
    if (!imageFile) {
      message.warning('请先上传图片')
      return
    }

    try {
      setRecognizing(true)
      setRecognizedText('')
      setConfidence(null)
      setFrequentStrings([])
      if (correctedPreview) {
        URL.revokeObjectURL(correctedPreview)
        setCorrectedPreview(null)
      }

      const normalizedRotationDegrees = Number(rotationDegrees) || 0
      console.log('[tesseract.js] start recognize', {
        fileName: imageFile.name,
        language,
        rotationDegrees: normalizedRotationDegrees,
      })

      const result = await tesseractOcr.recognizeImage({
        imageFile,
        language,
        rotationDegrees: normalizedRotationDegrees,
        logger: (progress) => {
          console.log('[tesseract.js] progress', progress)
        },
      })

      if (result.correctedImageDataUrl) {
        setCorrectedPreview(result.correctedImageDataUrl)
      }

      console.log('[tesseract.js] result', result.rawResult)
      console.log('[tesseract.js] text', result.text)
      console.log('[tesseract.js] confidence', result.confidence)
      console.log('[tesseract.js] frequent strings', result.frequentStrings)
      setRecognizedText(result.text)
      setConfidence(result.confidence)
      setFrequentStrings(result.frequentStrings)
      message.success('识别完成，结果已打印到控制台')
    } catch (err) {
      console.error('[tesseract.js] recognize failed', err)
      message.error('识别失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card
        title="Tesseract.js OCR 测试"
        styles={{
          body: {
            maxHeight: 'calc(100vh - 220px)',
            minWidth: 0,
            overflowX: 'hidden',
            overflowY: 'auto',
          },
        }}
        style={{ marginBottom: '24px', minWidth: 0 }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', minWidth: 0 }}>
          <Space wrap>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>上传图片</Button>
            </Upload>
            <Input
              addonBefore="语言"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ width: '260px' }}
              placeholder="例如 eng 或 chi_sim"
            />
            <InputNumber
              addonBefore="旋转矫正"
              addonAfter="°"
              value={rotationDegrees}
              onChange={(value) => setRotationDegrees(value ?? 0)}
              min={-45}
              max={45}
              step={1}
              style={{ width: '180px' }}
            />
            <Button
              type="primary"
              icon={<ScanOutlined />}
              onClick={handleRecognize}
              loading={recognizing}
              disabled={!imageFile}
            >
              开始识别
            </Button>
          </Space>

          {imageFile && (
            <span style={{ color: '#666' }}>
              已选择: {imageFile.name}
            </span>
          )}

          {imagePreview && (
            <Space direction="vertical" size="small" style={{ width: '100%', maxWidth: '100%' }}>
              <span style={{ color: '#666' }}>原图</span>
              <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Image
                  src={imagePreview}
                  alt="待识别图片"
                  width="100%"
                  style={{ maxWidth: '100%', height: 'auto', border: '1px solid #d9d9d9', borderRadius: '4px' }}
                />
              </div>
            </Space>
          )}

          {correctedPreview && (
            <Space direction="vertical" size="small" style={{ width: '100%', maxWidth: '100%' }}>
              <span style={{ color: '#666' }}>旋转矫正后用于识别的图片</span>
              <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Image
                  src={correctedPreview}
                  alt="旋转矫正后的图片"
                  width="100%"
                  style={{ maxWidth: '100%', height: 'auto', border: '1px solid #d9d9d9', borderRadius: '4px' }}
                />
              </div>
            </Space>
          )}

          {confidence !== null && (
            <Space direction="vertical" size="small">
              <span style={{ color: '#666' }}>
                整体置信度: {confidence.toFixed(2)}
              </span>
              {frequentStrings.length > 0 && (
                <div style={{ color: '#666' }}>
                  <div>出现最多的字符串：</div>
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    {frequentStrings.map((item) => (
                      <li key={item.text}>
                        <code>{item.text}</code>
                        {' '}出现 {item.count} 次
                        {typeof item.confidence === 'number' && `，平均置信度 ${item.confidence.toFixed(2)}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Space>
          )}

          {recognizedText && (
            <Input.TextArea
              value={recognizedText}
              autoSize={{ minRows: 4 }}
              readOnly
            />
          )}
        </Space>
      </Card>

    </div>
  )
}
