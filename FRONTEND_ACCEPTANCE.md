# YouthLM 最終一次驗收（2026-09-11）

正式專案：`C:\Code\youthlm-test`。這份清單只保留最後一次人工驗收需要做的事；完整限制與歷史在 [BACKEND_TODO.md](BACKEND_TODO.md)。

## 驗收範圍

目前可完整操作：預覽登入與筆記本、官方來源與多維篩選、白板拖曳連線、來源分析、可追溯圖表／表格／警告、分析彙整簡報、PPTX 下載、本機草稿、Ctrl＋滾輪縮放、點空白處收合，以及政策雷達盤點。

以下仍不是完成品：真實帳號／雲端筆記本、任意檔案上傳與 API 清洗、跨資料集 Join、小幫手自由操作、政策雷達 AI 建議。預覽密碼不傳送也不保存；不要使用真實密碼。新帳號不會再顯示任何虛構教育、薪資或職訓統計。

## 啟動無金鑰驗收環境

這是完整 UI／HTTP／資料工具／PPTX 整合模式，但摘要文字是測試替身，**不是 AI 政策結論**。

終端一：

```powershell
cd 'C:\Code\youthlm-test'
uv run --frozen python apps/web/test/fixture-api.py
```

終端二：

```powershell
cd 'C:\Code\youthlm-test\apps\web'
$env:VITE_YOUTHLM_API_BASE_URL = 'http://127.0.0.1:18000'
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

開啟 `http://127.0.0.1:5180/`。已有相同服務時不要重複占用 port。

## 最後一次人工檢查（約 10 分鐘）

1. 使用新的測試電子郵件與任意至少 8 字元測試密碼登入。畫面應顯示「建立第一本政策筆記本」，沒有預設假資料。建立並開啟「最終驗收」。
2. 新增來源，選「現住人口之年齡分配」，命名「板橋青年人口」。設為 **2022–2024、20–24 歲、合計（官方值）、板橋區**後儲存。
3. 新增空白成果，從來源右側藍點拖到成果左側。成果應自動成為圖表且打開設定。輸入「比較板橋區2022至2024年20至24歲人口趨勢」並執行。
4. 圖表／表格應依序出現 **28,472、28,174、27,049**，並保留來源、實際篩選、版本及限制。若結果被阻擋或失敗，不得畫出假圖。
5. 新增空白成果，從完成圖表右側紫點拖入；它應自動成為簡報並選取該分析。產生、下載並開啟 PPTX，確認文字、圖表、資料表、來源及警告可編輯且不是前端截圖。
6. 編輯任一卡片後點白板空白處，設定面板應收合；Ctrl＋滾輪、＋／－、全覽、移動卡片後的藍／紫連線都應正常。放開在錯誤端點不得建立關係。
7. 展開政策雷達並執行盤點，確認來源、圖表及簡報數量合理。返回筆記本列表再重開：雷達應自動收合、所有卡片應自動全覽且不被畫布邊緣截切，最近一次雷達紀錄仍在。
8. 重新整理並用同一測試電子郵件登入，筆記本、卡片、位置、設定與連線應保留；分析／簡報執行結果需重跑，不能假裝從本機草稿還原。
9. 信任邊界抽查：改用 **2013、5–9 歲、樹林區**執行人口分析，系統應明確拒絕該已知官方異常組合，不可自行補數字。改回其他年度或年齡後可正常執行。
10. 開啟瀏覽器開發者工具 Console；正常流程應沒有紅色應用程式錯誤。

## 自動品質閘門

從 repo 根目錄執行：

```powershell
uv run --frozen python -m app.data_quality
uv run --frozen python -m pytest -q
uv run --frozen ruff check .
cd apps/web
npm run check
npm audit
```

這些檢查涵蓋資料 hash／schema／coverage、Python 契約與 API、前端型別／正式建置／測試，以及相依安全公告。數量以指令當下輸出為準，避免文件數字再次過時。

## 真實 AWS 不是這次本機 UI 驗收

`/health` 200 只代表程序存活；`/ready` 200 只證明 provider 設定存在、封裝資料可用且目前儲存目錄可寫，不能單獨證明 Bedrock IAM 或持久化。必須另讓 event-day Bedrock preflight 全過，並以同一 `/data` volume 重建單 worker／單 replica 容器後取回既有分析與 PPTX，才能宣稱正式流程已就緒。Access Code 只用於 AWS Workshop portal，不是應用密碼或 API 憑證。正式步驟見 [docs/final-environment-runbook.md](docs/final-environment-runbook.md)。
