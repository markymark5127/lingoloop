/**
 * Starter stories and video scripts for English speakers learning Japanese (A1).
 * Written the way Japanese people actually narrate and talk: plain-form narration in stories,
 * casual vlog-style lines in videos — simple, but never textbook Japanese.
 * Japanese lines are word-spaced; `reading` is the kana with exactly the same word breaks.
 * Titles are stored unspaced (they are displayed as-is).
 */
import type { StarterStory, StarterVideo } from "../starter-content";

export const STARTER_STORIES_JA: StarterStory[] = [
  {
    title: "カフェのなぞ",
    series: "カフェのなぞ",
    series_order: 1,
    cefr: "A1",
    genre: "mystery",
    summary: "Every morning someone leaves a mysterious letter at Hana's café in Tokyo.",
    body: {
      characters: ["ハナ", "ケン", "モモ (ねこ)"],
      chapters: [
        {
          title: "テーブルの手紙",
          paragraphs: [
            {
              es: "ハナ は 東京 で 小さな カフェ を やっている 。 毎朝 七時 に 店 を 開ける 。",
              reading: "ハナ は とうきょう で ちいさな カフェ を やっている 。 まいあさ しちじ に みせ を あける 。",
              en: "Hana runs a little café in Tokyo. She opens up at seven every morning.",
            },
            {
              es: "ある 朝 、 テーブル の 上 に 手紙 が あった 。 「 赤い かぎ を 探して 」 。",
              reading: "ある あさ 、 テーブル の うえ に てがみ が あった 。 「 あかい かぎ を さがして 」 。",
              en: "One morning, there was a letter on the table. \"Find the red key.\"",
            },
            {
              es: "「 え 、 だれ が 置いた の ？ 」 ハナ は 猫 の モモ を 見た 。 モモ は 台所 の ほう を じっと 見ている 。",
              reading: "「 え 、 だれ が おいた の ？ 」 ハナ は ねこ の モモ を みた 。 モモ は だいどころ の ほう を じっと みている 。",
              en: "\"Huh, who left this?\" Hana looked at her cat, Momo. Momo was staring toward the kitchen.",
            },
            {
              es: "「 かぎ 、 どこ に ある の ？ 」 もちろん モモ は 答えない 。 でも 、 台所 に 走って いった 。",
              reading: "「 かぎ 、 どこ に ある の ？ 」 もちろん モモ は こたえない 。 でも 、 だいどころ に はしって いった 。",
              en: "\"Where's the key?\" Of course, Momo didn't answer. But she ran off to the kitchen.",
            },
          ],
          questions: [
            { q: "Where is Hana's café?", options: ["In Tokyo", "In Osaka", "In Kyoto"], answer: 0 },
            { q: "What does the letter say?", options: ["Open the door", "Look for the red key", "Drink coffee"], answer: 1 },
          ],
        },
        {
          title: "台所",
          paragraphs: [
            {
              es: "台所 に は パン と チーズ 、 それ から 大きな ケーキ 。 かぎ は 見当たらない 。",
              reading: "だいどころ に は パン と チーズ 、 それ から おおきな ケーキ 。 かぎ は みあたらない 。",
              en: "In the kitchen: bread, cheese, and a big cake. No key in sight.",
            },
            {
              es: "そこ へ 友だち の ケン が 来た 。 「 おはよう 。 何 探してる の ？ 」",
              reading: "そこ へ ともだち の ケン が きた 。 「 おはよう 。 なに さがしてる の ？ 」",
              en: "Just then her friend Ken showed up. \"Morning. What are you looking for?\"",
            },
            {
              es: "「 赤い かぎ 。 」 ケン は ケーキ を 指さした 。 「 じゃあ 、 これ は ？ 」",
              reading: "「 あかい かぎ 。 」 ケン は ケーキ を ゆびさした 。 「 じゃあ 、 これ は ？ 」",
              en: "\"A red key.\" Ken pointed at the cake. \"Then what's this?\"",
            },
            {
              es: "ケーキ の 中 に 赤い かぎ が 入っていた 。 それ と 、 もう 一通 の 手紙 も ！",
              reading: "ケーキ の なか に あかい かぎ が はいっていた 。 それ と 、 もう いっつう の てがみ も ！",
              en: "Inside the cake was a red key. And another letter, too!",
            },
          ],
          questions: [
            { q: "Who arrives at the café?", options: ["Momo", "Ken", "A detective"], answer: 1 },
            { q: "Where is the red key?", options: ["Under the table", "In the cake", "In the cat's bed"], answer: 1 },
          ],
        },
      ],
    },
  },
  {
    title: "二つ目の手紙",
    series: "カフェのなぞ",
    series_order: 2,
    cefr: "A1",
    genre: "mystery",
    summary: "The red key opens something unexpected — and a new clue points to the fruit shop.",
    body: {
      characters: ["ハナ", "ケン", "モモ (ねこ)"],
      chapters: [
        {
          title: "店へ",
          paragraphs: [
            {
              es: "二つ目 の 手紙 に は こう 書いてあった 。 「 八百屋 で みかん を 三つ 買って 」 。",
              reading: "ふたつめ の てがみ に は こう かいてあった 。 「 やおや で みかん を みっつ かって 」 。",
              en: "The second letter said: \"Buy three mandarins at the greengrocer.\"",
            },
            {
              es: "ハナ と ケン は 商店街 へ 向かった 。 天気 が よくて 、 人 で いっぱい だ 。",
              reading: "ハナ と ケン は しょうてんがい へ むかった 。 てんき が よくて 、 ひと で いっぱい だ 。",
              en: "Hana and Ken headed to the shopping street. The weather was nice and it was packed.",
            },
            {
              es: "大きな 帽子 の おじさん が 果物 を 売っている 。 「 みかん 三つ ください 。 」",
              reading: "おおきな ぼうし の おじさん が くだもの を うっている 。 「 みかん みっつ ください 。 」",
              en: "A man in a big hat was selling fruit. \"Three mandarins, please.\"",
            },
            {
              es: "おじさん は にっこり 笑った 。 「 ハナ さん です よね 。 預かってる もの が ある ん です よ 。 」",
              reading: "おじさん は にっこり わらった 。 「 ハナ さん です よね 。 あずかってる もの が ある ん です よ 。 」",
              en: "The man broke into a smile. \"You're Hana, right? I've been holding something for you.\"",
            },
          ],
          questions: [
            { q: "What must Hana buy?", options: ["Three apples", "Three mandarin oranges", "Bread"], answer: 1 },
            { q: "What does the man know?", options: ["Hana's name", "Where the key is", "Ken's address"], answer: 0 },
          ],
        },
      ],
    },
  },
  {
    title: "ロボと月",
    series: "ロボと月",
    series_order: 1,
    cefr: "A1",
    genre: "sci-fi",
    summary: "Robo, a little robot living alone on the Moon, gets an unexpected visitor.",
    body: {
      characters: ["ロボ", "ミライ"],
      chapters: [
        {
          title: "月のロボット",
          paragraphs: [
            {
              es: "ロボ は 小さな ロボット 。 月 に ひとり で 住んでいる 。",
              reading: "ロボ は ちいさな ロボット 。 つき に ひとり で すんでいる 。",
              en: "Robo is a little robot. He lives all alone on the Moon.",
            },
            {
              es: "毎日 、 地球 を ながめている 。 青くて 、 本当に きれい だ 。",
              reading: "まいにち 、 ちきゅう を ながめている 。 あおくて 、 ほんとうに きれい だ 。",
              en: "Every day he gazes at the Earth. It's blue and really beautiful.",
            },
            {
              es: "ある 夜 、 小さな ロケット が 降りて きた 。 中 から 女の子 が 出て くる 。 「 こんにちは ！ ミライ だ よ 。 」",
              reading: "ある よる 、 ちいさな ロケット が おりて きた 。 なか から おんなのこ が でて くる 。 「 こんにちは ！ ミライ だ よ 。 」",
              en: "One night, a little rocket landed. A girl climbed out. \"Hi! I'm Mirai.\"",
            },
            {
              es: "「 ねえ ロボ 、 地球 に 行って みない ？ 」 ロボ は うれしかった 。 でも 、 ちょっと こわい 。",
              reading: "「 ねえ ロボ 、 ちきゅう に いって みない ？ 」 ロボ は うれしかった 。 でも 、 ちょっと こわい 。",
              en: "\"Hey Robo, want to come see Earth?\" Robo was thrilled. But a little scared, too.",
            },
          ],
          questions: [
            { q: "Where does Robo live?", options: ["On Mars", "On the Moon", "In Tokyo"], answer: 1 },
            { q: "What does Mirai ask Robo?", options: ["If he wants to go to Earth", "If he is hungry", "Where the key is"], answer: 0 },
          ],
        },
      ],
    },
  },
];

