# YouthLM 前端互動原型與圖表交接模組

這是 YouthLM 的 React／Vite 前端，包含筆記本、流程白板、來源卡、成果卡、右側 AI 小幫手與政策雷達。Source Node → Chart Artifact 已串接正式的 `GET /v1/data-sources` 與 `POST /v1/analysis`：使用者可選擇已安裝資料集與篩選條件，呼叫 Research Agent，並在成果設定面板看到 ECharts 圖表、表格、摘要、來源、警告或錯誤。登入、整本筆記本的雲端保存、檔案上傳、任意 API、AI 小幫手與政策雷達仍是前端原型。

## 9/11 最新狀態與驗收入口

已整合 main `83b37f5` 的分析／執行紀錄／簡報功能，保留來源卡內的複選篩選器。每張 Contract v0 圖表只使用一張來源卡；多份分析可由簡報彙整。本輪另完成卡片端點拖曳、藍／紫連線、低縮放命中區、獨立分析 run ID、過期回應防護、API 逾時、PPTX 驗證下載及本機草稿保存。

9/11 收斂移除了新帳號原有但無資料支撐的教育／職訓示範統計；沒有草稿時從空白筆記本清單開始。第一本筆記本會顯示四步操作教學，可略過、直接開始選資料並由頁首重開，完成狀態隨本機草稿保存。全站頁首提供小／中／大／特大四檔文字大小，原始 14px 尺寸定義為小，選擇保存在目前瀏覽器。白板預設收合左右面板，沒有可盤點資料時不顯示政策雷達，空白頁只保留「選擇官方資料」主要動作。來源卡可直接建立已連結圖表，完成圖表可直接建立已連結簡報；拖曳端點仍保留為進階編排。已完成圖表會在成果卡直接顯示實際 ECharts 縮圖（缺少 visualization 時顯示實際資料表）與摘要；已產生簡報會顯示封面摘要、分析數量、PPTX 狀態與檔案大小。真正逐頁投影片縮圖仍待後端預覽契約，不會由前端假造。快捷流程採來源→圖表→簡報水平排列，全覽不會把小流程放大超過 100%。卡片本體不會自動開啟設定或觸發拖移，只有鉛筆按鈕進入編輯、右上拖移把手移動卡片。AI 小幫手改為筆記本右側聊天室，會顯示目前畫布上下文，操作草稿需確認才加入白板；舊草稿中的多張小幫手卡會整併為單一側欄對話且不計入卡片數。政策雷達每次開啟筆記本預設收合且會計入圖表與簡報，避免遮住卡片。前端正式相依已更新，完整 `npm audit` 為 0。

完整啟動、無金鑰 UI 驗收及檢查步驟見 [根目錄驗收文件](../../FRONTEND_ACCEPTANCE.md)，當前剩餘事項見 [根目錄 BACKEND_TODO](../../BACKEND_TODO.md)。

**本機草稿不是雲端保存或真實登入；分析／簡報結果在重整後須重跑。目前正常 API 的模型尚未設定，僅目錄可直接驗收；獨立 fixture 模式不代表 AI／AWS 通過。**

以下有日期或標示「歷史」的段落保留當時修正脈絡，最新行為以上述驗收文件為準。

## 9/7 歷史：官方資料目錄與篩選器

來源卡的「官方資料集」現在直接讀取 `GET /v1/data-sources`，不使用假資料備援。可設定年份、年齡、性別；人口資料另可選地區。儲存的是目前頁面的 `registrySourceId` 與 `filters`，**尚未呼叫分析 API，也不會在重新整理後還原白板**。

本機人工檢查需同時啟動兩個終端（此目錄端點不需要模型金鑰）：

```powershell
# 終端一：repository 根目錄
uv sync --frozen --dev
uv run --frozen python -m uvicorn main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

```powershell
# 終端二：repository 根目錄
cd apps/web
npm run dev
```

前端預設使用同源 `/v1/data-sources`，開發時由 Vite 轉送到 `127.0.0.1:8000`。API 不在此位置時，可於 `apps/web/.env.local` 設定 `VITE_YOUTHLM_API_BASE_URL=https://你的API主機`，然後重啟 Vite；值是 API 根位址，不包含 `/v1/data-sources`。此變數公開於瀏覽器，不可放金鑰。repository Dockerfile 會把正式 build 與 API 放在同一 origin，因此保持空白；只有分離託管才需 HTTPS API 位址及後端精確 CORS allowlist。Vite 開發代理不會進入正式建置。

