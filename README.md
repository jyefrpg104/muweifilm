# muweifilm.com

單檔靜態網站。樣式內嵌，無 build、無框架、無第三方服務。
在本機雙擊 `index.html` 就能看到完整結果。

**沒有圖片也能直接上線**——圖框會顯示成標了檔名的佔位塊，之後一張一張換。

```
index.html    整個網站（含樣式）
404.html      找不到頁面
images/
  works/         hero.jpg + 作品劇照
  photography/   p1–p6.jpg
  about/         portrait.jpg
```

---

## 上線（約 30 分鐘）

1. GitHub → New repository → 命名 `muweifilm` → **Public** → Create
2. Add file → Upload files → 拖入 `index.html`、`404.html` → Commit
3. Cloudflare Pages → Create a project → Connect to Git → 選這個 repo
4. Build command **留空**、Output directory 填 `/` → Save and Deploy
5. 用它給的 `xxx.pages.dev` 網址確認
6. 網域轉移完成後 → Custom domains → 加入 `muweifilm.com`

---

## 補圖

丟進對應資料夾，檔名對上就會自動顯示。佔位塊上寫的就是它要的檔名。

| 路徑 | 尺寸 |
|---|---|
| `images/works/hero.jpg` | 1600×900 |
| `images/works/*.jpg` | 1200×675（每支作品） |
| `images/photography/p1–p6.jpg` | 1000×1250（直式） |
| `images/about/portrait.jpg` | 1000×1250 |
| `images/og.jpg` | 1200×630（社群分享縮圖） |

單張壓到 300KB 以內。

---

## 新增一支作品

在 `index.html` 搜尋 `shotlist__rows`，複製下面這塊貼進去。
順序就是清單顯示的順序。

```html
<li class="row">
  <a href="YOUTUBE_網址" target="_blank" rel="noopener"
     data-still="images/works/檔名.jpg">
    <span class="row__year">年份</span>
    <span class="row__client">客戶</span>
    <span class="row__kind">片型</span>
    <span class="row__title">片名</span>
    <span class="row__go" aria-hidden="true">觀看</span>
  </a>
</li>
```

`row__kind` 建議只用四種：形象片／紀錄片／知識型／短影音。
分類越少，清單越好讀。

作品超過 12 支時再拆成獨立的 `works.html`。

---

## 待核對

- 作品的年份是推測的
- 兩支寫「待填」的客戶名稱
- 主標「把難講的事，講得有人想看」是定位提案

---

## 之後要改東西

GitHub repo → 點 `index.html` → 鉛筆圖示 → 改 → Commit changes。
約 30 秒後線上更新。
