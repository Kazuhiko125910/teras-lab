# Teras Lab. RESHAPE 設定手順

## 1. 裏側のプログラム（Apps Script）
1. https://script.google.com を開き「新しいプロジェクト」。名前を「RESHAPE」にする
2. 最初からある `コード.gs` の中身を全部消して、`gas/Code.gs` の中身を全部貼り付けて保存
3. 上の関数の選択で `setup` を選び「実行」→ 許可の画面で自分のGoogleアカウントを選び「許可」
   - 運営用シートにプルダウンと「毎日のストレッチ」タブ、ドライブに「RESHAPE_会員の写真」フォルダができます
4. 左の歯車（プロジェクトの設定）→ 一番下「スクリプト プロパティ」で次の3つに値を入れる
   - `LINE_CHANNEL_ID`：手順2で作るLINEログインのチャネルID（数字）
   - `ADMIN_KEY`：管理者ページの合言葉（自分で決める）
   - `ANTHROPIC_API_KEY`：食事サポートのAIキー（なければ空欄のままでOK。食事サポートだけ「準備中」になります）
5. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
   - 次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
   - 「デプロイ」→ 表示された「ウェブアプリのURL」（…/exec）を控える

## 2. LINEログイン（LINE Developers）
1. https://developers.line.biz/console/ に、RESHAPE用の公式LINEと同じLINEアカウントでログイン
2. 公式LINEと同じプロバイダーを開き「新規チャネル作成」→「LINEログイン」
   - チャネル名：Teras Lab. RESHAPE ／ アプリタイプ：ウェブアプリ
3. 作成したチャネルの「チャネル基本設定」にある **チャネルID** を控える（1-4 に入れる）
4. 「LIFF」タブ →「追加」
   - LIFFアプリ名：RESHAPE ／ サイズ：Full
   - エンドポイントURL：`https://kazuhiko125910.github.io/teras-lab/reshape/`
   - Scope：`openid` と `profile` にチェック ／ 友だち追加オプション：On（Normal）
5. 作成後に表示される **LIFF ID** を控える
6. チャネルを「公開済み」にする（開発中のままだと本人以外ログインできません）

## 3. サイトに設定を入れる
設定済み（GAS_URL／LIFF_ID `2011731827-ZLDHlKTg`）。LINEログインのチャネルIDは `2011731827`。

## 4. リッチメニュー（LINE Official Account Manager「Teras Lab. RESHAPE」／小・3分割）
- メニューバー：▼ RESHAPE メニュー
- 左「今日のメニュー」：`https://liff.line.me/2011731827-ZLDHlKTg`
- 中央「食事サポート」：`https://liff.line.me/2011731827-ZLDHlKTg?v=meal`
- 右「記録と変化」：`https://liff.line.me/2011731827-ZLDHlKTg?v=log`

## 5. 管理者ページ
`https://kazuhiko125910.github.io/teras-lab/reshape/admin.html` を開き、合言葉（ADMIN_KEY）を入れる。

## 動作確認用（サンプル会員で表示）
- VIP：`…/reshape/?demo=vip` ／ STANDARD：`…/reshape/?demo=std`

## 新しい会員が入ったとき
1. 会員がリッチメニューからサイトを開くと、会員シートに「承認待ち」で自動登録され、目標設定ワークが始まります
2. 加藤さんが会員シートでその人の行に「プラン」「支払日」「開始日」を入れ、「利用」を「利用中」にする
3. 次に開いたときから毎日の画面が表示されます

動画やロードマップを直したときは、最大10分でサイトに反映されます（すぐ反映したいときは Apps Script で `clearCache` を実行）。

## 毎月の中間目標と見直し
- 目標設定ワークで、6ヶ月後の目標と「毎月の中間目標」（自動計算→本人が調整）を決める
- 開始日から1ヶ月ごとが見直しの日。サイトの「今日」に見直しカードが出る（`?v=review` でも開ける）
- 見直しの内容は「月の目標」タブに記録（中間目標・実績・達成数・ふり返り3問）
- 6ヶ月ごとに最終見直し → 次の6ヶ月（第2期…）の目標と中間目標を決める
- LINEへの自動リマインド：毎朝9時に `monthlyReminder` が動き、見直しの日を迎えた会員（利用中・卒業生）に送信
  - スクリプトプロパティ `LINE_MESSAGING_TOKEN` に、Messaging APIチャネルの長期チャネルアクセストークンを入れる
  - 動作確認：会員シートの自分の行の「メモ」に「テスト送信」と書いて `testPush` を実行
