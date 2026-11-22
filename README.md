<div align="center">
  <img src="./public/logo-mark.svg" width="72" height="72" alt="OpalCV Logo · 二维渐变圆 × 仿眼眸星光" />
  <h1>OpalCV · 欧泊简历</h1>
  <p><strong>Craft your story into brilliance, locally.</strong><br/>把经历，打磨成光。</p>
</div>

---

## 简介

**OpalCV（欧泊简历）** 是一款本地优先、隐私可控的 AI 简历工作台，支持全局深浅色、中英文切换。

- **数据留本机**：所有简历、快照、投递记录与配置均保存在浏览器本地（IndexedDB），默认不上传任何云端服务器，随时支持 JSON 备份与 AES-GCM 端到端加密同步（WebDAV / GitHub 私有 Gist）。
- **沉浸排版 · 所见即所印**：内置 7 套中英文分组 A4 专业模板，支持实时分栏预览、撤销/重做、宽屏双侧栏停靠、智能一页/两页篇幅调整与高质量 PDF / DOCX / Markdown 导出。
- **可控 AI 辅助**：支持接入本地模型（Ollama / LM Studio）或兼容 OpenAI 协议的自定义模型，按段落智能润色、全简历体检与岗位 JD 匹配定制，外发内容前逐次确认。
- **投递全流程管理**：支持中英文简历示例快速上手，为不同岗位派生专属简历版本，自动锁定导出快照，提供交互式状态筛选、待办滚动提醒与投递进度图表。

## 快速开始

### 1. 本地运行

```bash
pnpm install
pnpm dev
```

启动后在浏览器访问终端提示的本地地址即可开始使用。

### 2. 生产构建

```bash
pnpm build
```

构建产物位于 `dist/` 目录，可直接部署至任意静态托管服务（GitHub Pages、Cloudflare Pages、Vercel 或本地静态服务器）。

## 使用指南

1. **创建或导入简历**：在「工作台」点击 **导入简历 / 精品示例 / 从零开始**，支持拖入 `PDF / DOCX / Markdown / TXT` 解析，或直接载入中文 / 英文 AI 示例。
2. **沉浸式编辑与预览**：在编辑页切换 **写内容 / 内容与预览 / 仅预览**，使用 `Ctrl+Z` / `Ctrl+Shift+Z` 撤销重做，在「模板与设置」中按中英文推荐分组实时预览并切换模板。
3. **配置 AI 模型（可选）**：前往 **模型与隐私** 添加本机模型或自定义 API，支持本地主密码加密保护 API Key。
4. **导出与投递管理**：点击 **导出** 生成打印级 PDF、DOCX 或 Markdown；在 **投递记录** 中点击状态卡片一键筛选，关联快照并追踪面试与 Offer 进展。
5. **备份与迁移**：在 **设置** 中随时一键导出全量 JSON 备份，或配置 WebDAV / GitHub 私有 Gist 加密同步。

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
