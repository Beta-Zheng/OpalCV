# TouchstoneCV 项目与品牌梳理

## 当前产品

TouchstoneCV 是本地优先的 AI 简历工作台。核心路径是「导入与校对 → 编辑与预览 → 创建岗位版本 → 检查与导出 → 记录投递」。AI 是可选辅助，建议经确认后应用；产品不自动投递，也不承诺招聘结果。

| 区域 | 代码入口 | 职责 |
| --- | --- | --- |
| 应用与导航 | `src/App.tsx` | 桌面侧栏、移动导航、路由与加载边界 |
| 工作台 | `src/pages/Home.tsx` | 创建、导入、主简历与岗位版本归组 |
| 简历编辑 | `src/pages/Editor.tsx`、`src/components/resume-preview.tsx` | 内容编辑、排版与 A4 预览 |
| 投递记录 | `src/pages/Applications.tsx` | 状态、反馈、跟进与关联快照 |
| 模型与数据 | `src/pages/Models.tsx`、`src/pages/Settings.tsx` | 模型授权、隐私策略、备份与恢复 |
| 领域与存储 | `src/lib/` | Zustand 状态、IndexedDB、解析、JD、版本和导出 |
| 视觉系统 | `src/index.css`、`src/components/icons.tsx` | 色彩、版式、控件和功能图标 |

技术栈为 React、TypeScript、Vite、Tailwind CSS 与 Zustand。近期工作集中在编辑预览联动、篇幅调整、工作台密度与投递流程，因此品牌需要呈现可信、精确的工作工具气质。

## 视觉问题与新方向

旧资源存在三套图形：页面中的岩块金痕、独立 SVG 的渐变擦痕，以及浏览器 favicon 的岩块版本。细碎金屑、多层渐变和悬停动画在 16–38px 场景下增加了视觉噪声，维护时也容易不同步。

新标识采用「刻印 T + 上扬金痕」：切角石板延续试金石意象；T 是 Touchstone 的首字母；金色斜痕表达打磨经历、显现价值。几何实色不依赖渐变 ID、滤镜或动画，适合小尺寸与多个实例。

| 元素 | 规范 |
| --- | --- |
| 主色 | 靛紫 `#4338CA`，衔接现有 brand-700 |
| 字形 | 冷白 `#F9F9FB` |
| 试金痕 | 暖金 `#F2BD61`，仅用于标识装饰，不承担状态含义 |
| 比例 | 64 × 64 viewBox，保留内置安全留白，不裁切、不拉伸 |
| 页面尺寸 | 移动顶栏 28px、桌面侧栏 38px；浏览器检查 16px 与 32px |
| 功能图标 | Lucide，默认 18px / 1.75px 线宽；导航 20px，保持可见文字标签 |

工作台用分区面板图标表达编辑工作空间；投递记录用勾选清单表达进度记录。模型、存储及常规编辑动作继续使用现有语义清晰的功能图标。

## 资源与维护

- `public/logo-mark.svg`：主标识，也是页面组件 `src/components/logo.tsx` 的直接来源。
- `public/logo-mark-light.svg`：浅底深色字形，适用于浅色展示面。
- `public/logo-mark-mono.svg`：石墨底反白单色版。
- `public/favicon.svg`、`public/favicon-32.png`：浏览器标签资源。
- `public/apple-touch-icon.png`：180px、不透明背景的手机书签图标。
- `public/favicon-v4.svg`：保留旧 URL，图形与主标识同步。

修改主 SVG 后运行 `npm run brand:assets`，统一生成其他版本与 PNG。需安装 Playwright Chromium，或通过 `QA_BROWSER` 指定本机 Chrome 路径。不要分别编辑生成资源。

页面的标识紧邻品牌文字，使用空 alt 避免重复朗读。独立 SVG 自带品牌名称。Logo 保持静态，避免把非交互品牌标记做成类似按钮的悬停反馈。
