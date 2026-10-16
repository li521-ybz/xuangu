# 选股 APP · 部署到 GitHub Pages 逐步教程

> 目标：把你本地的「选股」股票看盘 PWA 变成一个**手机/电脑都能打开的网址**，自选股可**跨设备同步**（用 GitHub 私有 Gist 当数据库，只需一个 GitHub 账号，免 Supabase / 免 Cloudflare）。
> 适用：无编码基础、自用。所有操作在 GitHub 网页 + 本机完成，无需服务器。
> 准备工作（已由 AI 完成）：本地 Git 仓库已建、首次提交已做、分支为 `main`、已配置 `.gitignore` 忽略 `node_modules`、部署工作流 `.github/workflows/deploy.yml` 已就位。

---

## 第 1 步：在 GitHub 网页新建仓库（⭐ 你现在这步）

1. 打开 https://github.com 并登录你刚注册的账号。
2. 右上角点 **＋** → 选 **New repository**（新建仓库）。
3. 填写：
   - **Repository name（仓库名）**：`xuangu`（或任意，如 `stock-pwa`）。记住它，后面要用。
   - **Description（描述）**：可选，填「自用股票看盘 PWA」。
   - **Visibility（可见性）**：选 **Public（公开）**。
     > 说明：网站文件必须公开，GitHub Pages 才免费托管。你的自选股数据存在**私有 Gist** 里（第 4 步），不会被公开，别人看不到。
   - 下方三个勾选框（Add README / .gitignore / license）**全部不要勾**（本地已有代码，避免冲突）。
4. 点 **Create repository**（创建仓库）。
5. 创建成功后页面会显示一个仓库地址，类似：
   `https://github.com/你的用户名/xuangu.git`
   **把这个地址复制下来**（后面第 2 步要用）。

✅ 完成后把仓库地址发给我，我帮你把本地代码推上去；或按第 2 步自己推。

---

## 第 2 步：把本地代码推到 GitHub

### 方式 A（推荐，交给 AI）：把第 1 步的仓库地址发给我
我直接帮你执行推送命令，无需你敲命令。

### 方式 B（自己推）：在本机打开 Git Bash，进入项目目录后执行
```bash
cd /d/选股-app
git remote add origin https://github.com/你的用户名/xuangu.git
git push -u origin main
```
> 首次推送会弹出 GitHub 登录框，用浏览器授权即可（或用你账号的密码/令牌）。
> 推送后回到 GitHub 仓库页面，能看到 `src/`、`package.json`、`.github/` 等文件，说明成功。

---

## 第 3 步：开启 GitHub Pages 自动部署

1. 在 GitHub 仓库页面，点顶部 **Settings（设置）**。
2. 左侧菜单最下方点 **Pages**。
3. **Build and deployment（构建与部署）** 区域：
   - **Source（源）**：选 **GitHub Actions**（不要选 Deploy from a branch）。
4. 不用其它设置，关掉页面即可。
   > 因为我们已有 `.github/workflows/deploy.yml`，GitHub 会在每次 `push` 到 `main` 时自动构建并发布。
5. 回到仓库 **Actions** 标签页，能看到一个 **Deploy to GitHub Pages** 的工作流在跑（首次约 1–2 分钟）。
   - 绿色 ✓ = 成功；黄色 = 进行中；红色 ✗ = 失败（见文末排查）。
6. 成功后，访问你的网站：
   `https://你的用户名.github.io/xuangu/`
   （把 `你的用户名` 和 `xuangu` 换成你自己的）。手机浏览器打开这个网址即可用。

---

## 第 4 步：生成「仅 Gist 权限」的个人令牌（用于跨设备同步自选股）

> 这步让 App 能把自选股存进你的**私有 Gist**，实现手机/电脑同步。只给 `gists` 权限，读不了你别的仓库，安全。

1. GitHub 右上角点你的头像 → **Settings（设置）**。
2. 左侧最下方 **Developer settings** → **Personal access tokens** → **Tokens (classic)**。
3. 点 **Generate new token** → **Generate new token (classic)**。
4. 填写：
   - **Note（备注）**：`xuangu-sync`
   - **Expiration（有效期）**：选 **No expiration（不过期）**（自用方便；介意可设 1 年，到期重生成再填一次）。
   - **Select scopes（权限）**：**只勾 `gist`** 这一项，其它全不勾。
5. 页面底部点 **Generate token**。
6. 生成后会出现一串 `ghp_xxx...` 的令牌，**立即复制保存**（只显示这一次）。

⚠️ 令牌等同于你账号的钥匙，不要发到网上或提交进代码。它只存在你手机/电脑的浏览器本地（App 设置里）。

---

## 第 5 步：在 App 里填入令牌，开启同步

1. 打开你的网站（第 3 步的网址）。
2. 右上角点 **⚙（设置）** 按钮。
3. 把第 4 步复制的 `ghp_xxx...` 令牌粘贴进去，点**保存**。
4. 添加几只自选股，刷新页面 / 换设备打开同一网址 → 自选股都在，说明同步成功。

> 没填令牌也能用：自选股只存在当前浏览器（换设备/清缓存会丢）。填了令牌才跨设备同步。
> 行情数据走公共 CORS 代理（免配置），未配同步时也能看到涨跌；若代理偶发不稳定，点「刷新」重试即可。

---

## 第 6 步：手机「添加到主屏幕」当 APP 用

- **iPhone（Safari）**：打开网站 → 点底部「分享」图标 → **添加到主屏幕** → 主屏出现图标，点开即全屏类原生 APP。
- **安卓（Chrome）**：打开网站 → 点右上「⋯」→ **安装应用 / 添加到主屏幕**。
- 之后像普通 APP 一样从主屏打开，离线也能看壳（行情需联网）。

---

## 常见问题排查

| 现象 | 原因 / 解决 |
|---|---|
| Actions 红 ✗ | 点进工作流看日志。常见：分支名不是 `main`（已统一）、`npm ci` 失败（依赖锁文件问题，极少）。把错误发我。 |
| 网站打开是空白 | 多半是 `base` 路径。已设 `./` 一般无此问题；若仍空白，确认访问地址带仓库名 `/xuangu/`。 |
| 行情显示「— / 暂无数据」 | 公共 CORS 代理（corsproxy.io）偶发不稳。等多刷新几次，或改 `VITE_CORS_PROXY` 环境变量指向 allorigins.win；未填令牌不影响行情。 |
| 同步不生效 | 检查令牌是否只勾了 `gist`、是否粘贴完整（以 `ghp_` 开头）、网络是否可达 GitHub。 |
| 想改代码后重新部署 | 在本机改完，`git add -A && git commit -m "说明" && git push`，GitHub 自动重新部署。 |

---

## 你已具备的能力小结
- 一个**免费、HTTPS、可加主屏**的看盘网址（GitHub Pages）。
- 自选股**跨设备同步**（GitHub 私有 Gist，仅 gists 令牌）。
- 行情经**公共 CORS 代理**直连腾讯/新浪，红涨绿跌、分时+日K 同屏。
- 全部只需**一个 GitHub 账号**，零付费、零 Supabase/Cloudflare。