export const STARTER_VIDEOS_JA: StarterVideo[] = [
  {
    title: "ポチとケーキ",
    cefr: "A1",
    genre: "comedy",
    summary: "A hungry dog finds a cake — and a surprise on top of it.",
    body: {
      scenes: [
        { text: "ポチ 、 おなか ペコペコ 。", reading: "ポチ 、 おなか ペコペコ 。", translation: "Pochi is starving.", emoji: "🐶", bg: "candy" },
        { text: "あれ ？ 台所 に 大きな ケーキ が ある ！", reading: "あれ ？ だいどころ に おおきな ケーキ が ある ！", translation: "Huh? There's a big cake in the kitchen!", emoji: "🎂", bg: "sunset" },
        { text: "ポチ 、 そっと ケーキ に 近づいて …", reading: "ポチ 、 そっと ケーキ に ちかづいて …", translation: "Pochi creeps up to the cake…", emoji: "🐶🎂", bg: "candy" },
        { text: "えっ ！ ケーキ の 上 に 猫 が いる ！", reading: "えっ ！ ケーキ の うえ に ねこ が いる ！", translation: "What?! There's a cat on top of the cake!", emoji: "🐱😱", bg: "night" },
        { text: "ポチ 、 公園 まで 全力 で 逃げた 。", reading: "ポチ 、 こうえん まで ぜんりょく で にげた 。", translation: "Pochi ran for his life all the way to the park.", emoji: "🏃🌳", bg: "forest" },
      ],
      questions: [
        { q: "What is in the kitchen?", options: ["A big cake", "A shoe", "A phone"], answer: 0 },
        { q: "Why does Pochi run away?", options: ["He is tired", "There is a cat on the cake", "It is raining"], answer: 1 },
      ],
    },
  },
  {
    title: "ロボの大発見",
    cefr: "A1",
    genre: "sci-fi",
    summary: "A robot on the Moon finds a mysterious box.",
    body: {
      scenes: [
        { text: "ぼく 、 ロボ 。 月 に 住んでる ロボット です 。", reading: "ぼく 、 ロボ 。 つき に すんでる ロボット です 。", translation: "I'm Robo, a robot who lives on the Moon.", emoji: "🤖🌙", bg: "space" },
        { text: "今日 、 ふしぎな 箱 を 見つけた ん だ 。", reading: "きょう 、 ふしぎな はこ を みつけた ん だ 。", translation: "Today I found a mysterious box.", emoji: "📦✨", bg: "desert" },
        { text: "中 に 何 が 入ってる ん だろう …", reading: "なか に なに が はいってる ん だろう …", translation: "I wonder what's inside…", emoji: "🤔", bg: "space" },
        { text: "地球 に 連絡 だ ！ 「 大発見 です ！ 」", reading: "ちきゅう に れんらく だ ！ 「 だいはっけん です ！ 」", translation: "Time to call Earth! \"Big discovery!\"", emoji: "📡🌍", bg: "space" },
        { text: "… と 思ったら 、 ぼく の お弁当 だった 。", reading: "… と おもったら 、 ぼく の おべんとう だった 。", translation: "…turns out it was my own lunch.", emoji: "🍱😅", bg: "sunset" },
      ],
      questions: [
        { q: "Where is Robo?", options: ["On the Moon", "On Mars", "In Tokyo"], answer: 0 },
        { q: "What was in the box really?", options: ["Alien life", "His lunch", "A new planet"], answer: 1 },
      ],
    },
  },
  {
    title: "東京の一日",
    cefr: "A1",
    genre: "travel",
    summary: "A traveler spends a day in Tokyo: fast trains, ramen and a red hat.",
    body: {
      scenes: [
        { text: "どうも ！ 今日 は 東京 に 来てます 。", reading: "どうも ！ きょう は とうきょう に きてます 。", translation: "Hey there! Today I'm in Tokyo.", emoji: "🧳🗼", bg: "city" },
        { text: "電車 、 めちゃくちゃ 速い ！", reading: "でんしゃ 、 めちゃくちゃ はやい ！", translation: "The trains are crazy fast!", emoji: "🚆💨", bg: "city" },
        { text: "お昼 は ラーメン 。 やばい 、 おいしすぎる ！", reading: "おひる は ラーメン 。 やばい 、 おいしすぎる ！", translation: "Ramen for lunch. Oh man, it's so good!", emoji: "🍜😋", bg: "sunset" },
        { text: "かわいい 赤い 帽子 、 買っちゃった 。", reading: "かわいい あかい ぼうし 、 かっちゃった 。", translation: "I couldn't resist this cute red hat.", emoji: "👒🛍️", bg: "city" },
        { text: "夜 の 東京 は ほんとに きれい 。", reading: "よる の とうきょう は ほんとに きれい 。", translation: "Tokyo at night is seriously beautiful.", emoji: "🌃✨", bg: "night" },
      ],
      questions: [
        { q: "What does the traveler eat for lunch?", options: ["Sushi", "Ramen", "Cake"], answer: 1 },
        { q: "What does the traveler buy?", options: ["A red hat", "A blue bag", "A train ticket"], answer: 0 },
      ],
    },
  },
];
