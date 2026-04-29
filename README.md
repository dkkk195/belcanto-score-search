# Bel Canto Score Search v5

美声声乐免费/公版谱库聚合检索网站。支持 Node.js 18+ 本地运行或部署到 Render / Railway / 其他 Node Web Service。

## v5 优化点

- 扩展来源到 18 个：IMSLP、CPDL、Library of Congress、Internet Archive、Mutopia、Musopen、Gallica BnF、Art Song Central、The Opera Database、Opera-Arias、LiederNet、OpenScore Lieder、RISM、MDZ/BSB、Europeana、HathiTrust、Free-scores.com、8notes。
- 多语言检索优化：支持中文、英文、德语、法语、意大利语、日语、韩语等 Unicode 输入；自动去除重音符号；内置常见中文曲名/作曲家/声部译名扩展。
- 下载优化：能解析到公开 PDF 时，优先通过 `/api/download` 在本站代理下载，避免浏览器跨域限制。
- 失败兜底：不能稳定直连、需要选择版本、确认版权、登录或付费时，明确提示“前往原站下载”。
- 速度优化：并行检索、多源失败互不影响、请求超时、一次重试、10 分钟内存缓存、核心快搜/全库深搜模式。
- 安全与版权边界：不破解、不绕过付费墙、不伪造登录、不抓取 DRM 或会员专属文件。

## 本地启动

```bash
npm start
```

浏览器打开：

```text
http://localhost:8787
```

测试接口：

```text
http://localhost:8787/api/health
http://localhost:8787/api/sources
```

## 部署到 Render

Render 建议选择 **Web Service**，不要选 Static Site。

配置：

```text
Build Command: npm install
Start Command: npm start
```

如果你上传到 GitHub 时多套了一层文件夹，例如仓库根目录只有 `belcanto_score_search_v5/`，则在 Render 的 Root Directory 中填写该文件夹名。

## 付费/会员来源处理规则

如果某个来源页面显示需要付费、订阅、会员、登录、购买、出版社授权，本工具只提供合法提示：

- 去原站购买或登录授权账号；
- 查找同一作品的公版版本，例如 IMSLP、CPDL、LoC、Gallica、Internet Archive；
- 通过学校图书馆、公共图书馆、馆际互借、出版社租赁/购买等合法渠道获取；
- 不提供破解、绕过付费墙、去水印、伪造下载链接等功能。

## 文件结构

```text
server.js
package.json
Procfile
public/
  index.html
  styles.css
  app.js
README.md
SOURCES.md
上线部署说明.md
启动网站_windows.bat
run_windows.bat
```
