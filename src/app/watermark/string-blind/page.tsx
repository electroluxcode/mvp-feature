'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Collapse,
  Image,
  Input,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
  Upload,
  message,
} from 'antd'
import { EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import {
  WATERMARK_CONFIG,
  WATERMARK_EXTRACT_CONFIG,
  blendWatermarkColors,
  watermarkService,
} from '@/lib/watermark'
import type {
  LocalDifferenceWatermarkResult,
  WatermarkContrastMode,
  WatermarkExtractOptions,
} from '@/lib/watermark'
import type { UploadProps } from 'antd'

export default function StringBlindWatermarkPage() {
  const [watermarkText, setWatermarkText] = useState('user_zhangsan_10086')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [localDifferenceView, setLocalDifferenceView] =
    useState<LocalDifferenceWatermarkResult>(null)
  const [contrastMode, setContrastMode] = useState<WatermarkContrastMode>('reverse-layer')
  const [extracting, setExtracting] = useState(false)

  const [useBackground, setUseBackground] = useState(WATERMARK_CONFIG.useBackground)
  const [backgroundColor, setBackgroundColor] = useState(WATERMARK_CONFIG.backgroundColor)
  const [textColor, setTextColor] = useState(WATERMARK_CONFIG.textColor)

  const suggestedOverlayColor = useMemo(
    () => blendWatermarkColors(textColor, backgroundColor),
    [textColor, backgroundColor]
  )
  const [overlayColor, setOverlayColor] = useState(suggestedOverlayColor)

  const [extractTune, setExtractTune] = useState<WatermarkExtractOptions>({
    ...WATERMARK_EXTRACT_CONFIG,
  })

  useEffect(() => {
    setOverlayColor(suggestedOverlayColor)
  }, [suggestedOverlayColor])

  useEffect(() => {
    return () => {
      watermarkService.destroy()
    }
  }, [])

  const buildWatermarkConfig = () => ({
    useBackground,
    backgroundColor,
    textColor,
  })

  const buildExtractOptions = (
    colorOverride?: Partial<Pick<WatermarkExtractOptions, 'backgroundColor' | 'textColor' | 'overlayColor'>>
  ): WatermarkExtractOptions => ({
    useBackground,
    backgroundColor,
    textColor,
    overlayColor,
    ...WATERMARK_EXTRACT_CONFIG,
    ...extractTune,
    ...colorOverride,
  })

  const handlecreateWatermark = () => {
    const text = watermarkText.trim()
    if (!text) {
      message.warning('请输入水印文本')
      return
    }

    watermarkService.mount({
      container: document.body,
      text,
      config: buildWatermarkConfig(),
    })

    message.success('水印已生成')
  }

  const handleExtractLocalDifference = async (
    file: File,
    mode = contrastMode,
    optionsOverride?: WatermarkExtractOptions
  ) => {
    try {
      setExtracting(true)
      setUploadedFileName(file.name)
      setLocalDifferenceView(null)

      const needsColorConfig = mode === 'reverse-layer'
      const view = await watermarkService.extractContrastViewByMode(
        file,
        mode,
        needsColorConfig ? (optionsOverride ?? buildExtractOptions()) : undefined
      )
      setLocalDifferenceView(view)

      if (view) {
        message.success('差分图片已生成')
      } else {
        message.warning('没有生成对应的差分视图')
      }
    } catch (err) {
      message.error('局部差分提取失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtracting(false)
    }
  }

  const reExtractIfNeeded = (optionsOverride?: WatermarkExtractOptions) => {
    if (selectedFile && contrastMode === 'reverse-layer') {
      void handleExtractLocalDifference(selectedFile, contrastMode, optionsOverride)
    }
  }

  const patchExtractColor = (
    patch: Partial<Pick<WatermarkExtractOptions, 'backgroundColor' | 'textColor' | 'overlayColor'>>
  ) => {
    if (patch.backgroundColor !== undefined) setBackgroundColor(patch.backgroundColor)
    if (patch.textColor !== undefined) setTextColor(patch.textColor)
    if (patch.overlayColor !== undefined) setOverlayColor(patch.overlayColor)

    reExtractIfNeeded(
      buildExtractOptions({
        backgroundColor: patch.backgroundColor ?? backgroundColor,
        textColor: patch.textColor ?? textColor,
        overlayColor: patch.overlayColor ?? overlayColor,
      })
    )
  }

  const patchExtractTune = (patch: WatermarkExtractOptions) => {
    const next = { ...extractTune, ...patch }
    setExtractTune(next)
    if (selectedFile && contrastMode === 'reverse-layer') {
      void handleExtractLocalDifference(selectedFile, contrastMode, {
        ...buildExtractOptions(),
        ...next,
      })
    }
  }

  const uploadProps: UploadProps = {
    accept: 'image/*',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      setSelectedFile(file)
      void handleExtractLocalDifference(file)
      return false
    },
  }

  const handleContrastModeChange = (mode: WatermarkContrastMode) => {
    setContrastMode(mode)
    if (selectedFile) {
      void handleExtractLocalDifference(selectedFile, mode)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card title="字符串透明水印" style={{ marginBottom: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space wrap>
            <Input
              addonBefore="水印文本"
              value={watermarkText}
              onChange={(event) => setWatermarkText(event.target.value)}
              onPressEnter={handlecreateWatermark}
              style={{ width: '360px' }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handlecreateWatermark}>
              生成水印
            </Button>
          </Space>

          <Space wrap align="center">
            <Space>
              <span>文字底衬</span>
              <Switch checked={useBackground} onChange={setUseBackground} />
            </Space>
            <Input
              addonBefore="背景颜色"
              value={backgroundColor}
              onChange={(event) => patchExtractColor({ backgroundColor: event.target.value })}
              disabled={!useBackground}
              placeholder="rgba(255, 0, 0, 0.01)"
              style={{ width: 320 }}
            />
            <Input
              addonBefore="文字颜色"
              value={textColor}
              onChange={(event) => patchExtractColor({ textColor: event.target.value })}
              placeholder="rgba(0, 0, 0, 0.018)"
              style={{ width: 320 }}
            />
          </Space>

          <div style={{ color: '#666' }}>
            生成侧：圆角底衬（背景颜色）+ 文字颜色，底衬默认开启。解析侧颜色须与生成一致；叠加颜色默认为文字叠在底衬上的合成色，可手调。
          </div>
        </Space>
      </Card>

      <Card
        title="对比度水印解析"
        styles={{
          body: {
            maxHeight: 'calc(100vh - 260px)',
            minWidth: 0,
            overflowX: 'hidden',
            overflowY: 'auto',
          },
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', minWidth: 0 }}>
          <Space wrap>
            <Select<WatermarkContrastMode>
              value={contrastMode}
              onChange={handleContrastModeChange}
              style={{ width: 260 }}
              options={[
                { value: 'reverse-layer', label: '配置通道提取（推荐）' },
                { value: 'local-difference', label: '明暗通用（局部差分）' },
                { value: 'dark-ink', label: '暗纹增强（大范围）' },
                { value: 'bright-ink', label: '亮纹增强（大范围）' },
              ]}
            />
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={extracting}>
                上传带水印图片
              </Button>
            </Upload>
            {uploadedFileName && (
              <span style={{ color: '#666' }}>已选择: {uploadedFileName}</span>
            )}
          </Space>

          {contrastMode === 'reverse-layer' && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Typography.Text type="secondary">解析颜色（与生成侧保持一致，可微调）</Typography.Text>
              <Space wrap>
                <Input
                  addonBefore="背景"
                  value={backgroundColor}
                  onChange={(event) => patchExtractColor({ backgroundColor: event.target.value })}
                  disabled={!useBackground}
                  style={{ width: 300 }}
                />
                <Input
                  addonBefore="文字颜色"
                  value={textColor}
                  onChange={(event) => patchExtractColor({ textColor: event.target.value })}
                  style={{ width: 300 }}
                />
                <Input
                  addonBefore="叠加颜色"
                  value={overlayColor}
                  onChange={(event) => patchExtractColor({ overlayColor: event.target.value })}
                  style={{ width: 300 }}
                />
                <Button
                  onClick={() => {
                    setOverlayColor(suggestedOverlayColor)
                    reExtractIfNeeded(
                      buildExtractOptions({ overlayColor: suggestedOverlayColor })
                    )
                  }}
                >
                  重置叠加色
                </Button>
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                建议叠加色：{suggestedOverlayColor}（文字 × 底衬合成，解析时作为第三路通道方向）
              </Typography.Text>

              <Collapse
                size="small"
                items={[
                  {
                    key: 'tune',
                    label: '解析灵敏度',
                    children: (
                      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <div>
                          <div>通道增益 gain</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            放大 RGB 通道差分（变暗/偏色）。宜 1～6；过大易饱和，淡纹发糊发白。
                          </Typography.Text>
                          <Slider
                            min={1}
                            max={12}
                            step={0.5}
                            value={extractTune.gain}
                            onChange={(gain) => patchExtractTune({ gain })}
                          />
                        </div>
                        <div>
                          <div>背景半径 bgRadius</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            估计局部背景的邻域半径（px）。越小越保留细字，越大淡纹越易被背景均值稀释。
                          </Typography.Text>
                          <Slider
                            min={12}
                            max={40}
                            step={2}
                            value={extractTune.bgRadius}
                            onChange={(bgRadius) => patchExtractTune({ bgRadius })}
                          />
                        </div>
                        <div>
                          <div>噪声底分位 noisePercentile</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            全图残差分位数作噪声底，低于它的信号被压暗。越低越显淡纹，背景噪点也越多。
                          </Typography.Text>
                          <Slider
                            min={0.3}
                            max={0.75}
                            step={0.02}
                            value={extractTune.noisePercentile}
                            onChange={(noisePercentile) => patchExtractTune({ noisePercentile })}
                          />
                        </div>
                        <div>
                          <div>弱信号提升 signalGamma</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            归一化幂次：&lt;1 抬高弱信号、压强纹理。越小淡纹越显，噪点也越明显。
                          </Typography.Text>
                          <Slider
                            min={0.25}
                            max={1}
                            step={0.02}
                            value={extractTune.signalGamma}
                            onChange={(signalGamma) => patchExtractTune({ signalGamma })}
                          />
                        </div>
                      </Space>
                    ),
                  },
                ]}
              />
            </Space>
          )}

          {localDifferenceView && (
            <Space direction="vertical" size="small" style={{ width: '100%', minWidth: 0 }}>
              <span style={{ color: '#666' }}>
                <EyeOutlined /> {localDifferenceView.label}
              </span>
              <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Image
                  src={localDifferenceView.dataUrl}
                  alt={localDifferenceView.label}
                  width="100%"
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    border: '1px solid #d9d9d9',
                    borderRadius: 4,
                  }}
                />
              </div>
            </Space>
          )}
        </Space>
      </Card>
    </div>
  )
}
