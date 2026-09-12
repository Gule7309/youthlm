# 比賽前整合與未完成事項

最後更新：2026-09-12。這份是 repo 根目錄的**目前狀態入口**；完整歷史與模組細項保留於 [apps/web/BACKEND_TODO.md](apps/web/BACKEND_TODO.md)。歷史日期的「未串接」不代表現在狀態。

## 9/11 最終驗收前收斂

- [x] 以隊友最新 `codex/source-catalog` 整合分支為底，納入 PR #24／#25 的 project-scoped Assistant、可編輯 DOCX Report 與下載端點；保留空白新帳號、資料稽核、同源容器、端點拖曳及遲到回應防護。
- [x] 修正整合後的 Chart → Report 拖曳型別、Report 取消／逾時／過期回應防護、Report 雷達計數與 Assistant 遲到回應；正式 preflight 現在也會呼叫 live Assistant 並核對三項明確引用。
- [x] 依 2026-07-22 正式競賽規範加入 `us-east-1`／`us-west-2` 區域防線與 Bedrock 1.05 秒呼叫間隔；Supported Services 清單包含目前候選部署所需的 Bedrock、EC2／ECS／ECR、ELB、IAM、Logs、S3、CloudFormation、Secrets Manager 與 SSM 動作。清單不代表比賽帳號實際 role 一定已授權。

- [x] 兩份安裝資料已加入 fail-closed 稽核：快照 hash、schema、列數、維度覆蓋、缺值、重複、數值範圍及人口加總一致性。人口 2,250 列與失業率 76 列皆無阻斷錯誤。
- [x] 官方人口快照的 2013 年樹林／鶯歌／汐止、5–9 歲已列為已知限制；保留原值、不自行補值，該組合會在模型執行前回 422，其他年度／年齡仍可使用。
- [x] 失業率官方 21 欄寬表的正規化已程式化，固定將 `item value4`–`item value7` 轉成 25–29／30–34、男／女長表；會先驗官方 raw hash，來源或 schema 改變即停止。本機用官方快照已精確重現已安裝 CSV。
- [x] 修正 Analysis compatibility scope：多個相鄰年齡群以完整範圍檢查；只有與使用者明確問題範圍相符的拒絕可產生 blocked result，不相關的 18–35 拒絕不能冒充已選資料檢查。
- [x] 移除新帳號中的虛構教育／職訓統計與預設白板；舊本機草稿會移除不可新增的 legacy 示範節點，保留使用者來源與成果，並把既有小幫手對話及明確引用整併到筆記本右側聊天室。政策雷達重開筆記本預設收合，且正確計入圖表、報告與簡報。
- [x] 新增 status-only `/ready`、精確 CORS allowlist、IAM role 相容的 Bedrock readiness、完整資料／前後端 preflight，以及 same-origin 單容器骨架。映像固定一個 Uvicorn worker、非 root 使用者，狀態路徑指向 `/data`；正式環境仍必須另外掛載可持久化 volume，Dockerfile 不會代替 AWS 儲存設定。
- [x] 移除未使用且有安全公告的 `react-router`，升級 ECharts 6.1.0 與 Vite 6.4.3；目前 `npm audit`（含 dev）與 production audit 都是 0 vulnerabilities。
- [x] 自動化驗證涵蓋完整 Python、Ruff、前端 typecheck/build/tests、資料 audit、正式靜態前端與 API 同源路徑。9/12 整合結果為 Python 218/218、前端 110/110、`npm audit` 0 vulnerabilities；先前正式同源 smoke 的首頁、實際 JS/CSS、`/health`、`/ready`、`/v1/data-sources` 皆為 200。
- [x] 新增一般使用者導引路徑：空白筆記本直接選官方資料、來源卡一鍵建立已連結圖表、完成圖表一鍵建立已連結簡報；拖曳端點保留為進階操作。快捷建立採來源→圖表→簡報水平排列，全覽不會把小流程放大超過 100%。
- [x] AI 小幫手由畫布卡片改為每本筆記本唯一的右側聊天室；已串接 notebook-scoped Assistant API，可明確選取來源／分析／簡報，並顯示實際引用數與工具執行數；既有固定前端草稿仍必須經確認才會建立已連結圖表。
- [x] 收斂首次進入白板的視覺：左右面板預設收合，沒有可盤點資料時隱藏政策雷達，空白畫面只保留一個主要動作；第一本筆記本提供可略過、可重開且本機保存完成狀態的四步操作教學。
- [x] 已完成的圖表成果會在卡片內直接渲染實際 ECharts 縮圖（無 visualization 時顯示實際資料表）與摘要；已產生簡報會直接顯示封面摘要、分析數量、PPTX 狀態與實際檔案大小，不必先開右側設定。
- [x] 新增全域文字大小設定：小（原始尺寸）、中、大、特大；登入、筆記本、教學、白板卡片與設定面板同步調整，獨立保存在瀏覽器本機，不寫入帳號或後端。
- [ ] Assistant 串流回覆、可取消的伺服器端工作與受控畫布 mutation 工具；目前已有真實 Agent API、明確上下文與工具紀錄，但不是串流且不會自行改寫畫布。
- [ ] 後端若要提供真正的簡報頁面縮圖／線上預覽，需新增投影片縮圖或 PDF 預覽契約；目前 PresentationResult 只有 PPTX metadata／下載資訊。另待加入白板文字、畫筆、選取／刪除、復原／重做與 AI 可讀取的畫布註記格式。
- [x] 最終 Playwright fixture 流程已完成：全新帳號／筆記本、人口篩選、藍／紫端點連線、真實資料工具圖表、可驗證 PPTX 下載、政策雷達、縮放、空白收合、窄畫面、重新登入草稿還原，以及 2013 已知異常的中文拒絕。Fixture 只取代模型摘要，不代表真實 Bedrock 已驗收。
- [x] 修正開啟含負座標或畫面外卡片的筆記本會被上緣截切：重開時自動全覽，但不改寫使用者保存的無限畫布座標；收合設定區使用真正 `inert`，ECharts 只在容器具尺寸後掛載，避免隱藏面板警告。
- [ ] **外部阻斷：** 此電腦沒有 AWS CLI v2，Docker Desktop 服務也無目前使用者權限啟動；因此 Docker image、AWS 帳號／Region／IAM、真實 Bedrock 與部署 URL 尚未實機通過。Access Code 已取得，但不得把它寫入 repo 或當成應用登入憑證。
- [ ] 使用者依 [FRONTEND_ACCEPTANCE.md](FRONTEND_ACCEPTANCE.md) 手動驗收真實 Bedrock 與瀏覽器流程；不再把 fixture 或 Codex 代驗視為正式通過。

