# 曜海 GlobalTrade AI 官网

这是曜海 GlobalTrade AI 的公网官网静态站点。

## 发布到 Vercel

```powershell
D:\npx.cmd vercel@latest login
D:\npx.cmd vercel@latest --prod --yes
D:\npx.cmd vercel@latest domains add haoleyun.xyz
```

如果使用 Token：

```powershell
$env:VERCEL_TOKEN="你的 Vercel Token"
.\deploy_to_vercel.ps1
```

## 推送到 GitHub

```powershell
$env:GITHUB_TOKEN="你的 GitHub Token"
.\push_to_github.ps1
```

上线后提交站点地图：

- `https://haoleyun.xyz/sitemap.xml`

## 文件说明

- `index.html`：官网首页
- `robots.txt`：搜索引擎抓取规则
- `sitemap.xml`：站点地图
- `downloads/YaoHai_GlobalTrade_AI_Commercial_V1.0.9.zip`：下载应用