人工驗收：

1. 登入前端預覽帳號、開啟筆記本、新增來源，點「官方資料集」。確認列出失業率與人口兩份資料，能查看機關、單位、年份、官方連結及限制。
2. 選失業率：只提供 25–29、30–34 歲及男／女；地理範圍固定全市，不提供行政區或男女合計。選 2022–2024 年、25–29 歲、女，儲存並收合再開啟，條件應相同。
3. 改選人口：條件重設為最新年度、25–29／30–34 歲、官方合計及全市；可複選行政區。修改後儲存、切換其他卡片再返回，條件應保留；來源卡顯示「已設定，尚未分析」。
4. 清除全部年齡、設定起始年晚於結束年，或全選人口年齡／性別／地區使預計筆數超過 500：畫面應說明原因且不能儲存。縮小條件後恢復可儲存。
5. 修改來源名稱後點白板空白處收合，再開啟應保留未儲存草稿。返回列表複製筆記本，修改副本的地區並儲存，原本筆記本不應受影響。
6. 停止 API 後點「重新載入目錄」：應顯示錯誤而非假資料、不能儲存；重啟 API 並點「重試載入」，條件草稿仍應保留。重新載入也不應覆蓋已選的篩選條件。

`npm run check` 本步通過型別、建置及 49 個測試（新增 15 個目錄／篩選／HTTP 測試及 3 個 Registry 保存回歸）。原有上傳檔案與公開 API 仍只記錄 metadata／網址，沒有新增上傳、清洗、AI、資料庫或 AWS 功能。

## 既有前端啟動與歷史驗收

正式前端目錄為 `apps/web/`，React UI 與原有的 Chart Artifact 交接模組共同放在這個 application 中。既有 Python 核心留在 `app/`，FastAPI application 留在 `apps/api/`；不再保留 `app/web/` 作為第二套前端。

使用 Node.js 20 以上版本與 npm。從 repository 根目錄執行：

```sh
cd apps/web
npm ci
npm run dev
```

請先在另一個終端用根目錄的 `scripts/run-gemini-api.ps1` 啟動 API，再開啟 Vite 顯示的網址（通常是 `http://localhost:5173/`）。開發伺服器會把 `/v1` 轉送至 `http://127.0.0.1:8000`；若部署時 API 不在同一個 origin，可設定 `VITE_YOUTHLM_API_BASE_URL`。

執行完整前端品質檢查：

```sh
npm run check
```

這個指令依序執行 `npm run typecheck`、`npm run build`、`npm test`，任一步失敗都會停止並回傳非零退出碼。也可分別執行三個指令定位問題；型別檢查成功時不一定有額外訊息，會直接回到終端提示符號。

產物位於 `apps/web/dist/`，不提交到 Git。沿用 `package-lock.json` 與 npm；保留的 `pnpm-workspace.yaml` 是原始匯出設定，尚未建立 pnpm lockfile 或 repository 級 JavaScript workspace。

`tsconfig.json` 對全部 `src/**/*.ts`、`src/**/*.tsx` 及 `vite.config.ts` 啟用 `strict`／`noEmit`，涵蓋未被目前畫面引用的 UI 元件；只略過第三方宣告檔的內部檢查，不略過本專案程式碼。無框架 JavaScript 圖表模組維持由原有六個 Node tests 驗證。

React／ReactDOM 18.3.1 已列為應用程式直接依賴，React 型別也固定為相容的 18.x。Vite 使用 `import.meta.url`／`fileURLToPath` 計算專案路徑。單獨執行 `npm run build` 仍只代表建置成功，請使用 `npm run check` 完成整組品質檢查。

## 人工驗收（型別檢查這一步）

請在 `apps/web` 的終端執行 `npm run check`，確認沒有 `error TS...`、建置錯誤或失敗測試。目前包含圖表／簡報契約、卡片成果預覽、文字偏好、導引流程、白板狀態、端點連線、草稿保存、來源目錄、錯誤韌性、Tooltip 與 request mapping，共 96 個測試。若要重測乾淨安裝，先停止原本的開發伺服器，再執行 `npm ci` 與 `npm run check`。