## 9/10 白板拖曳連線，等待人工驗收

- [x] 修正來源卡以 Tailwind `w-80` 受 14px 根字級換算成 280px、但 SVG 仍按 320px 計算所造成的約 40px 端點錯位；來源卡、成果卡與連線現在共用同一組像素尺寸及座標函式，移動或縮放後仍會同步。
- [x] 完成實際端點拖曳：`來源 → 空白／圖表成果` 會建立單一來源圖表，`圖表成果 → 空白／簡報成果` 會建立或追加簡報輸入；空白成果會依上游自動轉成正確類型。
- [x] 連線使用既有 `sourceNodeIds`／`sourceModuleIds` 保存，不新增另一份 edge 狀態；重新登入本機草稿、複製與刪除仍沿用同一關係。來源重接會取代舊來源並清除過期圖表及下游簡報結果。
- [x] 來源連線統一為藍色，分析到簡報統一為紫色；拖曳預覽、合法目標、完成線段一致。30% 全覽時以固定 22px 螢幕邊界擴大命中區，視覺圓點不需精準點中。
- [x] 補上 pointer ID 隔離、Esc／未命中取消、重複與不合法方向提示、提示自動消失，以及損壞本機草稿的懸空來源引用檢查。
- [x] 小幫手遇到多個來源時改為每個來源各建一張單來源圖表草稿，符合 Contract v0，不再建立一張無法送出的多來源圖表。
- [x] Playwright 實測兩種拖曳方向、30% 低縮放寬鬆命中、卡片移動、設定同步、本機還原、分析與 PPTX 產生；藍／紫線端與實體端點中心誤差皆低於 1px，Console 0 error／warning。
- [ ] 使用者依 [FRONTEND_ACCEPTANCE.md](FRONTEND_ACCEPTANCE.md) 的「白板拖曳連線」步驟人工驗收；本輪尚未 commit 或 push。

