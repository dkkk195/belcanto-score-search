# 数据源说明

## 直接 API / 可结构化检索

- IMSLP：MediaWiki API 搜索页面；随后尝试进入结果页解析 PDF 直链，解析不到时进入 IMSLP 下载页。
- CPDL：MediaWiki API 搜索页面；随后尝试进入结果页解析 PDF 直链，解析不到时进入 CPDL 下载页。
- Library of Congress：loc.gov JSON API，尝试从结果 JSON 中提取 PDF URL；提取成功时在本页直接下载。
- Internet Archive：advancedsearch API + metadata API，尝试选择 PDF 文件；提取成功时在本页直接下载。

## HTML 检索 / 直链尝试

- Mutopia Project：检索页 HTML，优先提取 PDF；无直链时进入曲目页。
- Art Song Central：WordPress 搜索页，尝试进入条目页提取 PDF；无直链时进入原站。

## 稳定入口 / 来源页

以下站点对机器检索接口开放程度较低或结果结构不稳定，因此先提供统一结果卡片和官方检索入口：

- The Opera Database
- Opera-Arias.com
- LiederNet Archive
- OpenScore Lieder

这类结果仍会出现在统一页面里，但按钮通常是“前往原站下载/来源页”，不是直接 PDF。

## 跳转规则

能解析到稳定 PDF 直链的结果会显示“直接下载 PDF”。只有以下情况才显示“前往原站下载”：

1. 来源站没有稳定公开 API；
2. 页面需要用户选择版本、声部、调性或格式；
3. 页面需要确认版权/地区公版状态；
4. 当前检索结果没有暴露 PDF 直链。