啟動 `npm run dev`，開啟終端顯示的網址，檢查：

1. 用測試用電子郵件與至少 8 個字元的密碼登入，建立一本空白筆記本。帳號仍是前端模擬，不會傳送到後端。
2. 新增一張來源卡，選「已安裝資料集」、資料集與篩選條件後儲存。
3. 卡片可拖動，`Ctrl`＋滾輪可縮放，政策雷達仍固定在左上標題右側，展開／收合正常。
4. 在右側 AI 小幫手輸入圖表需求，確認畫布操作草稿後，白板應新增已連結圖表且聊天室保持開啟。再按圖表鉛筆、執行分析，確認完成卡片直接呈現實際圖表／資料表與摘要；建立並產生簡報後，卡片直接呈現封面摘要、PPTX 狀態與檔案大小。Blocked/error 不得顯示假成果，Console 沒有新的紅色錯誤。

重新整理後以相同預覽電子郵件登入，會還原已儲存的筆記本、卡片、位置與連線；分析與簡報執行結果仍需重跑。Canvas ID、Registry ID 與後端 run ID 已分離；簡報只使用已完成／部分完成分析，不直接使用原始來源。

## Tooltip 零值回歸與 PR 空白檢查

從 `apps/web` 執行 `node --test test/chart-tooltip.test.js`，應有 6 個測試通過。測試直接渲染真正的 Tooltip，確認 `0` 位於有樣式的數值 `<span>` 中、正負數維持格式化、缺值省略，以及自訂 formatter 仍收到零值。元件目前尚未接到白板圖表，因此這一步沒有新增可從白板開啟的 Tooltip 測試畫面。

除了 `npm run check`，PR 提交後還要在 repository 根目錄執行：

```sh
git diff --check origin/main...HEAD
```

必須為 exit code 0。單獨的 `git diff --check` 只看未暫存差異，工作目錄乾淨時不會檢查 PR 中已有的空白問題。若修正尚未提交，可先執行 `git merge-base origin/main HEAD` 取得基底 SHA，再以 `git diff --check <基底SHA>` 檢查包含本機修改的已追蹤檔案；新增檔案需另外檢查，提交後仍需重跑上述三點比較指令。

## 卡片 ID 與資料來源 ID

- `CanvasNode.id`：白板節點的識別碼；圖表與右側小幫手操作草稿透過 `sourceNodeIds` 連到來源卡片。Contract v0 現階段每張圖表最多一個 raw source。
- `SourceConfig.registrySourceId`：後端 Source Registry 的正式資料集識別碼；只由「已安裝資料集」選擇器設定。
- `AnalysisExecution.moduleId`：每次分析獨立的後端 run ID。簡報可在 `sourceModuleIds` 保存多個 Canvas 圖表連線，送出時才逐一解析為同一 project 下最新完成的 run ID；Canvas ID 不會當成 `source_selections` 或後端 run ID 送出。
- `SourceConfig.filters`：送進 Contract v0 `source_selections[].filters` 的篩選條件。Canvas ID、x/y、zoom 等 UI state 不會進入 API request。

複製筆記本只重建 Canvas ID 與連線，保留 Registry ID 並深拷貝篩選條件。一般來源名稱／啟用／清理選項編輯會保留既有綁定；更換檔案 metadata、來源方式或 API 網址則清除舊綁定及 filters。這是目前 metadata 原型的防護，真正上傳後仍需後端提供版本／內容識別，不能只靠檔名與大小判斷資料一致。

### 人工驗收（ID 分離）

1. 先啟動 YouthLM API，再重新整理頁面並建立測試筆記本。新增兩張來源，使用「已安裝資料集」各自選擇資料與篩選條件並儲存。
2. 為每張來源各新增一張空白成果，從來源右側藍色端點拖到成果左側；成果應自動成為單一來源圖表。重新把另一來源拖到既有圖表時會取代舊來源，不會建立 Contract v0 無法執行的多來源圖表。
3. 完成至少一張分析後新增空白成果，從圖表右側紫色端點拖入；成果應自動成為簡報並引用該分析。也可使用成果面板的已連結簡報捷徑。
4. 從右側小幫手建立圖表草稿；有兩張來源時應建立兩個單一來源草稿，確認後才加入白板。返回列表建立筆記本副本，再刪除副本中的來源／圖表，確認關係同步清理且原筆記本不受影響。