## 9/10 `agent_protocol_error` 修正，等待真實模型驗收

- [x] 確認畫面錯誤是後端 HTTP 502，不是 CORS／網路錯誤。正式 Agent 現在會在模型提早回答時留在同一對話，依序要求補做 `check_compatibility` 與完全保留來源篩選的 deterministic query；仍不會顯示未驗證的模型文字。
- [x] 篩選陣列改以集合語意核對，只有順序不同不再誤判；缺項、多項、來源或年度不同仍拒絕。provenance 改記錄資料工具實際套用後的標準化查詢參數。
- [x] Contract v0 的單一 AnalysisResult 實際只承載一個資料集，因此圖表來源暫時改為單選。前端 request builder 與 API 都會在送模型前攔截多來源；跨來源展示請先建立多張分析，再由簡報彙整。真正 join／交叉統計仍列 P1，沒有冒充完成。
- [x] 測試 fixture 改為依任意合法的單一來源與 filters 呼叫 repository 正式資料工具，不再固定板橋／20–24／2022–2024；人口與失業率不同條件皆有回歸測試。
- [x] 分析錯誤畫面顯示該次 backend module ID，後端 protocol／mapping traceback 同時記錄 project 與 module ID，方便兩端對照。
- [x] 修正 `SQLiteModuleStore` 在 Windows 只結束 transaction、沒有關閉連線的問題；成功、初始化失敗與損毀資料列路徑皆確認釋放 handle。最新完整 Python 測試 105/105、Ruff、前端測試、typecheck 與 build 通過。
- [x] 瀏覽器以動態 fixture 驗證「新店區、25–34 歲、女性、2020–2021」得到正式資料工具的 4 筆結果與圖表；POST 200，Console 0 error／warning。
- [x] 已重啟 8000 與 18000 載入新版程式；8000 smoke test 為 health 200、2 筆來源目錄，多來源防線回 422 `dataset_error`。目前 8000 仍未帶模型金鑰。
- [ ] 設定真實 Gemini／Bedrock 後，以同一展示題目連跑至少 5 次，核對每次工具順序、filters、rows、warnings 與 provenance；fixture 通過不代表模型或 AWS 已驗收。
- [ ] 比賽後或契約升版：由伺服器根據選定來源直接執行 compatibility／query，模型只摘要可信 rows；另新增 structured claim scope 與真正多資料集 join，進一步移除 LLM 工具選擇的不確定性。

## 9/9 已完成，等待使用者驗收

- [x] 同步 main `83b37f5`（含 #18 分析、#21 執行說明、#22 簡報、#23 一鍵啟動），保留來源維度複選篩選器與人口 500 筆防護。9/9 當輪未改後端、契約、原始資料或 AWS 設定；9/10 修正另見上節。
- [x] 來源 → 分析 → 圖表／表格／警告／來源與版本 → 選取已完成分析 → 生成及下載 PPTX。
- [x] 每次分析使用獨立後端 module ID；簡報卡內的 Canvas 連線會解析為最新可用的 run ID，不直接拿 Canvas ID 當後端分析 ID。
- [x] 來源／設定修改、刪除、重新分析後清除過期下游結果；停止等待、切換筆記本及登出時，遲到回應不得重新填回 UI。分析前重新核對真實目錄與篩選條件。
- [x] 分析／簡報約 120 秒等待上限、手動重試與中文錯誤；無自動重送昂貴 POST。停止等待不代表後端中止。
- [x] PPTX HTTP 錯誤、下載重試、位址限制、檔案大小／PPTX 檔頭／SHA-256 驗證。
- [x] 完成分析後一鍵建立已連結簡報卡；加寬成果面板、圖表渲染失敗時保留資料表、來源連結、表格單位與繁體中文呈現、縮放控制避開右側面板。
- [x] 本機草稿保存與還原：筆記本、已存卡片設定／位置／連線、已送對話草稿、雷達最近盤點。沒有帳號登入、雲端資料庫或分析歷史；不保存密碼。讀取損毀不覆蓋原草稿，儲存受限／空間不足會提示。
- [x] 新增獨立測試服務 `apps/web/test/fixture-api.py`；9/10 已由固定 golden path 升級為依合法單一來源 filters 動態執行真實資料查詢與 PPTX 生成，並明示假模型，不影響正常 8000 API。
- [x] 前端 tests + typecheck + build，後端整合 fixture 測試；Playwright 完整流程及錯誤／過期狀態回歸。最新數量、步驟與驗證範圍見 [FRONTEND_ACCEPTANCE.md](FRONTEND_ACCEPTANCE.md)。
- [ ] 使用者人工驗收。本輪未新建 commit、push 或 PR；原未提交內容仍保留備份 stash。

