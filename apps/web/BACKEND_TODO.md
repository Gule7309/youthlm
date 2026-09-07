# YouthLM 後端整合與未完成事項

最後更新：2026-09-07

這份文件追蹤前端、後端、AI、資料保存、原始資料與 AWS 部署的交接狀態。「後端已有實作」不等於「前端已串接」，也不等於「已在比賽 AWS 環境驗證」。每完成一個功能，都應同步更新狀態、驗證方式與負責人；正式契約的變更另由團隊確認。

本次核對基準：2026-09-06 15:04（台灣時間），GitHub `main` 為 `4d94577`，已合併 [PR #11 圖表交接模組](https://github.com/Gule7309/youthlm/pull/11)。以下後端狀態依本機對應程式、測試定義及文件確認；這次文件校正沒有重跑後端測試、呼叫真實模型或驗證 AWS。前端已執行的檢查另列於下方。

- 正式前端：`apps/web/`；FastAPI application：`apps/api/`；Python 核心：`app/`。
- 正式介面以 [API 契約](../../docs/api-contract.md)、[前端整合契約](../../docs/frontend-integration-contract.md) 及 [contracts](../../contracts/README.md) 為準，版本為 `0.1.0`（Contract v0）。
- [PR #13 簡報契約](https://github.com/Gule7309/youthlm/pull/13) 與 [PR #14 資料目錄 fixture](https://github.com/Gule7309/youthlm/pull/14) 在上述時間仍未合併；不能當成 main 已提供的簡報服務或已合併測試。資料目錄 API 本身已存在，不必等 PR #14 才算實作。

## 2026-09-07：Tooltip 零值與 PR 空白修正

依 [9/6 22:03 review](https://github.com/Gule7309/youthlm/pull/12#pullrequestreview-5125543386)，上一輪主要架構修正已被確認正確。本節記錄後續兩項修正與驗證；提交／推送結果另見 PR #12 留言，不代表 reviewer 已核准或 PR 已合併。

- [x] Tooltip 改為明確排除 `undefined`／`null`，合法的 `0` 仍進入數值 `<span>`，保留字型、對齊與格式化。
- [x] 新增 6 個實際元件渲染測試：零值、正負數格式化、null、undefined、自訂 formatter 收到零值，以及未啟用／空 payload。零值測試在修正前失敗、修正後通過；不能只檢查 HTML 是否含有字串 `0`，因為舊寫法可能渲染裸文字 `0`。
- [x] 清除 `index.html`、`App.tsx` 的行尾空白及檔尾多餘空白行；以忽略行尾空白／空行的 Git diff 確認兩檔沒有其他內容變動。
- [x] `npm run check` 通過 typecheck、Vite build 與全部 31 個測試（既有 25 個，加上本次 6 個 Tooltip 渲染測試）；本輪沒有重跑瀏覽器、後端測試或 AWS 驗收。
- [x] 以 PR merge-base 對照目前工作目錄，整體空白檢查為 exit code 0；不能只用 `git diff --check` 檢查未提交差異，否則會漏掉前次 commit 已帶入的問題。
- [x] 使用者於 2026-09-07 回覆「好的下一步」，接受本步修正並進入提交、推送與重新請求 review 的流程。本輪未修改後端、契約或既有 Chart Artifact adapter，未加入 API 串接。
- [ ] 等待 reviewer 重驗及核准，再依團隊流程合併；不自動合併到 main。

提交檢查要求：必須再執行 reviewer 指定的 `git diff --check origin/main...HEAD` 並確認 exit code 0，才可推送；結果與實際 commit SHA 一併記錄於 PR 留言。尚未提交時該指令仍檢查舊 HEAD，不能用工作目錄檢查取代提交後的驗證。

提示框元件尚未接到白板圖表；本次採 React 靜態渲染測試，只替換不具伺服器端尺寸的 ResponsiveContainer 版面容器，保留真實 ChartContainer context 與 Tooltip JSX。沒有新增測試框架、依賴或產品測試頁。重測指令見 README。

## 2026-09-06：PR #12 修正進度

依 [PR #12 第一輪人工 review](https://github.com/Gule7309/youthlm/pull/12#pullrequestreview-5124038212) 分步修正，每步完成後停下供人工檢查。此輪已以 `24b7f5d` 提交並推送；後續修正另列於上方。

- [x] 本機前端分支同步 main 的 PR #11 圖表交接模組，並保留既有雷達位置修改。
- [x] React UI 從 `app/web/` 移至正式的 `apps/web/`，包括隱藏設定檔；不另留第二套前端。
- [x] 合併 `package.json` 與 README，保留 `src/chart-artifact.js`、六個既有測試、`npm test` 與 Node.js 20 以上條件。
- [x] 在新目錄通過 `npm ci`、`npm run build`、六個交接測試；Playwright 驗證登入、開啟筆記本、新增來源、空白處收合設定並保留草稿、雷達收合／展開及 Ctrl＋滾輪縮放，瀏覽器無錯誤。
- [ ] 後續套件維護：安裝時既有 `recharts@2.15.2` 出現棄用警告；本次為保持搬遷範圍，不升級既有依賴。
- [x] 補 TypeScript 5.9.3、Node／React／ReactDOM 型別與 `tsconfig.json`；全部 60 個前端 TS／TSX 檔案及 Vite 設定通過 `strict`／`noEmit` 檢查。
- [x] React／ReactDOM 18.3.1 改為直接依賴，React 型別對齊 18.x，移除 optional peer 宣告。
- [x] Vite 改用 `import.meta.url`／`fileURLToPath`，resolver 使用 `Plugin` 型別；整理入口與 UI 元件的型別匯入。
- [x] 新增 `npm run check`，依序執行 typecheck、build、六個圖表交接測試，任一步失敗立即停止；三項皆已通過。
- [x] 新 lockfile 在獨立空目錄通過 `npm ci`；不依賴舊的 node_modules，也未中斷執行中的網站。
- [x] Playwright 回歸通過登入、開啟筆記本、卡片拖曳、新增來源、空白處收合並保留草稿、雷達展開／收合及 Ctrl＋滾輪縮放；Console 無錯誤。
- [x] 使用者於 2026-09-06 回覆「應該是可以」，接受型別檢查步驟並同意繼續；重測方式保留於 README。
- [x] 校正本文件的歷史 Git／資料／後端狀態，分開「後端已實作」「前端尚未串接」與「待設計／待確認」。此步只更新文件，不改 UI、後端或 contracts。
- [x] 使用者接受文件校正並要求繼續；功能總覽、資料範圍與正式 API 分界已記錄。
- [x] 區分 Canvas `sourceNodeIds` 與 SourceConfig 的 `registrySourceId`／filters；來源選擇、成果連線、小幫手草稿、複製、刪除及雷達狀態同步使用新命名。未綁定來源不自動填 Registry ID。
- [x] 抽出白板狀態 helper，新增十五個測試（含四個檔案 metadata 子測試）：深拷貝、保留／清除綁定、複製／刪除連線及雷達判斷；`npm run check` 通過型別、build 及共 21 個測試。
- [x] 本次 Playwright 回歸通過：兩來源圖表連線、空白處收合保留草稿、小幫手建立成果／草稿、副本刪除來源後連線及草稿同步清理、原筆記本不受影響、拖曳與 Ctrl＋滾輪；Console 0 errors／0 warnings。未串接 AI 或真實資料 API。
- [x] 使用者要求繼續，進入簡報輸入分界修正；ID 分離的重測步驟保留於 README。
- [x] 簡報明示「尚未提供」並停用選項：輸入應是 completed／partial 分析成果，不是原始來源或未執行的圖表草稿；未新增後端契約／API。
- [x] 小幫手只建立 1 項圖表草稿；舊簡報草稿不可執行，舊簡報卡不再繪製原始來源連線、不算已設定成果，也不能保存為可生成簡報。
- [x] 新增 4 個簡報分界測試；本次 typecheck、build 與共 25 個測試通過。
- [x] Playwright 驗證舊簡報卡無原始來源連線／選擇器、簡報選項及儲存停用、舊混合草稿與新需求只建立圖表，以及圖表儲存／收合／重開；Console 0 errors／0 warnings。測試使用前端假資料，沒有呼叫簡報或分析 API。
- [x] 使用者於 2026-09-06 回覆「應該是沒問題，請你繼續」，接受本次簡報分界步驟；人工重測方式保留於 README。
- [x] 收尾再次執行 `npm run check`：型別檢查、正式建置及 25 個測試全數通過；相對 `origin/main` 未修改 Python 核心、API、contracts 或既有 Chart Artifact 模組與六個測試。
- [x] 整理 [PR #12 review 回覆與交接清單](./docs/pr-12-review-response.md)，逐項對照修正及驗證結果；該文件保留提交時紀錄，推送確認另見 GitHub 留言。
- [x] 使用者同意先 commit、不 push；本輪以 `fix(web): address PR #12 frontend review` 建立本機 checkpoint，包含目錄搬遷、型別檢查、ID 分離、簡報分界及交接文件。
- [x] 使用者後續授權推送；`24b7f5d` 已更新到 PR #12，發布 [修正摘要](https://github.com/Gule7309/youthlm/pull/12#issuecomment-5559152356) 並請 Gule7309 重新 review。沒有修改或合併到 main。
- [ ] 上述 review 修正完成後，再以小 PR 串接 Source → Chart；本次尚未使用 adapter 繪製 React 成果卡。

## 狀態說明

- `[x]`：該項所述範圍已完成；UI、程式實作、測試通過及部署驗證分開記錄，不可互相推論。
- `[ ]`：尚未開始或尚未完成。
- `前端假資料`：已有可操作介面，但尚未接上後端。
- `後端已實作／前端未接`：repository 有對應程式或契約，但畫面尚未使用，不代表已通過真實模型或雲端整合驗收。
- `待確認`：需要團隊、主辦單位或資料負責人做決定。
- `阻塞`：缺少必要資訊，暫時無法繼續。

## 目前已完成

- [x] 已建立 Git repository、commit 與 GitHub `origin`：[Gule7309/youthlm](https://github.com/Gule7309/youthlm)。本機工作分支為 `codex/frontend-ui`，前端已有 [PR #12](https://github.com/Gule7309/youthlm/pull/12)。
- [x] 上一輪 review 修正經使用者逐步接受後，以 `24b7f5d` 保存並推送；本輪 Tooltip／空白修正與驗證另見前方紀錄，不宣稱 reviewer 已核准。
- [x] 網站目前可見文字已改為繁體中文。
- [x] 登入與註冊 UI。
- [x] 登入／註冊的前端表單驗證與 loading 狀態。
- [x] 筆記本列表 UI。
- [x] 建立、重新命名、建立副本、刪除與開啟筆記本的前端互動。
- [x] 新筆記本的空白白板狀態。
- [x] 從白板返回筆記本列表。
- [x] 現有示範白板可拖曳節點、縮放與移動畫布。
- [x] 支援按住 `Ctrl` 搭配滑鼠滾輪，以游標所在位置為中心縮放白板。
- [x] 卡片設定面板開啟時，點擊白板空白處可直接收合，且保留尚未儲存的表單內容。
- [x] 來源卡片可由左側點擊新增或拖入白板，並可移動、選取、設定與刪除。
- [x] 成果卡片可由左側點擊新增或拖入白板，並可移動、選取、設定與刪除。
- [x] 圖表成果可設定名稱、Prompt 與多個來源並顯示連線；簡報選項停用並說明需使用分析成果，沒有假裝已完成生成。
- [x] 小幫手卡片可由左側點擊新增或拖入白板，並可移動、選取與刪除。
- [x] 小幫手可保存需求並依目前來源產生 1 項圖表設定草稿；不再產生簡報草稿，不執行 AI 分析或產生成果內容。
- [x] 政策雷達固定顯示於白板，可收合、執行前端盤點、保留本次頁面最近一次紀錄，並在來源／成果設定變更後提示重新盤點。
- [x] 每本筆記本在本次瀏覽器工作階段內各自保留白板卡片與設定。
- [x] 來源設定支援檔案 metadata 與公開 API 網址的前端表單及驗證。
- [x] `npm run check` 已通過型別檢查、建置及 31 個測試（6 個圖表交接、15 個白板狀態、4 個簡報分界、6 個 Tooltip 渲染）；先前型別檢查步驟亦已完成乾淨安裝與上述瀏覽器回歸。

目前的帳號、筆記本與白板資料都只存在 React 記憶體中，重新整理頁面後會重置。後端另有 SQLite 分析模組保存，但前端未串接，且它不保存帳號、筆記本清單或白板配置。

## 功能開發總覽

| 模組 | 前端現況 | 後端／資料已有 | 尚未完成 |
| --- | --- | --- | --- |
| 登入、註冊與筆記本 | 表單、列表與操作原型 | 分析 API 有 project 範圍，但不是登入權限 | 真實驗證、Notebook CRUD、使用者權限與恢復登入 |
| 來源卡片 | 拖放、設定及摘要；檔案僅 metadata，網址不連線 | 兩份官方快照、Source Registry、`GET /v1/data-sources`、確定性查詢與相容性檢查 | 串接目錄、篩選／預覽；通用上傳、清理、抓取與更新 pipeline |
| 圖表成果 | 設定 UI；adapter 與六個測試已合併，未接 React | `POST /v1/analysis` 回傳結構化資料、圖表規格、警告與引用 | Source → Chart 請求、四種回應狀態、實際圖表／表格、來源追溯與匯出 |
| 簡報成果 | 選項停用，明示需完成／部分完成分析成果；舊簡報卡不接原始來源 | 本文核對時間 PR #13 為未合併契約提案，main 無簡報 endpoint | 真實分析模組選取、生成／預覽、PPTX／PDF，待獨立服務 |
| 小幫手 | 訊息及固定操作草稿，未呼叫 AI | Research Agent、工具迴圈、Gemini／Bedrock adapters | Notebook 對話生命週期、串流／停止、畫布操作工具與紀錄保存 |
| 政策雷達 | 固定面板、卡片數量盤點與本次頁面最近紀錄 | 可重用既有分析能力，但無專用雷達服務 | 雷達契約、真實政策分析、失敗處理、最近成功結果永久保存 |
| 分析／白板保存 | 白板仍為 React 記憶體 | SQLite 保存 `(project_id, module_id)` 分析結果並解析上游模組 | 整本筆記本／節點／連線／對話保存及還原；雲端持久化 |
| AWS | 尚未完成部署串接 | Bedrock adapter、provider 切換文件及 smoke／preflight 工具 | 比賽帳號／Region／模型權限確認、真實雲端驗證與整合部署 |

## 0. 登入、註冊與筆記本後端

### 帳號與身分驗證

- [ ] 決定使用 Amazon Cognito 或自建帳號 API。
- [ ] 註冊、登入、登出與更新登入狀態。
- [ ] 電子郵件驗證。
- [ ] 忘記密碼與重設密碼。
- [ ] Access token／refresh token 的儲存與更新方式。
- [ ] 前端啟動時恢復登入狀態。
- [ ] 登出後清除敏感狀態，但不得刪除使用者筆記本。
- [ ] 錯誤代碼與繁中錯誤訊息對照。

前端目前接受任何格式正確的帳號與至少 8 個字元的密碼，不會把資料送出或儲存。

### 筆記本資料

以下不是「後端完全沒有資料保存」：已實作的 [模組儲存](../../docs/module-context-storage.md) 只負責分析結果，不包含下列 Notebook 功能。

- [ ] 建立 `Notebook` 資料表或集合。
- [ ] 筆記本需綁定擁有者，使用者只能存取有權限的筆記本。
- [ ] 建立、讀取、重新命名、更新說明、建立副本與刪除 API。
- [ ] 儲存建立時間、最後更新時間與卡片數量。
- [ ] 定義刪除方式：軟刪除、資源回收桶或永久刪除。
- [ ] 刪除筆記本時一併處理來源、成果、檔案與工作紀錄。
- [ ] 後續若支援分享，需增加擁有者、編輯者與唯讀者權限。

## 1. 來源卡片

### 前端進度

- [x] 左側工具列提供「來源、成果、小幫手」三個主要入口。
- [x] 來源圖示可點擊新增，也可拖入白板指定位置建立空白來源卡片。
- [x] 來源卡片摘要：名稱、類型、設定狀態、啟用狀態與自動清理選項。
- [x] 來源設定側邊面板。
- [x] 檔案選擇與拖放介面；目前只保留檔名、大小、格式與最後修改時間。
- [x] 公開 API 網址設定與 `http/https` 格式驗證；目前不會真正連線。
- [x] 卡片在同一本筆記本的本次工作階段內可保存，切換筆記本不會互相混用。
- [x] 未儲存設定離開前提示、來源刪除確認，以及新增卡片的基本避讓定位。
- [ ] 串接 `GET /v1/data-sources`，顯示已安裝的兩份官方資料；將目前「預設資料集尚未蒐集」的原型文案改為符合實際狀態。本次文件校正尚未改 UI 文案。
- [x] SourceConfig 已預留 `registrySourceId` 與 JSON filters；成果／小幫手的 Canvas 連線欄位已改為 `sourceNodeIds`。目前只是前端欄位與狀態分離，未建立 API request mapper。
- [x] 複製筆記本只重新映射卡片 ID，Registry ID 保留、filters 深拷貝；來源名稱／選項編輯保留綁定，資料方式／檔案 metadata／API URL 變更時清除舊綁定與 filters。
- [ ] Source → Chart 串接時驗證 Registry 來源及 filters，並處理多張卡指向同一資料集的情況；目前後端不接受重複 `source_id`，不可直接逐卡送出或自動混合不同篩選。
- [ ] 真正檔案上傳後以後端來源版本／內容識別判斷換檔；目前 UI 只保存 metadata，不能證明檔案內容相同。
- [ ] 顯示實際筆數、資料版本、同步時間與上傳進度。
- [ ] 資料預覽、欄位勾選與篩選介面。
- [ ] 缺值、重複值、資料型別與欄位重新命名介面。
- [ ] 年齡範圍與相容性提示；沒有單歲資料或必要分子／分母時，不提供無依據的精確換算。
- [ ] 多來源合併設定。
- [ ] 來源執行中的 loading、成功、警告、錯誤與重試狀態。
- [ ] 來源卡片之間與完整的連線相容性規則；目前僅支援在成果設定中選擇來源並顯示 `來源 → 成果` 連線。
- [ ] 防止節點形成循環依賴。

目前「等待後端處理」是刻意的前端狀態。選擇檔案不會讀取或上傳內容；儲存公開 API 也不會發出網路請求。

### 後端與資料處理

- [x] 已有 [Source Registry](../../docs/source-registry.md)、[資料目錄實作](../../app/data_catalog.py) 與 `GET /v1/data-sources`，提供已安裝共用資料的 metadata，不是使用者上傳來源 CRUD。
- [x] 兩份資料已有專用解析器、版本識別、確定性篩選查詢及年齡／年度／地理／性別／單位相容性檢查；不是任意檔案的通用清理服務。
- [ ] 使用者上傳／自訂 URL 的來源註冊、metadata、擁有者與存取權限 API。
- [ ] 建立檔案上傳流程；S3 預簽網址是候選方案，尚未定案。
- [ ] 定義允許的檔案格式、單檔大小與總容量。
- [ ] 通用 CSV、Excel、JSON 與 PDF 解析，與現有固定快照的專用解析器分開。
- [ ] 掃描 PDF／圖片 OCR 是否列入比賽版範圍。
- [ ] 自動辨識欄位名稱與資料型別。
- [ ] 缺值、重複值、格式與編碼清理。
- [ ] 新資料的欄位轉換及相容性擴充；沿用現有不拆分官方年齡組、缺乏依據時拒絕或縮小範圍的原則。
- [ ] 多資料集 join／union 的欄位對應。
- [ ] 使用者設定網址後的執行期抓取、分頁、重試、逾時與 rate limit 處理；已提交官方快照不等於這條 pipeline 已完成。
- [ ] Pipeline 執行狀態、錯誤紀錄與最後成功資料版本。
- [ ] 手動重新整理資料。
- [ ] 排程更新功能可視時間列為賽後項目。
- [ ] 儲存原始資料與清理後資料，避免覆蓋唯一原始版本。

## 原始資料蒐集

### 已納入 repository 的官方快照

不是所有原始資料都還沒蒐集。目前 Source Registry 已安裝以下兩份資料；取得日期代表 repository 快照版本，不代表官方來源沒有更新。

| Registry source ID／資料 | 已有範圍與版本 | 使用限制與依據 |
| --- | --- | --- |
| `ntpc_population_by_age_sex_district`／現住人口之年齡分配 | 新北市政府主計處；2000–2024 年；全市及 29 區；官方五歲組 0–4 至 100+；總計／男／女；單位人；2026-08-31 取得，2,250 筆原始寬表列 | 不能從 15–19 拆出 18–19 或從 35–39 拆出 35 歲，不能推論里級；見 [metadata](../../data/ntpc_population_by_age_sex_district.metadata.json) 與 [資料說明](../../docs/population-data.md) |
| `ntpc_unemployment_by_age_sex`／失業率－年齡別 | 新北市政府主計處；2006–2024 年；全市；25–29、30–34 歲；男／女；單位 %；2026-08-29 取得，76 筆觀測 | 沒有區級、完整 18–35 歲或官方男女合計失業率；不得用男女失業率的簡單平均冒充合計；見 [metadata](../../data/ntpc_unemployment_by_age_sex.metadata.json) 與 [資料說明](../../docs/youth-data.md) |

兩份 metadata 已記錄原始網址、機關、授權、期間、欄位／單位、取得時間、hash 與限制，Registry 提供資料版本。它們尚不足以完成「教育程度 × 起薪」分析，也不能直接合成區級 18–35 歲就業風險；需先檢查地理／年齡口徑及計算所需分母。

### 後續蒐集入口

保留命題階段列出的查找入口；是否能提供所需欄位、授權與更新狀態，須在新增資料時確認：

- 新北市政府統計資料庫查詢平台：<https://oas.bas.ntpc.gov.tw/DgbasWeb/Page/Default.aspx>
- 中華民國統計資訊網：<https://www.stat.gov.tw/News_Content.aspx?n=4580&s=232642>
- 新北市資料開放平台 Open API：<https://data.ntpc.gov.tw/openapi>

### 優先蒐集主題

| 主題 | 需要的欄位或指標 | 理想資料粒度 | 目前狀態 |
| --- | --- | --- | --- |
| 青年人口 | 年齡、性別、行政區、年度 | 單歲或可精確合計至 18–35 歲 | 已有上述五歲組人口快照；精確 18–35 歲資料仍缺 |
| 教育程度 | 最高學歷、在學狀態、科系或教育階段 | 行政區／年度／年齡 | 尚未納入目前 repository，待確認蒐集負責人 |
| 就業狀態 | 就業、失業、勞動參與率、產業別 | 行政區／季度或年度／年齡 | 僅已有上述年齡／性別失業率；其他指標與區級資料仍缺 |
| 起薪與所得 | 起薪、平均薪資、中位數、職類 | 年度／學歷／產業／年齡 | 尚未納入目前 repository |
| 職業訓練 | 課程、參訓人數、完成率、地點 | 課程／行政區／年度 | 尚未納入目前 repository |
| 政策資源 | 就服站、青年據點、補助與服務量 | 點位或行政區／年度 | 尚未納入目前 repository |
| 地圖邊界 | 新北市行政區 GeoJSON／TopoJSON | 行政區邊界 | 尚未納入；人口表有行政區不代表已有地圖邊界 |

### 每個新增資料集的交接清單

以下是未來新增資料的驗收模板，不表示上述兩份 metadata 全部缺漏。團隊若另有未提交資料，應先補入清單與可追溯版本，再決定是否用於比賽。

- [ ] 資料集名稱與原始網址。
- [ ] 提供機關與聯絡窗口。
- [ ] 授權方式與是否允許再利用。
- [ ] 檔案格式、API 文件與下載方式。
- [ ] 資料期間與更新頻率。
- [ ] 地理範圍與最小行政區粒度。
- [ ] 原始年齡定義及能否精確換算為 18–35 歲。
- [ ] 欄位說明、單位與缺值定義。
- [ ] 最後取得時間與資料版本。
- [ ] 已知限制、估算方式及不可直接比較的欄位。
- [ ] 一份可供前後端測試的小型樣本資料。

### 資料驗收條件

- [x] 兩份已安裝資料可追溯官方來源，metadata 說明期間、地理、年齡及不可直接比較的限制。
- [x] 後端相容性檢查及確定性查詢已限制不可拆分年齡組；分析契約已有來源、版本、warnings 與 provenance。
- [ ] 前端實際呈現期間、行政區、年齡、來源、版本與限制，並處理 `partial`／`blocked`。
- [ ] 清理既有示範白板的固定數字及年齡轉換示意；沒有資料依據的加權估算不得呈現為正式結果。
- [ ] 每個新增資料集都通過同樣驗收；缺資料時明示缺口，不補造數字或精確 18–35 歲結論。

## 2. 成果卡片

### 前端進度

- [x] 成果圖示可點擊新增，也可拖入白板指定位置。
- [x] 空白成果卡片與來源選擇。
- [x] 可選擇多張來源卡片，並在白板顯示多條 `來源 → 成果` 連線。
- [x] 圖表類型可選，簡報類型明示尚未提供並停用。
- [x] 成果名稱與 Prompt 設定。
- [x] 已保留 main 的 [Chart Artifact adapter](./src/chart-artifact.js) 與 [六個測試](./test/chart-artifact.test.js)；回應可轉為 `chart`／`table`／`blocked`／`error`。
- [ ] 將 adapter 接入 React 成果卡與真實 analysis API；ECharts 尚未安裝，現有 adapter 只產生繪圖設定，不代表 UI 已繪製後端結果。
- [x] 已停止簡報直接選原始來源及小幫手建立簡報草稿，明示不可用及正確輸入分界。
- [ ] 真實分析結果串接後，再依獨立簡報契約選取已保存 completed／partial 模組，處理 project 權限與下載；目前未實作分析成果選擇器。
- [ ] 圖表設定：指標、維度、篩選與圖表類型。
- [ ] 地圖分級設色圖與點位熱點圖。
- [ ] 簡報頁數、用途、受眾與重點設定。
- [ ] 成果預覽、重新生成、編輯、下載與複製。
- [ ] 每項成果顯示來源、篩選、生成時間與限制。
- [ ] 依 [圖表交接規則](../../docs/frontend-chart-artifact.md) 顯示引用、資料版本、可展開來源紀錄及無障礙資料表；`partial` 保留警告，`blocked` 不繪圖，API 錯誤僅在 `retriable=true` 時提供重試。
- [ ] 支援 `來源 → 圖表成果 → 簡報成果` 的單向連線。

目前成果卡片只把類型、名稱、Canvas 來源節點 ID 與 Prompt 保存在 React 狀態，重新整理後會重置。後端已有結構化分析與圖表規格，但這些結果尚未進入 UI；圖表數值必須來自 `result_data.records`，不能從 AI 摘要猜測。簡報則是另一條尚未提供的生成流程，不應把它視為切換圖表類型即可完成。

### 後端與生成服務

- [x] `POST /v1/analysis` 直接回傳 Contract v0 `AnalysisResult`，包含結構化查詢資料、可選的 visualization、摘要、警告、來源、版本與 provenance；不是圖片或舊版 `AgentResult` 包裝。
- [x] 已定義 `completed`／`partial`／`blocked` 分析狀態及非 2xx `ErrorResponse`，並提供 [正式整合 fixtures](../../contracts/fixtures/frontend-integration/)。
- [x] SQLite 以 `(project_id, module_id)` 保存有效 `AnalysisResult`，需要上游資料時再讀出並轉為 `ModuleContext`；同一 key 更新目前結果，不是獨立的上下文快照或完整版本歷史。
- [ ] 獨立的簡報大綱／頁面內容生成服務。PR #13 是契約提案，不是已實作 endpoint；依 [圖表交接文件](../../docs/frontend-chart-artifact.md) 使用已保存的 completed／partial 分析模組，不直接接 raw Source Nodes。
- [ ] PPTX／PDF 匯出方式與使用套件。
- [ ] 圖表圖片或 SVG 匯出。
- [ ] UI 重新分析流程、成果版本與完整歷史；既有 SQLite 最新分析結果保存不涵蓋這些功能。
- [ ] Notebook／成果編輯設定的名稱、Prompt 與畫布連線保存；不要把這項與 AnalysisResult 已有的 filters、來源及版本混為一談。
- [ ] 下載網址、檔案期限與權限控制。
- [ ] 前端串接已有的分析狀態／錯誤格式；簡報生成失敗與重試依後續獨立契約處理，不自訂尚不存在的 job／polling API。

## 3. 小幫手卡片

### 前端進度

- [x] 小幫手圖示可點擊新增，也可拖入白板指定位置。
- [x] 小幫手卡片可移動、選取與刪除。
- [x] 提供本機訊息顯示、需求輸入框與建議問題；送出後只產生固定的前端操作草稿，不是 AI 回覆。
- [x] 顯示預計建立的圖表草稿及來源數量；簡報草稿不再提供，並顯示限制說明。
- [x] 可由操作草稿建立成果卡片、沿用 Canvas 來源節點 ID，並顯示前端操作摘要；不會產生圖表或簡報內容。
- [x] 已送出的訊息與操作草稿可隨筆記本白板狀態保留至本次頁面使用期間；重新整理後仍會重置。
- [ ] 顯示目前對話可使用的來源與既有成果詳細清單。
- [ ] 停止生成、串流回應、loading、失敗與重試狀態。
- [ ] 刪除、覆蓋或大量修改前的確認畫面。
- [ ] 回答中的來源引用可展開查看。
- [ ] 透過自然語言執行上傳、來源全選、篩選、清理與修改卡片等操作。

目前小幫手不會呼叫模型、讀取或分析來源內容，也不會執行上傳、篩選與資料清理。送出文字只產生固定操作草稿；「建立成果草稿」只建立類型、名稱、Prompt 與 Canvas 來源節點 ID。後端已有研究分析工具，不代表小幫手已串接；圖表需接現有分析契約，簡報則仍待獨立服務。

### AI 與工具呼叫

- [x] 已有 [Research Agent 工具迴圈](../../docs/agent-loop.md) 及明確工具白名單：`search_sources`、`inspect_source`、`check_compatibility`、`calculate_change`、`query_youth_dataset`、`query_population_dataset`。
- [x] 已有 Gemini／Bedrock provider adapters 與 [切換及 smoke test 文件](../../docs/provider-switching.md)；透過 `MODEL_PROVIDER` 明確選擇，不做自動 fallback。
- [ ] 確認比賽實際 provider／model ID、Region、配額與權限，並在目標環境執行真實模型測試；有 adapter 不等於 AWS 已驗收。
- [ ] 建立 notebook-scoped chat API 與對話生命週期；現有分析 endpoint 不是完整聊天服務。
- [ ] 在既有分析工具外，定義小幫手可操作畫布／上傳／簡報的工具、參數與授權，不把 UI 草稿當成已執行結果。
- [ ] 建立來源、成果與節點連線工具。
- [ ] 接上既有資料查詢／篩選與分析能力；另補通用清理、畫布修改及簡報工具。
- [ ] 危險操作的前端確認 token 或 approval 流程。
- [ ] 模型串流方式：SSE、WebSocket 或其他機制。
- [ ] 對話紀錄與工具執行紀錄保存。
- [ ] 將對話訊息、操作草稿與工具執行結果定義為正式後端 schema；目前 TypeScript 型別僅供前端展示。
- [ ] 決定操作草稿是前端暫存資料或後端可恢復的執行計畫。
- [x] 分析 runtime 已限制所選 Registry 來源／filters，並在同一 `project_id` 中查找上游模組；這不是使用者身分驗證或 Notebook 權限檢查。
- [ ] 新增身分驗證後，後端重新驗證使用者對 project、上傳來源與操作的權限，不得只信任前端 ID。
- [x] 後端已有資料相容性與不足時的 warnings／blocked 路徑，查詢值由確定性工具取得。
- [ ] 小幫手 UI 顯示資料缺口與引用，不編造統計結果；新增工具也需遵守同樣限制。
- [ ] 防止資料內容中的 prompt injection 影響系統工具權限。

## 4. 政策雷達

### 前端進度

- [x] 政策雷達固定顯示於白板，尚無來源時也會呈現明確的空白狀態。
- [x] 政策雷達移至左上筆記本標題區塊右側並頂端對齊；收合、展開、側欄切換與白板縮放不改變固定位置。窄視窗空間不足時換行，避免超出畫面。
- [x] 政策雷達可收合但不可刪除，且收合狀態按筆記本分開保存於本次頁面。
- [x] 提供「尚無可盤點來源、等待開始、盤點中、前端盤點完成」四種純前端狀態。
- [x] 提供「開始盤點」與「重新盤點」按鈕；至少一張來源完成檔案或 API 基本設定後才能執行。
- [x] 顯示來源卡片、完成基本設定的來源、成果卡片、已選類型與來源的成果數量。
- [x] 顯示本次頁面的最近執行時間與當次來源／成果數量。
- [x] 來源或成果的前端設定更新後顯示「建議重新盤點」。單純移動卡片或更新小幫手對話不會讓紀錄過期。
- [x] 重新盤點期間保留最近一次紀錄；切換、刪除筆記本或登出時，舊的模擬執行不會回寫到錯誤筆記本。
- [x] 趨勢、資源落差、觀察議題與政策方向區塊明確標示「等待後端分析」，未填入任何虛構結論。
- [ ] 串接後端後補上真正的分析成功、失敗、錯誤訊息與重試狀態。
- [ ] 顯示實際使用的資料版本、篩選快照、來源引用與分析限制。
- [ ] 顯示後端產生的趨勢、資源落差、觀察議題、政策方向與限制內容。
- [ ] 將最近一次成功結果永久保存；目前重新整理頁面或重新登入後會重置。
- [ ] 後端重新分析失敗時保留最近一次成功結果，並提供失敗原因與重試入口。

目前「開始盤點」只會在前端等待約一秒後保存卡片設定數量與設定版本，不會讀取檔案、不會連線公開 API、不會呼叫 AI，也不代表已完成政策分析。

### 後端與分析工作

- [ ] 定義政策雷達的獨立契約與執行 API；是否需要非同步 job 依耗時與團隊設計決定，現有分析 API 沒有雷達專用生命週期。
- [ ] 僅使用已啟用來源與最新結構化分析成果。
- [ ] 不把簡報文字再次當成原始證據。
- [ ] 保存每次執行使用的資料版本與篩選快照。
- [ ] 保存最近一次成功結果；是否保存完整歷史需再決定。
- [ ] 分析失敗時不得覆蓋最近一次成功結果。
- [ ] 政策建議必須與資料觀察、限制及來源一起輸出。

## 白板與工作流共通事項

- [ ] 視需要評估 `@xyflow/react`；這是後續維護選項，不是目前 review 或比賽前必須重寫白板的要求。
- [x] 已定義前端來源／成果／小幫手節點資料結構；來源到成果的關係目前存放在成果設定的 Canvas 來源節點 ID 清單，尚未建立獨立連線資料表或後端契約。
- [x] 本次瀏覽器工作階段內可按筆記本保留節點位置、來源／成果設定、小幫手已送出訊息、操作草稿、來源到成果關係，以及政策雷達收合狀態與最近盤點紀錄；卡片大小目前固定。
- [x] 成果／小幫手草稿已由 `sourceIds` 改為 `sourceNodeIds`，與 SourceConfig 的 `registrySourceId`／filters 分開；未新增後端 module ID 或推測 API 請求。前端資料仍只在記憶體中，無舊資料庫遷移。
- [ ] 將節點、可調整大小與獨立連線資料持久化至後端，並在重新整理或重新登入後恢復。
- [ ] 自動儲存與儲存失敗提示。
- [ ] 工作流版本或復原機制。
- [ ] 節點執行狀態：空白、設定中、等待、執行中、完成、警告、失敗。
- [ ] 卡片刪除、複製與復原。
- [ ] 卡片連線相容性驗證與循環檢查。
- [ ] 多人協作與分享列為賽後項目，除非主辦要求。

白板座標、縮放、平移、尺寸與面板狀態是 UI 資料，不應塞入 `AnalysisRequest`／`AnalysisResult`。後端 [SQLite 模組儲存](../../docs/module-context-storage.md) 預設使用 `var/youthlm.sqlite3`（可由 `YOUTHLM_SQLITE_PATH` 設定），保存分析結果並支援 API 重啟後載入上游上下文；它不保存整本筆記本、登入狀態、小幫手對話或政策雷達紀錄，雲端磁碟持久化也尚待部署確認。

## 正式 API 與尚未設計的服務

### main 已提供的 HTTP 介面

以 [apps/api/main.py](../../apps/api/main.py)、[API 契約](../../docs/api-contract.md) 與 [API 啟動說明](../../apps/api/README.md) 為準，不使用舊版 `app.api` 的 response 包裝。

| 功能 | 方法與路徑 | 回應與前端責任 |
| --- | --- | --- |
| 健康檢查 | `GET /health` | 服務狀態，不代表模型權限／所有外部依賴已通過測試 |
| 共用資料目錄 | `GET /v1/data-sources` | `DataSourceCatalog`，含 `sources: SourceMetadata[]`；目前為兩份已安裝資料，非使用者來源 CRUD |
| 結構化分析 | `POST /v1/analysis` | 直接回傳 `AnalysisResult`；HTTP 200 包含 completed／partial／blocked，非 2xx 使用 `ErrorResponse` |

串接時必須分清：

- `AnalysisRequest` 帶 `contract_version`、`project_id`、`module_id`、`query`、`upstream_module_ids` 與可選的 `source_selections`，依 [正式 request fixture](../../contracts/fixtures/frontend-integration/analysis-request.example.json) 建立請求。
- `source_selections` 是原始 Registry source ID 與 filters；`upstream_module_ids` 是已保存的結構化分析模組 ID，不是 Canvas 來源卡 ID，也不是整份上游 payload。
- Canvas ID／座標／縮放／側欄不屬於分析契約。`project_id` 只提供模組資料範圍，不能取代身分驗證。
- `partial` 仍可有有效圖表，必須保留 warnings；`blocked` 不繪製空圖；正常結果若無 visualization，依 adapter 呈現資料表。
- 依 HTTP status 與 `payload.error.retriable` 決定錯誤／重試 UI，不把安全阻擋當成伺服器錯誤，也不硬套尚未存在的非同步 polling。

### 待設計、不可視為現有 endpoint

登入／註冊、Notebook CRUD、白板保存、上傳／自訂來源註冊、通用 pipeline、Notebook 對話、政策雷達、簡報生成與檔案下載仍需各自確認介面。舊版 `/api/...` 路徑表只是原型提案，本文件不再把它列成串接清單；歷史規劃保留於 [9/1 規劃文件](./docs/frontend-plan-2026-09-01.md)，不得據此實作或要求後端遵循。

簡報提案 PR #13 及資料目錄 fixture PR #14 的狀態見文件頂部。後續使用合併後契約與範例；本次不新增或修改 `apps/api/`、`contracts/`。

## AWS 部署與基礎設施

已有 provider adapters、切換文件及 smoke／preflight 工具；這不代表已完成真實 Bedrock、AgentCore 或前後端整合部署。以下服務名稱是候選方案，除既有程式設定外尚未定案。

- [ ] 確認主辦提供的 AWS 帳號、Region 與可使用服務。
- [ ] 確認前後端是否必須部署在同一個 AWS 帳號。
- [ ] 確認前端託管方案；若採 S3／CloudFront，部署 Vite build 並驗證正式網址。
- [ ] API Gateway、Lambda、ECS 或其他後端執行環境選型。
- [ ] 確認檔案與原始資料的雲端儲存方案（例如 S3），以及 SQLite 或替代資料庫的持久化、備份與多實例限制。
- [ ] 帳號驗證是否使用 Cognito。
- [ ] 若後續工作需要非同步處理，再決定佇列／工作服務；現有 `/v1/analysis` 不要求 Step Functions、SQS 或 job polling。
- [ ] CloudWatch logs、錯誤監控與基本告警。
- [x] API 已設定本機 localhost／127.0.0.1 的 3000、5173 CORS origins，供本機開發使用。
- [ ] 依正式 `/v1/*` 路徑確認反向代理、正式 origin 的 CORS、TLS 與自訂網域，不直接採用歷史 `/api/*` 草案。
- [ ] SPA 路由 fallback，避免重新整理子路徑時出現 404。
- [ ] 前端環境變數與 Secrets Manager／Parameter Store 分工。
- [ ] 建立 development、staging、competition 三種環境。
- [ ] 建立自動建置與部署流程。
- [ ] 測試後端故障時的明示 Demo mode。

前端公開環境變數候選如下；目前尚未接入 API client 或 Demo mode，名稱與行為仍需在串接時定案：

```text
VITE_API_BASE_URL
VITE_APP_ENV
VITE_DEMO_MODE
```

任何 AWS 密鑰、模型金鑰、資料庫密碼或私密 token 都不得放在 `VITE_*` 或提交到 Git。

## 安全性、紀錄與品質

- [ ] 每個 API 都需檢查使用者是否有該筆記本權限。
- [ ] 上傳檔案的格式、大小、惡意內容與公式注入檢查。
- [ ] 敏感資料、個資與不應送進模型的欄位處理方式。
- [x] 研究分析已有執行中的工具 trace／結果 provenance；不等於永久的操作或安全稽核紀錄。
- [ ] 使用者操作與 AI 工具呼叫的持久化 audit log、遮罩與查閱權限。
- [ ] API rate limit、AI token 額度與檔案容量限制。
- [ ] 資料刪除、帳號刪除與保留期限。
- [ ] 前端不可顯示內部錯誤堆疊或敏感設定。
- [x] 後端已有單元、provider、資料、API 契約及模組保存測試定義；此文件更新未重新執行，不以檔案存在宣稱本次測試通過。
- [x] 前端 `npm run check` 已通過型別、build 及 31 個測試；6 個圖表 adapter、15 個白板 ID／狀態、4 個簡報分界、6 個 Tooltip 渲染測試。
- [ ] 補新增 UI／整合案例、自動化瀏覽器測試套件與 CI 品質門檻；一次手動或瀏覽器回歸不等於已有完整 CI／E2E。
- [ ] 1440×900 比賽展示尺寸檢查。
- [ ] 鍵盤操作、焦點管理、對比與螢幕閱讀器標籤。
- [x] `index.html` 已宣告內嵌 SVG favicon，不再把歷史 `/favicon.ico` 404 列為當前缺陷；前次瀏覽器回歸 Console 無錯誤。

## 比賽 Demo 與備援

- [ ] 鎖定完整展示問題。「青年教育程度與起薪水準的關係」仍需補資料；若先用人口／失業率展示，需由團隊確認範圍及限制。
- [ ] 確定展示時實際使用的資料集與版本。
- [x] 已提交兩份固定資料快照、確定性查詢與正式分析 fixtures，可作為重現及離線測試基礎。
- [ ] 依最終展示問題整理固定、可重現的完整分析結果及引用，不把現有 fixtures 當成已完成展示劇本。
- [ ] 所有示範數字需明確標示來源；假資料需標示為 Demo。
- [ ] 將現有 [整合 fixtures](../../contracts/fixtures/frontend-integration/) 接成明示的前端離線 Demo 流程，補足正式展示情境；目前僅供 adapter 測試。
- [ ] Demo mode 必須明確顯示，不能偽裝成即時後端結果。
- [ ] 準備三分鐘與七分鐘兩種展示流程。
- [ ] 比賽前完成一次全新 AWS 環境部署演練。

## 已確定事項與待團隊確認

- [x] repository 為 `Gule7309/youthlm`；已使用前端分支及 PR #12 協作。
- [x] 架構為 `app/` Python 核心、`apps/api/` FastAPI、`apps/web/` React／Vite；JSON schemas、Pydantic models、文件與 fixtures 用於 Contract v0 交接。
- [x] 分析模組採本機 SQLite；Gemini／Bedrock adapters 已存在，切換方式已文件化。
- [ ] 本輪 Tooltip／空白修正的 review／合併、後續 Source → Chart 小 PR 與比賽 release 流程。
- [ ] Cognito 或自建登入。
- [ ] Notebook／白板／對話的保存設計，以及分析 SQLite 在 AWS 的儲存、備份或替代方案。
- [ ] 比賽使用的模型、provider、權限、配額與真實執行驗收。
- [ ] n8n 目前是白板互動參考，是否真的導入其執行引擎須另確認，不能當成已選定後端依賴。
- [ ] 原始資料清單與每個資料集的負責人。
- [ ] 是否另找可精確描述 18–35 歲的資料，以及展示範圍；既有不可拆分年齡組／不造數值規則已確定。
- [ ] 地圖邊界來源與地圖套件。
- [x] 圖表以 AnalysisResult 結構化 records／visualization 與既有 adapter 交接。
- [ ] 圖表匯出格式及簡報契約、生成／下載服務；PR #13 尚待合併與服務實作。
- [ ] 檔案上傳大小與保存期限。
- [ ] 政策雷達是否只保存最新結果或保留完整歷史。
- [ ] 主辦 AWS 平台的服務限制與部署截止時間。

## 交接原則

現有分析／目錄以正式契約為準；新增服務在串接前至少需要以下資訊，不另外自創與 main 衝突的 API：

- Request method、path、headers 與 body。
- 成功 response 範例。
- 驗證失敗、權限不足、資料不存在、驗證錯誤與伺服器錯誤格式。
- 若採非同步，才定義工作 ID、狀態、取消與錯誤格式。
- 依功能需要定義分頁、排序與篩選方式。
- 時間格式、時區與檔案網址期限。
- 對應的前端 loading、empty、error 與 retry 狀態。

有正式契約但尚未串接時，前端 mock 應使用對應 fixtures；尚無契約的功能明示「前端草稿／尚未提供」，不要假裝已執行 AI 或已保存到後端。Canvas ID 分離及簡報不可用修正已以 `24b7f5d` 推送；目前補 Tooltip 零值與空白修正，待本輪 PR 重新 review／合併後，再以獨立小 PR 串接 Source → Chart。