程式測試另涵蓋 Registry 綁定／巢狀 filters，包含複製後互不影響、替換資料清除綁定、request mapping 及雷達過期判斷。`npm test` 使用 Node 內建 runner；完整測試需先 `npm ci`，純前端測試不需模型金鑰。

## 簡報輸入分界與人工驗收

圖表使用原始資料來源；簡報只使用同一 project 內已完成／部分完成的結構化分析。新卡可選「洞察簡報」，也可由完成的圖表按「用這份分析建立簡報」。

1. 先完成 Source → Chart，確認數據、警告、實際篩選與來源。
2. 新增簡報並選取已完成分析，或使用已連結簡報捷徑。
3. 產生後下載 PPTX；前端核對下載位址、檔案大小、PPTX 檔頭及 SHA-256。
4. 更新來源／圖表或重新分析，舊簡報必須失效；重新整理後先重跑分析，不能只憑卡片名稱產生簡報。

## Chart Artifact 交接模組

保留從 main 合併的無框架模組 `src/chart-artifact.js` 與 `test/chart-artifact.test.js`，包含六個使用正式契約 fixtures 的測試。不需 AI、API、資料庫或模型金鑰；若尚未安裝前端依賴，可單獨執行 `node --test test/chart-artifact.test.js`。請在完整 repository 中執行，因為測試會讀取根目錄 `contracts/fixtures/frontend-integration/`。

`buildChartArtifactView(payload, { httpStatus })` 把 Contract v0 回應轉成四種明確狀態：

- `chart`：使用 Apache ECharts 呈現 `chartOption`，並保留摘要、警告與來源。
- `table`：呈現宣告的資料欄位與確定性查詢結果。
- `blocked`：顯示無法分析的原因，不繪製空圖。
- `error`：顯示 HTTP／API 錯誤，只有 `retriable` 為 true 時提供重試。

React 成果設定面板已使用 Apache ECharts 呈現 `view.kind === "chart"` 的結果；`partial` 結果保留警告，`blocked` 不畫空圖，HTTP/API error 會明確顯示。圖表數值只取自 `result_data.records`，不從 AI 摘要猜測。

詳細規則見 [圖表交接文件](../../docs/frontend-chart-artifact.md)，包含互動、可追溯性、無障礙與未來簡報輸入的分界。UI 的座標、縮放、側欄與節點尺寸不屬於後端分析契約。

## 串接與交接文件

- 正式前後端資料格式以根目錄的 [contracts](../../contracts/README.md) 與 [前端整合契約](../../docs/frontend-integration-contract.md) 為準。
- [BACKEND_TODO.md](./BACKEND_TODO.md) 已依 2026-09-06 的 main／PR 狀態校正，分開後端已實作、前端未串接及待設計事項，並列出兩份官方資料的範圍與缺口；不把本機分析保存或 provider adapter 視為整本筆記本恢復或 AWS 已驗收。
- [PR #12 review 回覆與交接清單](./docs/pr-12-review-response.md) 對照第一輪六項 review 要求、已執行檢查，以及下一個 Source → Chart PR 的範圍；已隨 `24b7f5d` 推送，保留提交時的紀錄。最新修正進度以 BACKEND_TODO 為準。
- [9/1 前端規劃](./docs/frontend-plan-2026-09-01.md) 是歷史提案，其中的 API 路徑、架構與功能優先序不視為目前已凍結的契約。
- Source → Chart 與 Chart → Presentation 已接上正式契約及端點拖曳。Assistant API、檔案上傳、政策雷達分析與 AWS 部署仍是後續獨立 checkpoint。

## 原始設計與授權

原始 UI 匯出自 [YouthLM Workspace Layout](https://www.figma.com/design/23TpgZBRzPcl0lMrW7Vrq1/YouthLM-Workspace-Layout)。第三方資源說明見 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)。

私人錄音、逐字稿、模型、環境秘密、套件目錄與建置產物不在提交範圍。
