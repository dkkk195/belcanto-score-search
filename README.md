# Bel Canto Score Search｜美声免费谱库聚合检索

这是一个统一风格的免费声乐谱库聚合检索网站。它不是简单跳转页，而是包含：

- 一个统一搜索框；
- 同时检索多个免费/公版声乐资源站；
- 在同一个网页风格中展示结果；
- 优先解析并显示“直接下载 PDF”按钮；
- 只有抓不到稳定直链、被来源站限制、或需要进入页面选择版本/确认版权时，才给“前往原站下载”按钮；
- 保留来源和版权提醒，不重新托管任何谱子。

## 已集成来源

1. IMSLP
2. CPDL / ChoralWiki
3. Library of Congress Notated Music
4. Internet Archive
5. Mutopia Project
6. Art Song Central
7. The Opera Database
8. Opera-Arias.com
9. LiederNet Archive
10. OpenScore Lieder

## 下载链接规则

本项目的规则是：**能在统一页面里直接给 PDF 直链，就不跳转；只有无法稳定解析 PDF、来源站限制直链、或需要人工选择版本/确认版权时，才跳转到原站下载。**

页面里会显示两类按钮：

- **直接下载 PDF**：后端已经从来源站解析到 PDF 地址，用户可在当前统一界面直接打开/下载。
- **前往原站下载**：没有稳定 PDF 直链，或该站需要进入页面选择版本、调性、声部、格式，或确认版权状态。

## 为什么需要后端 server.js？

很多谱库不允许浏览器直接跨站抓取 HTML/PDF 链接，这叫 CORS 限制。  
所以本项目用 `server.js` 做本地检索代理：前端保持统一 UI，后端负责到各个谱库查询、尽量解析 PDF 直链，再返回统一 JSON 给页面展示。

## 本地运行

电脑需要安装 Node.js 18 或以上版本。

```bash
cd belcanto_score_search
npm start
```

然后打开：

```text
http://localhost:8787
```

## 常见搜索方式

建议使用“曲名 + 作曲家”的方式：

```text
Nessun dorma Puccini
Voi che sapete Mozart
Gretchen am Spinnrade Schubert
Après un rêve Fauré
Lascia ch'io pianga Handel
Caro mio ben Giordani
```

## 部署建议

- 只用 Netlify Drop：只能展示静态页面，不能真正跨站检索。
- 想要完整检索功能：建议部署到 Render、Railway、Vercel Node Server、自己的云服务器，或直接本机运行。

## 版权提醒

本工具只聚合公开页面和公开下载入口，不复制、不缓存、不重新分发谱子。下载、教学、演出或商用前，请查看来源站点的 Public Domain、Creative Commons、Rights、Copyright 等说明。
