# MUWEI FILM — 網站與互動作品

這個儲存庫包含兩個**獨立網站專案**，從此不再把木尉網站原始檔散落在最上層。

```text
muweifilm/
├── muwei-website/               # 木尉影像網站（HTML、CSS、圖片）
│   ├── index.html
│   ├── about.html
│   ├── works.html
│   ├── services.html
│   ├── contact.html
│   ├── 404.html
│   ├── site.css
│   ├── portrait.jpg
│   └── images/
│       └── about/
├── photo-quest/                 # 攝影抽卡遊戲（獨立專案）
│   ├── index.html
│   └── apple-touch-icon-v1.png
├── _redirects                  # Cloudflare Pages URL 相容規則
├── 404.html                    # 根目錄 404（部署相容）
├── CNAME                       # 自訂網域設定（GitHub Pages 相容）
├── .nojekyll                   # GitHub Pages 相容
└── README.md
```

## 對外網址（不變）

| 用途 | 網址 |
|---|---|
| 木尉網站首頁 | https://www.muweifilm.com/ |
| 木尉網站作品 | https://www.muweifilm.com/works.html |
| 木尉網站關於 | https://www.muweifilm.com/about.html |
| 木尉網站服務 | https://www.muweifilm.com/services.html |
| 木尉網站聯絡 | https://www.muweifilm.com/contact.html |
| 攝影抽卡遊戲 | https://www.muweifilm.com/photo-quest/ |

木尉網站的原始檔移到 `muwei-website/`，透過根目錄的 `_redirects` 使用 Cloudflare Pages **200 internal proxy** 將原有路徑映射到新位置（保留使用者瀏覽器的網址）。CSS 和圖片亦有對應規則。遊戲完全維持在 `photo-quest/`，不受到這些規則影響。子網頁的無副檔名網址（例如 `/works`）也保留了對應。

## 部署設定：不要將 Build Output 改成 muwei-website

此 Repository 原本以 **Cloudflare Pages** 從 `main` 部署根目錄的靜態資源。保留目前設定：

- Build command：留空（無框架、無額外 build）
- Build output directory：Repository 根目錄（`/`）
- Production branch：`main`
- Custom domain：原本 Cloudflare Pages 上已設定的網域

**不能直接改成以 `muwei-website/` 作為唯一 Output 目錄**，否則 `photo-quest/` 將無法隨同部署。Cloudflare Pages 的 `_redirects` 僅適用於 Cloudflare Pages；如果日後改用 GitHub Pages 或其他平台，需改用相容的 rewrite 規則或建置輸出設定。

部署後建議檢查首頁、各分頁、CSS/圖片、404 和 Photo Quest；如果日後設定了 Cloudflare Pages Functions，注意 Functions 可能優先接手路由，導致 `_redirects` 不生效。

## 日常維護

- 木尉網站：只編輯 `muwei-website/`。本機直接開啟 `muwei-website/index.html` 可以預覽。
- 攝影抽卡遊戲：只編輯 `photo-quest/`。
- 加入新子專案：在根目錄建立另一個專案資料夾。
- 新增或變更木尉網站資源路徑：必要時調整根目錄的 `_redirects`。
- 修改 404：同步更新 `muwei-website/404.html` 及部署用的根目錄 `404.html`。

> 備註：改名僅涉及 Git 內的檔案位置；原 HTML、CSS、Photo Quest 內容保持不變。
