## Watermark

当前水印能力统一从 `src/lib/watermark/index.ts` 导出：

```ts
import { watermarkService } from '@/lib/watermark'
```

### mount

把水印挂到指定容器上。默认水印标识是 `magic-watermark`，也可以传 `id` 自定义。

```ts
watermarkService.mount({
  container: document.body,
  text: 'user_zhangsan_10086',
  id: 'magic-watermark',
  config: {
    fontSize: 18,
    color: 'rgba(255, 0, 0, 0.016)',
    rotate: -12,
    gapX: 10,
    gapY: 60,
  },
  onTamper: (info) => {
    console.log('watermark tampered', info)
  },
})

watermarkService.updateText('new_text')
watermarkService.destroy()
```

`mount()` 会插入一个重复背景水印，并监听水印节点被删除或 `style/class` 被篡改；发现后会自动重建。

### extractContrastViews

从图片里提取水印增强视图。支持 `File`、`Blob`、`data:image/...base64` 和纯 base64 字符串。

```ts
const result = await watermarkService.extractContrastViews(file)

console.log(result.views)
```

当前会输出三类视图：局部差分、暗纹增强、亮纹增强。

### Debug 注意事项

- 先确认水印节点在 DOM 里：搜索 `data-wm-id="magic-watermark"`。
- 看不到水印时，先临时把 `color` 透明度调高，比如 `rgba(255, 0, 0, 0.1)`。
- 截图解析失败时，先确认截图里真的包含水印区域。
- 白底上的暗色水印优先用“暗纹增强”。
- 黑底上的亮色水印优先用“亮纹增强”。
- 背景明暗混合时优先用“局部差分”。

### 注意事项

- 这些 API 依赖浏览器 DOM、Canvas、ImageBitmap，因此只能在 client component 或浏览器环境中使用。
- 某些 iPhone 下透明度小于 `0.015` 的 canvas 可能无法显示，当前默认透明度已避开这个区间。
- 相关问题参考：https://github.com/zhensherlock/watermark-js-plus/issues/898#issuecomment-2351301350