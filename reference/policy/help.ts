import {CONFIG as C} from '../core/config.ts';
import {FEATURES,type PolicySpec} from './policy.ts';
export const FEATURE_HELP:Record<(typeof FEATURES)[number],string>={
 gain:'取得完了時の見込み点。ボーナス・終盤・自分の秘密加点を含む。取得不能なら0。現在得点ではない',
 cp_id:'CP番号0〜5（A〜F）。丘陵・待機は-1',
 my_distance:'候補までの直線距離（タイル）',
 my_eta:'現在の水位で通れる4近傍BFS経路と道路倍率による移動秒数の概算。最短時間を保証しない',
 wait:'到着後、開放と共通クールダウン終了まで待つ秒数の概算',
 capture_progress:'視認可能な取得進捗0〜1。待機中は0',
 enemy_known:'直近4秒以内に相手を見たら1、それ以外0',
 enemy_distance:'最後に見た相手から候補までの直線距離。未知は0',
 enemy_eta:'最後に見た相手からの直線距離÷基本速度。道路・迂回を含まない概算。未知は0',
 enemy_heading:'観測した相手の進行方向と候補方向の一致度 -1〜1。実際の目標を読む値ではない',
 arrival_advantage:'相手の推定到着秒と自分の移動秒の差÷10を-1〜1に制限。未知は0',
 turn_rate:'観測した方向転換の割合0〜1',
 occupied:'視認できる相手が取得中、または待機先着権を持っているなら1',
 capturing:'自分が取得中なら1。待機先着権だけなら0',
 is_secret:'自分の秘密CPなら1。相手の秘密は使えない',
 is_cp:'CP候補なら1',is_hill:'丘陵候補なら1',is_wait:'現在地待機候補なら1',
 same_target:'自分の前回の目標と同じ候補なら1。相手と同じ目標という意味ではない',
 target_age:'自分が現在の目標を選んでからの秒数',
 time:'試合経過秒（0〜300）',remaining:'試合の残り秒',
 player_id:'自分の公開プレイヤー番号0または1。両者同式での対称性を崩す条件に使えるが、番号による偏りには注意',
 contested:'視認できるCP競合（同じ判定タイミングの入場で先着未決定）なら1',
 queued:'自分が閉鎖・冷却待ちの先着権を持つなら1。取得開始前',
 enemy_queued:'視認できる相手が閉鎖・冷却待ちの先着権を持つなら1',
 can_capture:'現在の経路・最初の開放予定で、取得完了が閉鎖・試合終了に間に合う見込みなら1。相手の将来行動は保証しない',
 capture_eta:'移動＋開放/冷却待ち＋取得に必要な秒数の概算。自分が取得中なら現在からの残り取得秒だけ。必ずcan_captureと併用',
 finish_time:'上記の取得完了見込み時刻（試合経過秒）。必ずcan_captureと併用'
};
export const REFERENCE_URL='https://github.com/ysaki-dev/checkpoint-strategy-game-public/tree/main/reference';
/** Standalone text: users can paste it into any LLM without game/API integration. */
export function buildPolicyPrompt(spec:PolicySpec,mode:'standard'|'secret',strategy:string){return `ROUTE SHIFT 方策作成ガイド / ${C.rulesVersion}
あなたはブラウザゲーム ROUTE SHIFT のAI方策作成を手伝ってください。下記はゲームの仕様とユーザーが編集するデータです。

【私の希望する戦い方】
${strategy.trim()||'ここに自分の方針を追記してください（例：相手に先着された場所を諦め、終盤のボーナスを重視したい）。'}

【今回のモード】${mode==='secret'?'秘密戦':'スタンダード'}（ユーザーは画面で変更可能）
【ゲームルール】
・準備${C.prepare}秒＋対戦${C.duration}秒。操作は移動のみ。準備中に移動できるが対戦開始時に同じ出発点へ戻る。勝敗は終局の合計点。
・地図は${C.width}×${C.height}タイル、CPはA〜F。全CPが常時開くわけではなく、通常の開放時間と公開ボーナス予定がある。
・CPの取得半径は${C.captureRadius}タイル。開放中に先着した人が連続${C.capture}秒滞在すると得点、全員共通で${C.cooldown}秒クールダウン。
・閉鎖/クールダウン中も、範囲内に先に入った人の待機先着権を記録。離れれば失効。開放・冷却終了後に取得5秒を新たに数える。待機中は取得進捗が増えない。
・同じ0.05秒判定内に入った場合は競合し、どちらかが離れるまで取得できない。ランダム勝者や番号優遇はない。似た式が同じ経路を選ぶと引分も起こる。
・経過0〜60秒未満は通常0.5/ボーナス1点、60〜240秒未満は1/2点、240〜300秒は2/3点。取得完了時刻で決まる。
・基本速度${C.speed}タイル/秒、道路は${C.roadMultiplier}倍。河川は通行不可、橋は通行可、浅瀬は減水中のみ。水位予定は公開。
・スタンダードは森の相手を隠し、近距離${C.forestRadius}タイルや自分の丘陵で視認する。秘密戦は通常${C.secretViewRadius}、どちらかが森林なら${C.secretForestRadius}タイル。秘密戦でどちらかが丘陵にいれば双方が全域可視。
・秘密戦の秘密CPは準備中に任意選択、未選択ならなし。秘密CP取得は+0.5点。双方の得点は終了まで非表示。式から準備中の秘密CPを選ぶ機能はない。

【プログラムの仕組み】
0.75秒ごとにCP・公開丘陵・現在地待機を候補にし、formulaの数値が最大の候補を選ぶ。移動は共通の4近傍BFS経路制御。経路は現在の水位で計算、移動中に水位が変われば再計画。未来の水位を織り込んだ最適経路ではない。
同点はCP番号順→丘陵→待機。到達不能候補は除外。閉鎖中へ先回りすることはできる。
到着時刻と開放/冷却終了から待機時間、取得5秒後の時刻を計算し、最初の該当開放内かつ05:00までに完了できない場合はcan_capture=0/gain=0。後の開放への再挑戦や相手の将来行動まで保証しない。
switchWhenは現在の目標について評価し、0なら維持、それ以外なら再評価。空欄なら毎判断周期で評価。初回・水位変化は再計画。自分の取得中を維持したければformulaにも明示する。
観測は自分用に制限済み。不可視の相手の現在位置、真の目的CP、相手の式・重み・秘密CP・隠された得点は利用できない。相手の方向や到着は観察からの推定であり完全情報ではない。

【使用できる特徴量：これ以外の変数を勝手に作らない】
${FEATURES.map(key=>`${key}: ${FEATURE_HELP[key]}`).join('\n')}

【数式の文法と上限】
四則演算 + - * /、比較 < <= > >= == !=、論理 && || !、括弧。真偽は1/0。
関数 min(a,b), max(a,b), abs(a), clamp(x,下限,上限), if(条件,a,b)。if/論理は短絡評価。pow/exp/sin/randomや任意のJavaScriptは使えない。
parametersは自由な名前の数値を最大32個、各±10000。特徴量・constructor・prototype・__proto__はパラメータ名に使えない。式4000文字・512ノード・深さ24・判断8192評価以内。0除算/非有限数の候補は除外、全無効なら停止。
同じ入力の決定的な式を両者に使うと同じ行動になりうる。競合回避を望むならcontestedやplayer_idを使う案も検討し、番号への依存や得失を説明する。相手と同じ目標を選ぶボーナスは自動では入らない。

【現在の方策（編集用データ）】
${JSON.stringify(spec,null,2)}

【出力してほしいもの】
1. ゲームの「テキストで共有」にそのまま貼れる有効なJSONを1つ。フィールドは version:1, name（60文字以内）, formula, parameters, switchWhen（任意）のみ。コメント/追加フィールドは入れない。
2. 狙い、調整できるパラメータ、苦手な相手を短く説明。必勝・検証していない勝率は主張しない。
JSONをゲームで読み込み、相手を選んで「AI A vs 選んだ相手を観戦」すれば試せる。LLMは設定作成時に利用するだけで対戦中のAPIは不要。

【詳しい公開コード】
${REFERENCE_URL}
core/config.ts（定数）/ core/game.ts（先着・得点・情報投影）/ core/map.ts（地形・予定）/ policy/policy.ts（特徴量・行動）/ policy/expression.ts（数式文法）。最新の配信と対応するハッシュはreference/manifest.json。
`;}
