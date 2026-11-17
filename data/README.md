# data フォルダの説明

| ファイル | 中身 |
|---|---|
| `materials.json` | 30日分の教材（1日1件） |
| `plan.json` | 週ごとのテーマ・メニュー・練習内容・フレーズ・測定の説明 |

どちらも **JSON** という形式です。編集したら、カンマ `,` や `"` の付け忘れがないか注意してください。
（壊れていると、アプリに「データを読み込めませんでした」と出ます。https://jsonlint.com/ に貼り付けるとチェックできます）

編集して GitHub に公開したら、**`sw.js` の `VERSION` の数字を1つ上げてください**（例：`'v1'` → `'v2'`）。
上げないと、スマホに古いデータが残ることがあります。

---

## materials.json の項目

| 項目 | 必須 | 説明 |
|---|---|---|
| `day` | ○ | 何日目か（1〜30） |
| `week` | ○ | 何週目か（1〜4）。週のテーマと練習内容はこの番号で決まる |
| `title` | ○ | エピソードの題名（画面に表示） |
| `source` | ○ | 番組名 |
| `pageUrl` | ○ | 公式のエピソードページのURL |
| `audioUrl` |  | 公式の音声ファイル（mp3など）のURL。**これがあるとアプリ内で倍速・区間リピートができます**。なければ `null` |
| `transcriptUrl` |  | スクリプト（書き起こし）のページのURL。なければ `null`（精聴のステップ2では代わりに `pageUrl` を開きます） |
| `durationMin` |  | だいたいの長さ（分） |
| `focusHint` |  | その日の注目ポイント（日本語で一言） |
| `verified` |  | ページ（とスクリプト）のURLが実在することを確認済みなら `true` |
| `audioVerified` |  | 音声ファイルそのものにアクセスして確認済みなら `true`。`false` は「公式ページに書かれている音声URLだが、ファイル自体は未確認」 |
| `embedUrl` |  | （任意）TEDなど、公式の埋め込みプレーヤーのURL。`audioUrl` がないときに画面に埋め込みます。倍速や区間リピートは使えません |

### 書き方の例

```json
{
  "day": 1,
  "week": 1,
  "title": "Is it OK to be bored?",
  "source": "BBC Learning English – 6 Minute English",
  "pageUrl": "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250102",
  "audioUrl": "https://downloads.bbc.co.uk/learningenglish/features/6min/250102_6_minute_english_bored.mp3",
  "transcriptUrl": "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250102",
  "durationMin": 6,
  "focusHint": "単語と単語がつながる音に注目",
  "verified": true
}
```
※ 上のURLは書き方の例です（実在は確認していません）。

### audioUrl（mp3のURL）の見つけ方

- **BBC 6 Minute English**：エピソードページの「Download Audio」ボタンを長押し →「リンクをコピー」（`https://downloads.bbc.co.uk/…mp3`）
- **HBR（IdeaCast / Women at Work）**：エピソードページ内の `https://audio.hbr.org/…mp3`
- **NPR**：エピソードページの再生ボタンが使っている `…/default.mp3` のURL
- **ポッドキャスト全般**：番組のRSSフィード（Apple Podcasts のページなどに書かれている）を開き、各エピソードの `<enclosure url="…mp3">` の部分
- ※ `http://` で始まる音声URLは、GitHub Pages（https）では再生できません。`https://` のものを使ってください。
- 音声URLが見つからない・再生できないときは `null` のままでOK。アプリには「公式ページで聞く」ボタンが出ます

### 注意（著作権）

音声ファイルやスクリプトの本文はこのリポジトリに入れないでください。**URLを書くだけ**にします。

---

## plan.json の主な項目

| 項目 | 説明 |
|---|---|
| `menu` | 1日のメニュー（名前・目安時間）。`required: true` が「最低ライン」 |
| `intensiveSteps` | 精聴のステップ（聞く → 確認 → 口パク → もう一度） |
| `weeks` | 週ごとのテーマ・素材・練習のやり方・タップ記録のボタン（`counters`） |
| `questionTypes` | 質問の型と例文（フレーズ集に表示） |
| `recoveryPhrases` | 立て直しフレーズ（🆘ボタンで表示） |
| `measurement` | Day 1 / Day 30 の測定の説明。`materials` に測定用の音声ページを入れられます |

測定用の素材の例（`measurement.materials`）：

```json
"materials": {
  "1":  [ { "label": "書き取り用（30秒）", "pageUrl": "https://…" },
          { "label": "要点用（2分）",     "pageUrl": "https://…" } ],
  "30": [ { "label": "書き取り用（30秒）", "pageUrl": "https://…" },
          { "label": "要点用（2分）",     "pageUrl": "https://…" } ]
}
```
Day 1 と Day 30 は「初めて聞く」音声にするため、30日のプランで使っていないエピソードを選んでください。
