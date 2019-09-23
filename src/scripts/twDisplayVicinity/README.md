twDisplayVicinity  
=================
【近傍ツイート検索】特定ツイート前後のタイムラインを表示するユーザースクリプト  

2019年7月のTwitterデザイン(UI)変更に伴い、ユーザースクリプト版は動作しなくなっております。  
---
**[Chrome拡張機能版](https://chrome.google.com/webstore/detail/twdisplayvicinity/anmfeeanmnmdkjlhojpodibignbcfgjm) もしくは [Firefoxアドオン版](https://addons.mozilla.org/ja/firefox/addon/twdisplayvicinity/) をご利用願います（[ソースコードは→こちら](https://github.com/furyutei/twDisplayVicinity_Chrome)）。**  

- License: The MIT license  
- Copyright (c) 2014 風柳(furyu)  
- 対象ブラウザ： Firefox（<s>[Greasemonkey](https://addons.mozilla.org/ja/firefox/addon/greasemonkey/)</s>[Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)が必要）、Google Chrome（[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=ja)が必要）  


■ 近傍ツイート検索（twDisplayVicinity）とは？
---
[Twitterの公式Webサイト](https://twitter.com/) で、特定ツイートの前後のツイートをタイムライン形式で表示するユーザースクリプトです。  
あるツイートの前後で、同じ人が何をつぶやいているか知りたい、といった場合に便利です。  

- リツイートされてきたツイート
- 他のWebサイトで紹介されていたツイート
- 検索エンジンでヒットしたツイート

といったものについては、そのままでは前後のツイートを知ることができません。  
前後のツイートを読むことによって、単独ツイートではわからなかった思わぬ文脈が見えるかも知れません。  

本ユーザースクリプトをインストールすると、ブラウザでTwitterのタイムラインや単独ツイートを見たときに、“近傍”リンクが表示されるようになります。  
このリンクをクリックすることで、別タブ／別ウィンドウが開き、当該ツイート前後のタイムラインを見ることが出来ます。  

また、自分のツイートがリツイートされた際には[“通知”タイムライン](https://twitter.com/i/notifications)を開くと、リツイートした人の通知にも“近傍”リンクが表示されます。  
クリックすると、自分のツイートをRTした前後で、その人が何をつぶやいているかがわかります。  


■ インストール方法
---
<s>[Greasemonkey](https://addons.mozilla.org/ja/firefox/addon/greasemonkey/)</s>[Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)を入れたFirefox、もしくは[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=ja)を入れたGoogle Chrome にて、  

> [twDisplayVicinity.user.js](https://furyutei.work/userjs/furyutei/twDisplayVicinity.user.js)  

をクリックし、指示に従ってインストール。  
※ Firefox では Quantum(57) + Greasemonkey 4 より動作しなくなった（代わりに Tampermonkey を使用すること）。  

■ 使い方
---
下記の記事をご参照ください。  
[【近傍ツイート検索】特定ツイート前後のタイムラインを表示するユーザースクリプト試作](http://furyu.hatenablog.com/entry/20140327/1395914958)


■ Google Chrome 専用版（拡張機能）／Firefox Quantum アドオンについて
---
Google Chrome用には、[専用版（拡張機能）](https://chrome.google.com/webstore/detail/twdisplayvicinity/anmfeeanmnmdkjlhojpodibignbcfgjm)があります。  
また、Firefox Quantum用には、[専用アドオン（WebExtensions）](https://addons.mozilla.org/ja/firefox/addon/twdisplayvicinity/)があります。  

- 一度インストールしておけば、更新（バージョンアップ）は Chrome / Firefox 側で自動で実施
- オプション画面より、表示オプション等が設定可能

詳細は、下記の記事をご参照ください。  
[【近傍ツイート検索】(twDisplayVicinity)：Google Chrome拡張機能版を公開](http://furyu.hatenablog.com/entry/20140609/twDisplayVicinity)


■ 関連記事
---
- [【近傍ツイート検索】特定ツイート前後のタイムラインを表示するユーザースクリプト試作 - 風柳メモ](http://furyu.hatenablog.com/entry/20140327/1395914958)  
- [【近傍ツイート検索】(twDisplayVicinity)：Google Chrome拡張機能版を公開 - 風柳メモ](http://furyu.hatenablog.com/entry/20140609/twDisplayVicinity)
- [Google ChromeへのTampermonkeyのインストールと基本的な使い方 - 風柳メモ](http://furyu.hatenablog.com/entry/20141227/1419609930)  
