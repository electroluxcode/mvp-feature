'use client'

import { useState } from 'react'
import { Card, Button, Input, Space, Upload, message, Image, Divider } from 'antd'
import { UploadOutlined, PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import { BlindWatermark } from 'watermark-js-plus'
import type { UploadFile } from 'antd'

export default function BlindWatermarkPage() {
  const [watermarkText, setWatermarkText] = useState('hello my watermark')
  const [watermarkInstance, setWatermarkInstance] = useState<BlindWatermark | null>(null)
  const [decodedImage, setDecodedImage] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadFile | null>(null)

  // 添加隐藏水印
  const handleAddWatermark = () => {
    if (!watermarkText.trim()) {
      message.warning('请输入水印内容')
      return
    }

    // 如果已有水印实例，先销毁
    if (watermarkInstance) {
      watermarkInstance.destroy()
    }

    const watermark = new BlindWatermark({
      content: watermarkText,
      width: 200,
      height: 200,
      onSuccess: () => {
        message.success('水印添加成功')
      },
      onFail: (err) => {
        message.error('水印添加失败: ' + err)
      }
    })

    watermark.create()
    setWatermarkInstance(watermark)
  }

  // 删除水印
  const handleRemoveWatermark = () => {
    if (watermarkInstance) {
      watermarkInstance.destroy()
      setWatermarkInstance(null)
      message.success('水印已删除')
    } else {
      message.warning('当前没有活动的水印')
    }
  }

  // 解密水印
  const handleDecodeWatermark = () => {
    if (!uploadedFile) {
      message.warning('请先上传图片')
      return
    }

    const file = uploadedFile.originFileObj
    if (!file) {
      message.warning('文件读取失败')
      return
    }

    // 读取文件为 URL
    const reader = new FileReader()
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string

      BlindWatermark.decode({
        compositeOperation: 'overlay',
        compositeTimes: 4,
        url: imageUrl,
        onSuccess: (imageBase64) => {
          setDecodedImage(imageBase64)
          message.success('水印解密成功')
        },
        onFail: (err) => {
          message.error('水印解密失败: ' + err)
        }
      })
    }
    reader.readAsDataURL(file)
  }

  // 处理文件上传
  const handleUploadChange = (info: any) => {
    if (info.file.status === 'done' || info.file.originFileObj) {
      setUploadedFile(info.file)
      message.success('图片上传成功')
    }
  }

  // 自定义上传（不上传到服务器，只读取本地文件）
  const customRequest = ({ onSuccess }: any) => {
    setTimeout(() => {
      onSuccess('ok')
    }, 0)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card title="隐藏水印测试" style={{ marginBottom: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 添加水印区域 */}
          <div>
            <h3>1. 添加隐藏水印</h3>
            <Space>
              <Input
                placeholder="请输入水印内容"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                style={{ width: '300px' }}
                onPressEnter={handleAddWatermark}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddWatermark}
              >
                添加水印
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleRemoveWatermark}
                disabled={!watermarkInstance}
              >
                删除水印
              </Button>
            </Space>
            <div style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
              <p>提示：添加水印后，水印会隐藏在当前页面中，肉眼几乎不可见。</p>
            </div>
          </div>

          <Divider />

          {/* 解密水印区域 */}
          <div>
            <h3>2. 解密隐藏水印</h3>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  onChange={handleUploadChange}
                  customRequest={customRequest}
                >
                  <Button icon={<UploadOutlined />}>上传图片</Button>
                </Upload>
                {uploadedFile && (
                  <span style={{ color: '#666' }}>
                    已选择: {uploadedFile.name}
                  </span>
                )}
                <Button
                  type="primary"
                  icon={<EyeOutlined />}
                  onClick={handleDecodeWatermark}
                  disabled={!uploadedFile}
                >
                  解密水印
                </Button>
              </Space>

              {decodedImage && (
                <div>
                  <h4>解密结果：</h4>
                  <Image
                    src={decodedImage}
                    alt="解密后的水印"
                    style={{ maxWidth: '100%', border: '1px solid #d9d9d9', borderRadius: '4px' }}
                  />
                </div>
              )}
            </Space>
            <div style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
              <p>提示：上传包含隐藏水印的图片，点击解密按钮可以提取隐藏的水印信息。</p>
            </div>
          </div>
        </Space>
      </Card>

      {/* 说明文档 */}
      <Card title="使用说明">
        <div style={{ color: '#666', lineHeight: '1.8' }}>
          <h4>功能说明：</h4>
          <ul>
            <li><strong>添加水印：</strong>在输入框中输入水印内容，点击"添加水印"按钮，水印会被隐藏添加到当前页面中。</li>
            <li><strong>删除水印：</strong>点击"删除水印"按钮可以移除当前页面的隐藏水印。</li>
            <li><strong>解密水印：</strong>上传包含隐藏水印的图片文件，点击"解密水印"按钮可以提取并显示隐藏的水印信息。</li>
          </ul>
          <h4 style={{ marginTop: '16px' }}>注意事项：</h4>
          <ul>
            <li>隐藏水印对图片质量有一定要求，建议使用高质量的图片。</li>
            <li>解密时可能需要调整参数（compositeOperation 和 compositeTimes）以获得最佳效果。</li>
            <li>水印内容可以是文本，也可以是多行文本、图片或富文本。</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