## P0：9/12 前必須與後端同學完成

1. **設定並驗證真實模型。** 9/9 本機 8000 的分析仍為 503 / `provider_unavailable` / 模型未設定；health 200 不是 AI 成功。後端負責模型、金鑰／配額與重啟；前後端一起重跑主流程，核對數值及警告，不只看回答有文字。
2. **AWS 實機演練。** 確認比賽帳號、Region、Bedrock 模型權限、憑證期限、網路、HTTPS、CORS／反向代理、前端 API 位址，以及 SQLite／PPTX 儲存可寫且重啟後可取回。以 `docs/final-environment-runbook.md` 為準，本輪未部署。
3. **凍結可證實的展示題目。** 現有兩份資料是人口與年齡別失業率，不能宣稱已能回答「教育程度與起薪相關性」。優先使用板橋青年人口趨勢及全市 25–34 歲分性別失業率，保留年度與年齡級距限制。
4. **資料品質與原始資料蒐集。** 兩份現有資料已完成稽核；2013 年人口異常採「保留、揭露、精確阻擋」策略，失業率 raw→normalized mapping 也已可重現。若要教育／起薪題目，仍需蒐集可合法使用、口徑可比對的教育、薪資資料，完成欄位／年份／地區／年齡／單位對齊與可重現清洗。
5. **正式環境安全。** 預覽登入及 project ID 不是授權，不能當成完成帳號隔離；比賽展示請只使用公開測試資料。公開部署前確認 API 存取控制、檔案權限、金鑰僅在後端、CORS 及日誌不洩漏憑證。
6. **套件安全警示。** 9/11 已移除未使用的 react-router，並升級 ECharts 與 Vite；`npm audit` 目前為 0。ECharts 延遲載入 chunk 仍超過 Vite 500 kB 警告門檻，屬效能優化而非此次功能阻斷；正式環境不可使用 Vite dev server。

## P1：依剩餘時間取捨

- [ ] 真實登入、Notebook CRUD、雲端白板／對話保存、登入還原與多人／多分頁協作；本機 draft 不是替代方案。
- [ ] 分析歷史查詢／重新整理後還原。新 run ID 避免覆寫，但伺服器仍需定義歷史保留、清理與 orphan 產物回收。
- [ ] 通用檔案上傳、公開 API 抓取、清洗／轉換 pipeline 及資料預覽，目前只保存 metadata／網址。
- [ ] 多資料集真正交叉分析、教育與起薪資料相容性；不要用勾選多來源冒充完成 join 或因果推論。
- [ ] 小幫手已具真實明確上下文對話；畫布 mutation 工具與跨重整對話保存仍未完成，目前操作草稿仍需使用者確認後執行。
- [ ] 政策雷達真實政策分析、重跑與最近成功結果的雲端保存；目前只是數量盤點。
- [ ] 地圖熱點篩選、資料轉換工具、PDF／圖表圖片／CSV 匯出、簡報線上預覽。
- [x] 完整後端測試與 Windows SQLite 檔案占用問題已修正並重驗；9/12 最新 Python 測試 218/218、前端 110/110、Ruff、資料 audit 與 npm audit 均通過。真實模型及 AWS 實機測試仍須分開完成。
- [ ] 9/11 用全新瀏覽器／帳號在 AWS 完整彩排，準備網路／模型失敗時可明確辨識的備用演示，完成後再凍結版本。
