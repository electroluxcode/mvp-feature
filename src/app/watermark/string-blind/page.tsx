'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Image, Input, Select, Space, Upload, message } from 'antd'
import { EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { watermarkService } from '@/lib/watermark'
import type {
  LocalDifferenceWatermarkResult,
  WatermarkContrastMode,
} from '@/lib/watermark'
import type { UploadProps } from 'antd'

export default function StringBlindWatermarkPage() {
  const [watermarkText, setWatermarkText] = useState('user_zhangsan_10086')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [localDifferenceView, setLocalDifferenceView] = useState<LocalDifferenceWatermarkResult>(null)
  const [contrastMode, setContrastMode] = useState<WatermarkContrastMode>('local-difference')
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    return () => {
      watermarkService.destroy()
    }
  }, [])

  const handlecreateWatermark = () => {
    const text = watermarkText.trim()
    if (!text) {
      message.warning('请输入水印文本')
      return
    }

    watermarkService.mount({
      container: document.body,
      text,
      config: {}
    })

    message.success('水印已生成')
  }

  const handleExtractLocalDifference = async (file: File, mode = contrastMode) => {
    try {
      setExtracting(true)
      setUploadedFileName(file.name)
      setLocalDifferenceView(null)

      const view = await watermarkService.extractContrastViewByMode(file, mode)
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handlecreateWatermark}
            >
              生成水印
            </Button>
          </Space>

          <div style={{ color: '#666' }}>
            点击“生成水印”后，会通过 class 实例把透明重复水印挂载到全局页面。
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
              style={{ width: 220 }}
              options={[
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
                  style={{ maxWidth: '100%', height: 'auto', border: '1px solid #d9d9d9', borderRadius: 4 }}
                />
              </div>
            </Space>
          )}
        </Space>
      </Card>
    </div>
  )
}
