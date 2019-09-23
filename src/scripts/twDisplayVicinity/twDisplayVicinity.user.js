// ==UserScript==
// @name            twDisplayVicinity
// @namespace       http://d.hatena.ne.jp/furyu-tei
// @author          furyu
// @version         0.2.6.13
// @include         https://twitter.com/*
// @require         https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js
// @require         https://cdnjs.cloudflare.com/ajax/libs/decimal.js/7.3.0/decimal.min.js
// @grant           GM_xmlhttpRequest
// @grant           GM_setValue
// @grant           GM_getValue
// @connect         twitter.com
// @description     Display the vicinity of a particular tweet on Twitter.
// ==/UserScript==
/*
  [Download (User Script)](https://github.com/furyutei/twDisplayVicinity/raw/master/twDisplayVicinity.user.js)
  [GitHub (User Script)](https://github.com/furyutei/twDisplayVicinity)
  [Download (Chrome Web Store)](https://chrome.google.com/webstore/detail/twdisplayvicinity/anmfeeanmnmdkjlhojpodibignbcfgjm?hl=ja)
  [GitHub (Chrome Extension)](https://github.com/furyutei/twDisplayVicinity_Chrome)
  [Related article](http://furyu.hatenablog.com/entry/20140327/1395914958)
  [Original (Bookmarklet)](http://let.hatelabo.jp/furyu-tei/let/hLHVnMG9q-NH)
*/

/*
■ 外部ライブラリ
- [jQuery](https://jquery.com/)
    The MIT License
    [License | jQuery Foundation](https://jquery.org/license/)

- [MikeMcl/decimal.js: An arbitrary-precision Decimal type for JavaScript](https://github.com/MikeMcl/decimal.js)
    Copyright (c) 2016, 2017 Michael Mclaughlin
    The MIT Licence
    [decimal.js/LICENCE.md](https://github.com/MikeMcl/decimal.js/blob/master/LICENCE.md)

■ 関連記事など
- [【近傍ツイート検索】特定ツイート前後のタイムラインを表示するユーザースクリプト試作 - 風柳メモ](http://furyu.hatenablog.com/entry/20140327/1395914958)
*/

/*
The MIT License (MIT)

Copyright (c) 2014 furyu <furyutei@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/


( function ( w, d ) {

'use strict';

//{ ■ パラメータ
var OPTIONS = {
    USE_SEARCH_TL_BY_DEFAULT : false, // true: デフォルトで検索タイムラインを使用
    
    HOUR_BEFORE : 24, // 対象ツイートから遡る期間(時間)
    HOUR_AFTER : 8, // 対象ツイートより後の期間(時間)
    
    // DAY_BEFORE / DAY_AFTER は、検索タイムラインで  until: / since: が "YYYY-MM-DD_hh:mm:ss_GMT" の形で指定できることが判明したので未使用とする
    DAY_BEFORE : 1, // (未使用) 対象ツイートから遡る期間(日)(検索タイムライン用・時間指定時)
    DAY_AFTER : 1, // (未使用) 対象ツイートより後の期間(日)(検索タイムライン用・時間指定時)
    
    IGNORE_SINCE : true, // true: 検索タイムラインのオプションに since: を付けない
    
    TARGET_TWEET_COLOR : 'gold', // 対象ツイートの色
    TARGET_TWEET_COLOR_NIGHTMODE : '#444400', // 対象ツイートの色（夜間モード）
    VICINITY_TWEET_COLOR : 'pink', // 近傍ツイートの色
    VICINITY_TWEET_COLOR_NIGHTMODE : '#440044', // 近傍ツイートの色（夜間モード）
    // TODO: 夜間モードだと見えにくいため、暫定的に 'inherit' にしてある
    LINK_COLOR : 'inherit', // 近傍リンクの色('darkblue'→'inherit')
    ACT_LINK_COLOR : 'inherit', // 通知リンクの色('indigo'→'inherit')
    
    HIDE_NEWER_TWEETS : true, // true: 最新のツイート(追加されたもの)を非表示
    USE_LINK_ICON : true, // 近傍リンクの種類（true: アイコンを使用 ／ false: 文字を使用
    
    ENABLE_RECENT_RETWEET_USERS_BUTTON : true, // true: 最近リツイートしたユーザーを表示するボタンを有効に
    CACHE_OAUTH2_ACCESS_TOKEN : true, // true: OAuth2 の Access Token を再利用する
    MAX_USER_NUMBER : 30, // 取得ユーザー数(API制限により、100ユーザまで) (ENABLE_RECENT_RETWEET_USERS_BUTTON が true の場合に使用)
    MAX_AFTER_RETWEET_MINUTES : 10, // リツイート後のツイート取得期間(分)
    MAX_BEFORE_RETWEET_MINUTES : 10, // リツイート前のツイート取得時間(分)
    
    OPEN_LINK_KEYCODE : 70, // 近傍ツイート検索キーコード([f]:70)
    HELP_OPEN_LINK_KEYCHAR : 'f', // 近傍ツイート検索キー表示
    
    OPEN_ACT_LINK_KEYCODE : 65, // アクションの近傍ツイート検索キーコード([a]:65)
    HELP_OPEN_ACT_LINK_KEYCHAR : 'a', // アクションの近傍ツイート検索キー
    
    TOGGLE_RERT_DIALOG_KEYCODE : 69, // [Re:RT]ダイアログを開く/閉じるキーコード([e]:69)
    HELP_OPEN_RERT_DIALOG_KEYCHAR : 'e', // [Re:RT]ダイアログを開くキー表示
    
    STATUSES_RETWEETS_CACHE_SEC : 0, // statuses/retweets API のキャッシュを保持する時間(秒)(0:保持しない)
    
    OPERATION : true // true: 動作中、false: 停止中
};

//}


//{ ■ 共通変数
var SCRIPT_NAME = 'twDisplayVicinity',
    SCRIPT_NAME_JA = '近傍ツイート検索',
    
    DEBUG = false;

//{ check environment
if ( d.querySelector( 'div#react-root' ) ) {
    if ( w.is_web_extension ) {
        // 拡張機能では main_react.js が動作
    }
    else {
        // TODO: ユーザースクリプトでは Twitter 新UI(React版) には未対応
        console.error( SCRIPT_NAME + ': Not compatible with React Twitter' );
    }
    return;
}

if ( w[ SCRIPT_NAME + '_touched' ] ) {
    return;
}
w[ SCRIPT_NAME + '_touched' ] = true;

if ( w !== w.parent ) {
    return;
}

if ( /^https:\/\/twitter\.com\/i\/cards\//.test( w.location.href ) ) {
    return;
}

if ( ( typeof jQuery != 'function' ) || ( typeof Decimal != 'function' ) ) {
    console.error( SCRIPT_NAME + ':', 'Library not found', typeof jQuery, typeof Decimal );
    return;
}

var $ = jQuery,
    
    IS_PAGE_404 = ( function () {
        var jq_form_404 = $( 'form.search-404' );
        
        if ( 0 < jq_form_404.length ) {
            return true;
        }
        return false;
    } )(),
    
    LANGUAGE = ( function () {
        if ( IS_PAGE_404 ) {
            try {
                return ( w.navigator.browserLanguage || w.navigator.language || w.navigator.userLanguage ).substr( 0, 2 );
            }
            catch ( error ) {
                return 'en';
            }
        }
        
        return $( 'html' ).attr( 'lang' );
    } )(),
    
    IS_WEB_EXTENSION = !! ( w.is_web_extension ),
    IS_FIREFOX = ( 0 <= w.navigator.userAgent.toLowerCase().indexOf( 'firefox' ) ),
    IS_EDGE = ( 0 <= w.navigator.userAgent.toLowerCase().indexOf( 'edge' ) );

//} end of check environment


switch ( LANGUAGE ) {
    case 'ja' :
        OPTIONS.LINK_TEXT = '近傍';
        OPTIONS.LINK_TITLE = '近傍ツイート検索';
        OPTIONS.ACT_LINK_TEXT = '近傍';
        OPTIONS.ACT_LINK_TITLE = 'アクションの近傍ツイート検索';
        OPTIONS.GO_TO_PAST_TEXT = '以前のツイート↓';
        OPTIONS.CLOSE_TEXT = '閉じる';
        OPTIONS.RECENT_RETWEET_USERS_TEXT = '最近リツイートしたユーザー';
        OPTIONS.LOADING_TEXT = '取得中...';
        OPTIONS.LOADING_ERROR_TEXT = '読み込めませんでした';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TITLE = '最近リツイートしたユーザーを表示';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TEXT = 'Re:RT';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_BUTTON_TITLE = 'リツイート前後のツイートを取得';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_BUTTON_TEXT = '↓↑';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_BUTTON_TITLE = '閉じる';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_BUTTON_TEXT = '↑';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_BUTTON_TITLE = '開く';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_BUTTON_TEXT = '↓';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_ALL_BUTTON_TITLE = '全てのリツイート前後のツイートを取得';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_ALL_BUTTON_TEXT = 'まとめて ↓↑';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_ALL_BUTTON_TITLE = '全て閉じる';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_ALL_BUTTON_TEXT = '全て↑';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_ALL_BUTTON_TITLE = '全て開く';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_ALL_BUTTON_TEXT = '全て↓';
        OPTIONS.HELP_OPEN_RERT_DIALOG_LABEL = '[Re:RT]ダイアログを開く';
        break;
    default:
        OPTIONS.LINK_TEXT = 'Vicinity';
        OPTIONS.LINK_TITLE = 'Search vicinity tweets';
        OPTIONS.ACT_LINK_TEXT = 'Vicinity';
        OPTIONS.ACT_LINK_TITLE = 'Search vicinity tweets around action';
        OPTIONS.GO_TO_PAST_TEXT = 'Go to past ↓';
        OPTIONS.CLOSE_TEXT = 'Close';
        OPTIONS.RECENT_RETWEET_USERS_TEXT = 'Recent Retweeters';
        OPTIONS.LOADING_TEXT = 'Loading...';
        OPTIONS.LOADING_ERROR_TEXT = 'Load error';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TITLE = 'Display recent users that have retweeted';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TEXT = 'Re:RT';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_BUTTON_TITLE = 'Retrieve Tweets around this Retweet';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_BUTTON_TEXT = '↓↑';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_BUTTON_TITLE = 'Close';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_BUTTON_TEXT = '↑';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_BUTTON_TITLE = 'Open';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_BUTTON_TEXT = '↓';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_ALL_BUTTON_TITLE = 'Retrieve Tweets around all Retweets';
        OPTIONS.REFERECE_TO_RETWEET_LOAD_ALL_BUTTON_TEXT = 'All ↓↑';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_ALL_BUTTON_TITLE = 'Close All';
        OPTIONS.REFERECE_TO_RETWEET_CLOSE_ALL_BUTTON_TEXT = 'All ↑';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_ALL_BUTTON_TITLE = 'Open All';
        OPTIONS.REFERECE_TO_RETWEET_OPEN_ALL_BUTTON_TEXT = 'All ↓';
        OPTIONS.HELP_OPEN_RERT_DIALOG_LABEL = 'Open [Re:RT] dialog';
        break;
}

var SEARCH_API = 'https://twitter.com/search',
    TIMELINE_API_BASE = 'https://twitter.com/',
    OAUTH2_TOKEN_API_URL = 'https://api.twitter.com/oauth2/token',
    ENCODED_TOKEN_CREDENTIAL = 'ZUMwYjVTcDdTTW0xaUtES3lwQ3AySkpkZDpsbHMxZ040Q0ZQMFhmSmtvbEk2UjBZMkd6aWxjbHhqQUlrZkVZSHl3Ymh6TjhZcURlSA==',
    API_RATE_LIMIT_STATUS = 'https://api.twitter.com/1.1/application/rate_limit_status.json',
    API_STATUSES_RETWEETS_TEMPLATE = 'https://api.twitter.com/1.1/statuses/retweets/#TWEETID#.json?count=#NUMBER#',
    API_FAVORITES_LIST_TEMPLATE = 'https://api.twitter.com/1.1/favorites/list.json?screen_name=#SCREEN_NAME#&count=200&include_entities=true',
        // TODO: 「いいね」の方は API の仕様上、使い勝手がよくないため、保留
    OAUTH2_ACCESS_TOKEN = null,
    
    LINK_CONTAINER_CLASS = SCRIPT_NAME + '_link_container',
    ACT_CONTAINER_CLASS = SCRIPT_NAME + '_act_container',
    
    CONTAINER_CLASS_LIST = [ LINK_CONTAINER_CLASS, ACT_CONTAINER_CLASS ],
    
    INTV_CHECK_MS = 300, // チェック間隔(単位：ms)
    MAX_CHECK_RETRY = 10, // 'div.stream-end' 要素が表示されてから、チェックを終了するまでのリトライ回数(タイミングにより、いったん表示されてもまた消える場合がある)
    WAIT_BEFORE_GIVEUP_SCROLL_SEC = 30, // 強制スクロールさせてタイムラインの続きを読み込む際に、いつまでも変化が見られず、諦めるまでの時間(単位:秒)
    LIMIT_STATUSES_RETWEETS_USER_NUMBER = 100, // statuses/retweets のユーザー数制限
    DEFAULT_STATUSES_RETWEETS_USER_NUMBER = 30, // statuses/retweets のデフォルトユーザー数
    LIMIT_MAX_AFTER_RETWEET_MINUTES = 60, // リツイート後のツイート取得時間(分)制限
    DEFAULT_MAX_AFTER_RETWEET_MINUTES = 10, // リツイート後のツイート取得時間(分)デフォルト
    LIMIT_MAX_BEFORE_RETWEET_MINUTES = 60, // リツイート前のツイート取得時間(分)制限
    DEFAULT_MAX_BEFORE_RETWEET_MINUTES = 10, // リツイート前のツイート取得時間(分)デフォルト
    
    ID_INC_PER_MSEC = Decimal.pow( 2, 22 ), // ミリ秒毎のID増分
    ID_INC_PER_SEC = ID_INC_PER_MSEC.mul( 1000 ), // 秒毎のID増分
    FIRST_TWEET_ID = 20,
    FIRST_TWEET_OFFSET_MSEC = 1142974214000,
    ID_INC_PER_SEC_LEGACY = Math.round( 1000 * ( 29694409027 - FIRST_TWEET_ID ) / ( 1288898870000 - FIRST_TWEET_OFFSET_MSEC ) ), // ID 切替以前の増加分
    // TODO: ID 切替以前は増加分がわからない
    // → 暫定的に、https://twitter.com/jack/status/20 (data-time-ms: 1142974214000) → https://twitter.com/Twitter/status/29694409027 (data-time-ms: 1288898870000) の平均をとる
    
    TWEPOCH_OFFSET_MSEC = 1288834974657,
    TWEPOCH_OFFSET_SEC = Math.ceil( TWEPOCH_OFFSET_MSEC / 1000 ), // 1288834974.657 sec (2011.11.04 01:42:54(UTC)) (via http://www.slideshare.net/pfi/id-15755280)
    ID_THRESHOLD = '300000000000000', // 2010.11.04 22時(UTC)頃に、IDが 30000000000以下から300000000000000以上に切り替え
    ID_BEFORE = null,
    ID_AFTER = null,
    ID_BEFORE_LEGACY = null,
    ID_AFTER_LEGACY = null,
    
    LINK_ICON_URL = [ // アイコン(48×48)
        'data:image/gif;base64,',
        'R0lGODlhYAAwAKECAP+WE6q4wv///////yH5BAEKAAIALAAAAABgADAAQAL+lI+pi+HBopwKWEDz',
        'fLx7p2nXSJZWiDZdyi7l9kEGd8Tg/NSxeRrjwesJfj4ejNZKFonKjM3WZASD0ariebNGpkKtxOMN',
        'vcLOFZkyToLPkzQbhzWHuaY3/GNPTPPWGF9fxxeHdEbH5DWI52UYaLf2h+AGKfA4OURy5JcQd3dj',
        'w1UBekkUBEVpxrn5RDV6scQaufclZykJWTlpS5aIG8WoW5WYxzjZ+wdsGWLMh8z2lAvrODhs+Mab',
        'Q/brGnZNaKV92NddCP63TB1+Swudbr4O2Wz9fow52/18ivQJLjpWanoF35p9RlzI8sfD1EB8AXcU',
        'RBgtVkJNC+8RhLiNn6gyCOfsxHM2j1m9ZB3ffDxTks3JJhZlaNGIAZHFORpR8jL5K08qdBGlpaS5',
        'khu2ZK/eFAAAOw=='
    ].join( '' ),
    
    SELECTOR_INFO = ( function () {
        var SELECTOR_INFO = {},
            container_selector_list = SELECTOR_INFO.container_selector_list = [
                'div.GridTimeline-items',
                'ol.stream-items',
                'ol.recent-tweets',
                'div.permalink-tweet-container',
                'div.GalleryTweet',
                'div.activity-popup-dialog-content',
                'ol.' + SCRIPT_NAME + '-recent-retweet-users'
            ],
            container_selector = SELECTOR_INFO.container_selector = container_selector_list.join( ',' ),
            
            tweet_class_names = SELECTOR_INFO.tweet_class_names = [ 'js-stream-tweet', 'tweet', 'js-tweet' ],
            simple_tweet_selector = SELECTOR_INFO.simple_tweet_selector = tweet_class_names.map( function ( class_name ) {
                return 'div.' + class_name;
            } ).join( ',' ),
            tweet_selector_list = SELECTOR_INFO.tweet_selector_list = [],
            
            activity_class_names = SELECTOR_INFO.activity_class_names = [ 'stream-item-activity-notification' ],
            activity_selector = SELECTOR_INFO.activity_selector = activity_class_names.map( function ( class_name ) {
                return 'div.' + class_name + '[data-activity-type]';
            } ).join( ',' ),
            
            action_to_tweet_container_selector_list = SELECTOR_INFO.action_to_tweet_container_selector_list = [
                'ol.activity-popup-users'
            ],
            action_to_tweet_container_selector = SELECTOR_INFO.action_to_tweet_container_selector = action_to_tweet_container_selector_list.join( ',' ),
            
            action_to_tweet_class_names = SELECTOR_INFO.action_to_tweet_class_names = [ 'js-actionable-user' ],
            action_to_tweet_selector = SELECTOR_INFO.action_to_tweet_selector = action_to_tweet_class_names.map( function ( class_name ) {
                return 'div.' + class_name + '[data-screen-name]';
            } ).join( ',' ),
            
            tweet_wrapper_selector = SELECTOR_INFO.tweet_wrapper_selector = 'div.StreamItem:first,div.Grid:first,li:first';
       
        container_selector_list.forEach( function ( container_selector_item ) {
            tweet_class_names.forEach( function ( tweet_class_name ) {
                tweet_selector_list.push( container_selector_item + ' div.' + tweet_class_name );
            } );
        } );
        
        SELECTOR_INFO.tweet_selector = tweet_selector_list.join( ',' );
        
        return SELECTOR_INFO;
    } )(),
    
    SEARCH_PARAMETERS = ( function () {
        var search_parameters = {},
            current_url = w.location.href,
            comparison_url  = current_url.replace( /&_replaced=1/, '' ), // ユーザータイムライン→検索タイムラインの切替時につけているマーク
            is_replaced = ( comparison_url != current_url );
        
        if ( ! w.opener ) {
            return {};
        }
        
        try {
            search_parameters = JSON.parse( w.name );
            
            if ( ! search_parameters ) {
                return {};
            }
            
            var is_matched = search_parameters.search_url_list.some( function ( search_url ) {
                    return ( search_url == comparison_url );
                } );
            
            if ( ! is_matched ) {
                return {};
            }
        }
        catch ( error ) {
            return {};
        }
        
        search_parameters.initial_search_url = current_url;
        
        //w.name = ''; // 誤動作しないようにクリアしようとしたが、出来ない
        //  "Execution of script 'twDisplayVicinity' failed! Cannot set property name of #<Object> which has only a getter" ( by Tampermonkey )
        
        return search_parameters;
    } )(),
    
    TWEET_ID_TO_RETWEETED_INFO = {};

//} end of global variables


// ■ 関数

function to_array( array_like_object ) {
    return Array.prototype.slice.call( array_like_object );
} // end of to_array()


function log_debug() {
    if ( ! DEBUG ) {
        return;
    }
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.log.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_debug()


function log_error() {
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.error.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_error()


var set_value = ( function () {
    if ( typeof GM_setValue != 'undefined' ) {
        return function ( name, value ) {
            return GM_setValue( name, value );
        };
    }
    return function ( name, value ) {
        return localStorage.setItem( name, value );
    };
} )(); // end of set_value()


var get_value = ( function () {
    if ( typeof GM_getValue != 'undefined' ) {
        return function ( name ) {
            var value = GM_getValue( name );
            
            // メモ： 値が存在しない場合、GM_getValue( name ) は undefined を返す
            return ( value === undefined ) ? null : value;
        };
    }
    return function ( name ) {
        // メモ： 値が存在しない場合、localStorage[ name ] は undefined を、localStorage.getItem( name ) は null を返す
        return localStorage.getItem( name );
    };
} )(); // end of get_value()


var object_extender = ( function () {
    function object_extender( base_object ) {
        var template = object_extender.template;
        
        template.prototype = base_object;
        
        var expanded_object = new template(),
            object_list = to_array( arguments );
        
        object_list.shift();
        object_list.forEach( function ( object ) {
            Object.keys( object ).forEach( function ( name ) {
                expanded_object[ name ] = object[ name ];
            } );
        } );
        
        return expanded_object;
    } // end of object_extender()
    
    
    object_extender.template = function () {};
    
    return object_extender;
} )(); // end of object_extender()


// 参考: [複数のクラス名の存在を確認（判定） | jQuery逆引き | Webサイト制作支援 | ShanaBrian Website](http://shanabrian.com/web/jquery/has-classes.php)
$.fn.hasClasses = function( selector, or_flag ) {
    var self = this,
        class_names,
        counter = 0;
    
    if ( typeof selector === 'string' ) {
        selector = selector.trim();
        class_names = ( selector.match( /^\./ ) ) ? selector.replace( /^\./, '' ).split( '.' ) : selector.split( ' ' );
    }
    else {
        class_names = selector;
    }
    class_names.forEach( function( class_name ) {
        if ( self.hasClass( class_name ) ) {
            counter ++;
        }
    } );
    
    if ( or_flag && 0 < counter ) {
        return true;
    }
    if ( counter === class_names.length ) {
        return true;
    }
    return false;
}; // end of $.fn.hasClasses()


// 参考: [日付フォーマットなど 日付系処理 - Qiita](http://qiita.com/osakanafish/items/c64fe8a34e7221e811d0)
function format_date( date, format, flag_utc ) {
    if ( ! format ) {
        format = 'YYYY-MM-DD hh:mm:ss.SSS';
    }
    
    var msec = ( '00' + ( ( flag_utc ) ? date.getUTCMilliseconds() : date.getMilliseconds() ) ).slice( -3 ),
        msec_index = 0;
    
    if ( flag_utc ) {
        format = format
            .replace( /YYYY/g, date.getUTCFullYear() )
            .replace( /MM/g, ( '0' + ( 1 + date.getUTCMonth() ) ).slice( -2 ) )
            .replace( /DD/g, ( '0' + date.getUTCDate() ).slice( -2 ) )
            .replace( /hh/g, ( '0' + date.getUTCHours() ).slice( -2 ) )
            .replace( /mm/g, ( '0' + date.getUTCMinutes() ).slice( -2 ) )
            .replace( /ss/g, ( '0' + date.getUTCSeconds() ).slice( -2 ) )
            .replace( /S/g, function ( all ) {
                return msec.charAt( msec_index ++ );
            } );
    }
    else {
        format = format
            .replace( /YYYY/g, date.getFullYear() )
            .replace( /MM/g, ( '0' + ( 1 + date.getMonth() ) ).slice( -2 ) )
            .replace( /DD/g, ( '0' + date.getDate() ).slice( -2 ) )
            .replace( /hh/g, ( '0' + date.getHours() ).slice( -2 ) )
            .replace( /mm/g, ( '0' + date.getMinutes() ).slice( -2 ) )
            .replace( /ss/g, ( '0' + date.getSeconds() ).slice( -2 ) )
            .replace( /S/g, function ( all ) {
                return msec.charAt( msec_index ++ );
            } );
    }
    
    return format;
} // end of format_date()


function bignum_cmp( bignum_left, bignum_right ) {
    return new Decimal( bignum_left ).cmp( bignum_right );
} // end of bignum_cmp()


var get_jq_html_fragment = ( function () {
    if ( ( ! d.implementation ) || ( typeof d.implementation.createHTMLDocument != 'function' ) ) {
        return function ( html ) {
            return $( '<div/>' ).html( html );
        };
    }
    
    // 解析段階での余分なネットワークアクセス（画像等の読み込み）抑制
    var html_document = d.implementation.createHTMLDocument(''),
        range = html_document.createRange();
    
    return function ( html ) {
        return $( range.createContextualFragment( html ) );
    };
} )(); // end of get_jq_html_fragment()


// Twitter のツイートID は 64 ビットで、以下のような構成をとっている
//   [63:63]( 1) 0(固定)
//   [62:22](41) timestamp: 現在の Unix Time(ms) から、1288834974657(ms) (2011/11/04 01:42:54 UTC) を引いたもの
//   [21:12](10) machine id: 生成器に割り当てられたID。datacenter id + worker id
//   [11: 0](12) 生成器ごとに採番するsequence番号
//
// 参考:
//   [Twitterのsnowflakeについて](https://www.slideshare.net/moaikids/20130901-snowflake)
//   [ツイートID生成とツイッターリアルタイム検索システムの話](https://www.slideshare.net/pfi/id-15755280)
function tweet_id_to_date( tweet_id ) {
    var bignum_tweet_id = new Decimal( tweet_id );
    
    if ( bignum_tweet_id.cmp( ID_THRESHOLD ) < 0 ) {
        // ツイートID仕様の切替(2010/11/04 22時 UTC頃)以前のものは未サポート
        return null;
    }
    return new Date( parseInt( bignum_tweet_id.div( ID_INC_PER_MSEC ).floor().add( TWEPOCH_OFFSET_MSEC ), 10 ) );
} // end of tweet_id_to_date()


function tweet_id_to_date_legacy( tweet_id ) {
    var bignum_tweet_id = new Decimal( tweet_id );
    
    if ( bignum_tweet_id.cmp( ID_THRESHOLD ) >= 0 ) {
        return tweet_id_to_date( tweet_id );
    }
    return new Date( parseInt( bignum_tweet_id.sub( 20 ).div( ID_INC_PER_SEC_LEGACY ).mul( 1000 ).floor().add( FIRST_TWEET_OFFSET_MSEC ), 10 ) );
} // end of tweet_id_to_date_legacy()


function datetime_to_tweet_id( datetime ) {
    try {
        var date = new Date( datetime ),
            utc_ms = date.getTime();
        
        if ( isNaN( utc_ms ) ) {
            return null;
        }
        
        var tweet_timestamp = Decimal.sub( utc_ms, TWEPOCH_OFFSET_MSEC );
        
        if ( tweet_timestamp.cmp( 0 ) < 0 ) {
            return null;
        }
        
        var bignum_tweet_id = tweet_timestamp.mul( ID_INC_PER_MSEC );
        
        if ( bignum_tweet_id.cmp( ID_THRESHOLD ) < 0 ) {
            // ツイートID仕様の切替(2010/11/04 22時 UTC頃)以前のものは未サポート
            return null;
        }
        return bignum_tweet_id.toString();
    }
    catch ( error ) {
        return null;
    }
} // end of datetime_to_tweet_id()


function get_date_from_tweet_id( tweet_id, offset_sec ) {
    var tweet_date = tweet_id_to_date( tweet_id );
    
    if ( ! tweet_date ) {
        return null;
    }
    
    return new Date( tweet_date.getTime() + ( ( offset_sec ) ? ( 1000 * offset_sec ) : 0 ) );
} // end of get_date_from_tweet_id()


function tweet_id_shift( tweet_id, offset_sec ) {
    var tweet_date_shift = get_date_from_tweet_id( tweet_id, offset_sec );
    
    if ( ! tweet_date_shift ) {
        return null;
    }
    
    return datetime_to_tweet_id( tweet_date_shift );
} // end of tweet_id_shift()


function get_gmt_date( time_sec ) {
    var date = new Date( 1000 * time_sec );
    
    return format_date( date, 'YYYY-MM-DD', true );
} // end of get_gmt_date()


function get_gmt_datetime( time_sec ) {
    var date = new Date( 1000 * time_sec );
    
    return format_date( date, 'YYYY-MM-DD_hh:mm:ss_GMT', true );
} // end of get_gmt_datetime()


function get_gmt_datetime_from_tweet_id( tweet_id, offset_sec ) {
    var tweet_date_shift = get_date_from_tweet_id( tweet_id, offset_sec );
    
    if ( ! tweet_date_shift ) {
        return null;
    }
    
    return format_date( tweet_date_shift, 'YYYY-MM-DD_hh:mm:ss_GMT', true );
} // end of get_gmt_datetime_from_tweet_id()


function get_tweet_id_from_utc_sec( utc_sec ) {
    if ( utc_sec < TWEPOCH_OFFSET_SEC ) {
        return null;
    }
    var twepoc_sec = Decimal.sub( utc_sec, TWEPOCH_OFFSET_SEC );
    
    return Decimal.mul( ID_INC_PER_SEC, twepoc_sec ).toString();
} // end of get_tweet_id_from_utc_sec()


function get_tweet_id_range( search_tweet_id, search_time_sec, reacted_tweet_id ) {
    if ( ( ! ID_BEFORE ) || ( ! ID_AFTER ) || ( ( ! search_tweet_id ) && ( ! search_time_sec ) ) ) {
        return null;
    }
    
    if ( ! search_tweet_id ) {
        search_tweet_id = get_tweet_id_from_utc_sec( search_time_sec );
        
        if ( ! search_tweet_id ) {
            return null;
        }
    }
    
    if ( bignum_cmp( search_tweet_id, ID_THRESHOLD ) < 0 ) {
        return null;
    }
    
    var current_id = new Decimal( search_tweet_id ),
        since_id = current_id.sub( ID_BEFORE ).sub( 1 ),
        max_id = current_id.add( ID_AFTER );
    
    if ( ( reacted_tweet_id ) && ( bignum_cmp( since_id, reacted_tweet_id ) < 0 ) ) {
        since_id = new Decimal( reacted_tweet_id ).sub( 1 );
    }
    
    log_debug( 'since_id:', since_id.toString(), ' current_id:', current_id.toString(), ' max_id:', max_id.toString() );
    
    return {
        current_id : current_id.toString(),
        since_id : since_id.toString(),
        max_id: max_id.toString()
    };
} // end of get_tweet_id_range()


function get_tweet_id_range_legacy( search_tweet_id, reacted_tweet_id ) {
    if ( ( ! ID_BEFORE_LEGACY ) || ( ! ID_AFTER_LEGACY ) || ( ! search_tweet_id ) ) {
        return null;
    }
    
    if ( bignum_cmp( ID_THRESHOLD, search_tweet_id ) <= 0 ) {
        return null;
    }
    
    var current_id = new Decimal( search_tweet_id ),
        since_id = current_id.sub( ID_BEFORE_LEGACY ).sub( -1 ),
        max_id = current_id.add( ID_AFTER_LEGACY );
    
    if ( ( reacted_tweet_id ) && ( bignum_cmp( since_id, reacted_tweet_id ) < 0 ) ) {
        since_id = new Decimal( reacted_tweet_id ).sub( -1 );
    }
    
    if ( since_id.cmp( 0 ) < 0 ) {
        since_id = new Decimal( 0 );
    }
    
    return {
        current_id : current_id.toString(),
        since_id : since_id.toString(),
        max_id: max_id.toString()
    };
} // end of get_tweet_id_range_legacy()


function get_screen_name_from_url( url ) {
    if ( ! url ) {
        url = w.location.href;
    }
    
    if ( ! url.match( /^(?:https?:\/\/[^\/]+)?\/([^\/]+)/ ) ) {
        return null;
    }
    
    return RegExp.$1;
} // end of get_screen_name_from_url()


function parse_individual_tweet_url( tweet_url ) {
    if ( ! tweet_url ) {
        tweet_url = w.location.href;
    }
    
    if ( ! tweet_url.match( /^(?:https?:\/\/[^\/]+)?\/([^\/]+)\/status(?:es)?\/(\d+)/ ) ) {
        return null;
    }
    
    return {
        screen_name : RegExp.$1,
        tweet_id : RegExp.$2
    };
} // end of parse_individual_tweet_url()


function get_search_info( parameters ) {
    parameters = ( parameters ) ? parameters : {};
    
    var screen_name = parameters.screen_name,
        search_tweet_id = parameters.search_tweet_id,
        reacted_tweet_id = parameters.reacted_tweet_id,
        tweet_id_range = parameters.tweet_id_range,
        search_time_sec = parameters.search_time_sec,
        search_time_range = parameters.search_time_range,
        since_id,
        max_id,
        since,
        until,
        query = null,
        search_url_list = [];
    
    if ( tweet_id_range ) {
        search_tweet_id = tweet_id_range.current_id;
    }
    else {
        tweet_id_range = get_tweet_id_range( search_tweet_id, search_time_sec, reacted_tweet_id );
    }
    
    if ( tweet_id_range ) {
        since_id = tweet_id_range.since_id;
        max_id = tweet_id_range.max_id;
        since = get_gmt_datetime_from_tweet_id( since_id );
        until = get_gmt_datetime_from_tweet_id( max_id, 1 );
        
        search_url_list.push( TIMELINE_API_BASE + screen_name + '/with_replies?max_position=' + Decimal.add( max_id, 1 ).toString() );
        // 0.2.3.10: max_id → max_position
        
        if ( OPTIONS.IGNORE_SINCE ) {
            query = 'from:' + screen_name + ' until:' + until;
        }
        else {
            query = 'from:' + screen_name + ' since:' + since + ' until:' + until;
        }
    }
    else {
        if ( search_time_sec ) {
            since = get_gmt_datetime( ( search_time_sec - ( OPTIONS.HOUR_BEFORE * 3600 ) ) );
            until = get_gmt_datetime( ( search_time_sec + ( OPTIONS.HOUR_AFTER * 3600 + 1 ) ) );
            
            if ( OPTIONS.IGNORE_SINCE ) {
                query = 'from:' + screen_name + ' until:' + until;
            }
            else {
                query = 'from:' + screen_name + ' since:' + since + ' until:' + until;
            }
        }
        else {
            tweet_id_range = get_tweet_id_range_legacy( search_tweet_id, reacted_tweet_id );
            
            if ( tweet_id_range ) {
                since_id = tweet_id_range.since_id;
                max_id = tweet_id_range.max_id;
                
                if ( OPTIONS.IGNORE_SINCE ) {
                    query = 'from:' + screen_name + ' max_id:' + max_id;
                }
                else {
                    query = 'from:' + screen_name + ' since_id:' + since_id + ' max_id:' + max_id;
                }
            }
            else {
                log_error( '[bug] search information is not specified !' );
                query = 'from:' + screen_name;
            }
        }
    }
    
    query += ' include:nativeretweets';
    
    search_url_list.push( SEARCH_API + '?q=' + encodeURIComponent( query ) + '&f=tweets' );
    //search_url_list.push( SEARCH_API + '?q=' + encodeURIComponent( query ) + '&f=tweets&vertical=default' );
    
    if ( OPTIONS.USE_SEARCH_TL_BY_DEFAULT ) {
        search_url_list.reverse();
    }
    
    return {
        search_url_list : search_url_list,
        search_parameters : {
            screen_name : screen_name,
            search_tweet_id : search_tweet_id,
            reacted_tweet_id : reacted_tweet_id,
            tweet_id_range : tweet_id_range,
            search_time_sec : search_time_sec,
            search_time_range : search_time_range,
            since_id : since_id,
            max_id : max_id,
            since : since,
            until : until,
            query : query,
            search_url_list : search_url_list
        }
    };
} // end of get_search_info()


function is_search_mode() {
    if ( ( ! SEARCH_PARAMETERS ) || ( typeof SEARCH_PARAMETERS.search_tweet_id == 'undefined' ) ) {
         return false;
    }
    
    if ( w.location.href != SEARCH_PARAMETERS.initial_search_url ) {
        return false;
    }
    
    return true;
} // end of is_search_mode()


function is_night_mode() {
    return ( $( '#user-dropdown .js-nightmode-icon' ).hasClasses( [ 'Icon--lightBulbOff', 'Icon--crescentFilled' ], true ) || $( 'html' ).hasClass( 'night_mode' ) );
} // end of is_night_mode()


function get_hide_threshold_tweet_id() {
    if ( ( ! OPTIONS.HIDE_NEWER_TWEETS ) || ( ! is_search_mode() ) ) {
        return 0;
    }
    
    var search_tweet_id = SEARCH_PARAMETERS.search_tweet_id,
        max_id = SEARCH_PARAMETERS.max_id,
        limit_tweet_id;
    
    if ( ( ! max_id ) || ( ! search_tweet_id ) ) {
        return 0;
    }
    
    if ( bignum_cmp( search_tweet_id, max_id ) < 0 ) {
        limit_tweet_id = max_id;
    }
    else {
        limit_tweet_id = search_tweet_id;
    }
    
    return Decimal.add( limit_tweet_id, 1 ).toString();
} // end of get_hide_threshold_tweet_id()


var open_child_window = ( function () {
        var child_window_counter = 0;
        
        return function ( url, options ) {
            if ( ! options ) {
                options = {};
            }
            
            var child_window = options.existing_window,
                name = '';
            
            if ( options.search_parameters ) {
                try {
                    options.search_parameters.child_window_id = '' + ( new Date().getTime() ) + '-' + ( ++ child_window_counter ); // window.name が被らないように細工
                    
                    name = JSON.stringify( options.search_parameters );
                }
                catch ( error ) {
                    log_debug( error );
                }
            }
            
            if ( child_window ) {
                if ( child_window.name != name ) {
                    child_window.name = name;
                }
                if ( child_window.location.href != url ) {
                    child_window.location.href = url;
                }
            }
            else {
                child_window = w.open( url, name );
            }
            
            return child_window;
        };
    } )(); // end of open_child_window()


var click_handler_saver = object_extender( {
        link_id_prefix : SCRIPT_NAME + '_link_',
        link_id_number : 0,
        link_map : [],
        
        
        set_click_handler : function ( jq_link, onclick ) {
            var self = this,
                link_id = ( self.link_id_prefix ) + ( self.link_id_number ++ );
            
            jq_link.attr( 'id', link_id );
            self.link_map[ link_id ] = onclick;
            
            jq_link
            .off( 'click' )
            .on( 'click', function ( event ) {
                onclick( $( this ), event );
                return false;
            } );
            
            // jq_link.on( 'click', onclick ) だと、ツイートを「開く」→「閉じる」した後等にonclickがコールされなくなってしまう(Twitter側のスクリプトでイベントを無効化している？)
            // jq_link.attr( 'onclick', 'javascript:return ' + SCRIPT_NAME + '_click_link' + '( this, window.event || event )' );
            // → [2015.03.20] CSP設定変更により、onclick 属性への設定ができなくなった
            //jq_link.attr( 'target', '_blank' );   //  CSPによるonclick(インラインイベントハンドラ)使用禁止対策
            // → document の mouseover イベントを監視し、onclick イベントが link_map に登録されている場合には、イベントを再設定するように修正
            
            return link_id;
        }, // end of set_click_handler()
        
        
        get_click_handler : function ( link_id ) {
            var self = this;
            
            return self.link_map[ link_id ];
        } // end of get_click_handler()
    } ),
    
    set_click_handler = function () {
        return click_handler_saver.set_click_handler.apply( click_handler_saver, arguments );
    },
    
    get_click_handler = function () {
        return click_handler_saver.get_click_handler.apply( click_handler_saver, arguments );
    };


var TemplateUserTimeline = {
        DEFAULT_UNTIL_ID : '9223372036854775807', // 0x7fffffffffffffff = 2^63-1
        
        timeline_status : null, // 'user' / 'search' / 'end' / 'error' / 'stop'
        
        init : function ( screen_name, parameters ) {
            if ( ! parameters ) {
                parameters = {};
            }
            var self = this,
                max_tweet_id = self.requested_max_tweet_id = parameters.max_tweet_id,
                max_date = self.max_date = parameters.max_date;
            
            if ( ! max_tweet_id ) {
                if ( max_date ) {
                    max_tweet_id = self.max_tweet_id_from_max_date = get_tweet_id_from_utc_sec( Math.floor( max_date.getTime() / 1000 ) );
                }
            }
            
            if ( max_tweet_id ) {
                self.timeline_status = 'user';
            }
            else {
                self.timeline_status = 'search';
            }
            self.screen_name = screen_name;
            self.until = ( max_date ) ? format_date( new Date( max_date.getTime() + 1000 ), 'YYYY-MM-DD_hh:mm:ss_GMT', true ) : null;
            self.fetched_min_id = self.until_id = ( max_tweet_id ) ? Decimal.add( max_tweet_id, 1 ).toString() : self.DEFAULT_UNTIL_ID;
            self.tweet_info_list = [];
            
            self.user_timeline_parameters = {
                max_position : self.until_id,
                
                api_endpoint : {
                    url : 'https://twitter.com/i/profiles/show/' + screen_name + '/timeline/with_replies',
                    data : {
                        include_available_features : 1,
                        include_entities : 1,
                        reset_error_state : false,
                        last_note_ts : null,
                        max_position : null
                    }
                }
            };
            
            self.search_timeline_parameters = {
                api_max_position : null,
                // ※ API で指定する max_position は数値ではなく、"TWEET-(from tweet id)-(to tweet id)-(長い文字列)==-T-0" のような文字列であることに注意
                //    最初はわからないため、HTML より data-min-position を読み取って使用する
                
                html_endpoint : {
                    url : 'https://twitter.com/search',
                    data : {
                        f : 'tweets',
                        vertical : 'default',
                        src : 'typd',
                        q : null
                    }
                },
                api_endpoint : {
                    url : 'https://twitter.com/i/search/timeline',
                    data : {
                        f : 'tweets',
                        vertical : 'default',
                        src : 'typd',
                        include_available_features : '1',
                        include_entities : '1',
                        reset_error_state : 'false',
                        q : null,
                        last_note_ts : null,
                        max_position : null
                    }
                }
            };
            
            return self;
        }, // end of init()
        
        
        fetch_tweet_info : function ( callback ) {
            var self = this,
                tweet_info = self.tweet_info_list.shift();
            
            if ( tweet_info ) {
                var check_tweet_id = ( tweet_info.retweet_id || tweet_info.tweet_id );
                
                if ( bignum_cmp( self.fetched_min_id, check_tweet_id ) <= 0 ) {
                    if ( self.timeline_status == 'stop' ) {
                        callback( {
                            tweet_info : null,
                            timeline_status : self.timeline_status
                        } );
                        return self;
                    }
                    return self.fetch_tweet_info( callback );
                }
                
                self.fetched_min_id = check_tweet_id;
                
                callback( {
                    tweet_info : tweet_info,
                    timeline_status : self.timeline_status
                } );
                
                return self;
            }
            
            switch ( self.timeline_status ) {
                case 'user' :
                    self.__get_next_user_timeline( function () {
                        return self.fetch_tweet_info( callback );
                    } );
                    break;
                
                case 'search' :
                    self.__get_next_search_timeline( function () {
                        return self.fetch_tweet_info( callback );
                    } );
                    break;
                
                default : // 'stop' / 'error' etc.
                    callback( {
                        tweet_info : tweet_info,
                        timeline_status : self.timeline_status
                    } );
                    break;
            }
            return self;
        }, // end of fetch_tweet_info()
        
        
        stop : function () {
            var self = this;
            
            self.timeline_status = 'stop';
        }, // end of stop()
        
        
        __get_next_user_timeline : function ( callback ) {
            var self = this,
                user_timeline_parameters = self.user_timeline_parameters,
                api_endpoint = user_timeline_parameters.api_endpoint,
                data = api_endpoint.data;
            
            data.last_note_ts = self.__get_last_note_ts();
            data.max_position = user_timeline_parameters.max_position;
            
            $.getJSON( api_endpoint.url, data )
            .done( function ( json ) {
                var tweet_info_list = self.tweet_info_list,
                    min_tweet_id = self.DEFAULT_UNTIL_ID,
                    jq_html_fragment = get_jq_html_fragment( json.items_html );
                
                jq_html_fragment.find( '.js-stream-item' ).each( function () {
                    var jq_stream_item = $( this ),
                        tweet_info = self.__get_tweet_info( jq_stream_item );
                    
                    if ( ( ! tweet_info ) || ( ! tweet_info.tweet_id  ) ) {
                        return;
                    }
                    
                    tweet_info.jq_stream_item = jq_stream_item;
                    tweet_info.timeline_kind = 'user-timeline';
                    
                    tweet_info_list.push( tweet_info );
                    
                    if ( bignum_cmp( tweet_info.tweet_id, min_tweet_id ) < 0 ) {
                        min_tweet_id = tweet_info.tweet_id;
                    }
                } );
                
                log_debug( '__get_next_user_timeline() min_position = ', json.min_position );
                
                if ( json.min_position ) {
                    user_timeline_parameters.max_position = json.min_position;
                }
                else if ( bignum_cmp( min_tweet_id, user_timeline_parameters.max_position ) < 0 ) {
                    user_timeline_parameters.max_position = min_tweet_id;
                }
                else {
                    self.timeline_status = 'search';
                }
                
                if ( ! json.has_more_items ) {
                    self.timeline_status = 'search';
                }
            } )
            .fail( function ( jqXHR, textStatus, errorThrown ) {
                log_error( api_endpoint.url, textStatus );
                self.timeline_status = 'error';
            } )
            .always( function () {
                callback();
            } );
        }, // end of __get_next_user_timeline()
        
        
        __get_next_search_timeline : function ( callback ) {
            var self = this,
                search_timeline_parameters = self.search_timeline_parameters;
            
            if ( ! search_timeline_parameters.api_max_position ) {
                // 初めに HTML から data-min-position を取得する必要あり
                return self.__get_first_search_timeline( callback );
            }
            
            var api_endpoint = search_timeline_parameters.api_endpoint,
                api_data = api_endpoint.data;
            
            api_data.last_note_ts = self.__get_last_note_ts();
            api_data.max_position = search_timeline_parameters.api_max_position;
            
            $.getJSON( api_endpoint.url, api_data )
            .done( function ( json ) {
                var tweet_info_list = self.tweet_info_list,
                    json_inner = ( json.inner ) ? json.inner : ( ( json.items_html && json.min_position ) ? json : null );
                    // items_html/min_position が json.inner ではなく、json 直下にある場合もある（未ログイン時など）
                
                if ( ( ! json_inner ) ||  ( ! json_inner.items_html ) || ( ! json_inner.min_position ) ) {
                    log_error( 'items not found' );
                    self.timeline_status = 'error';
                    return;
                }
                
                var jq_html_fragment = get_jq_html_fragment( json_inner.items_html );
                
                jq_html_fragment.find( '.js-stream-item' ).each( function () {
                    var jq_stream_item = $( this ),
                        tweet_info = self.__get_tweet_info( jq_stream_item );
                    
                    if ( ( ! tweet_info ) || ( ! tweet_info.tweet_id  ) ) {
                        return;
                    }
                    
                    tweet_info.jq_stream_item = jq_stream_item;
                    tweet_info.timeline_kind = 'search-timeline';
                    
                    tweet_info_list.push( tweet_info );
                } );
                
                log_debug( '__get_next_search_timeline() : min_position = ', json_inner.min_position );
                
                if ( json_inner.min_position ) {
                    // ※ data-min-position は数値ではなく、"TWEET-(from tweet id)-(to tweet id)-(長い文字列)==-T-0" の形式→文字列として比較
                    if ( json_inner.min_position != search_timeline_parameters.api_max_position ) {
                        search_timeline_parameters.api_max_position = json_inner.min_position;
                    }
                    else {
                        // min_position に変化がなければ終了とみなす
                        self.timeline_status = 'end';
                    }
                }
                else {
                    self.timeline_status = 'end';
                }
                // 終了判定としては使えなかった（has_more_items が false でも、実際に検索したらまだツイートがある場合がある模様）
                //{
                //if ( ! json_inner.has_more_items ) {
                //    self.timeline_status = 'end';
                //}
                //}
            } )
            .fail( function ( jqXHR, textStatus, errorThrown ) {
                log_error( api_endpoint.url, textStatus );
                self.timeline_status = 'error';
            } )
            .always( function () {
                callback();
            } );
            
            return self;
        }, // end of __get_next_search_timeline()
        
        
        __get_first_search_timeline : function ( callback ) {
            var self = this,
                search_timeline_parameters = self.search_timeline_parameters,
                html_endpoint = search_timeline_parameters.html_endpoint,
                html_data = html_endpoint.data,
                api_endpoint = search_timeline_parameters.api_endpoint,
                api_data = api_endpoint.data;
            
            html_data.q = 'from:' + self.screen_name + ' include:nativeretweets';
            
            if ( ( self.requested_max_tweet_id ) || ( ! self.until ) ) {
                html_data.q += ' max_id:' + Decimal.sub( self.user_timeline_parameters.max_position, 1 ).toString();
                // ユーザータイムラインでの最後の max_position を使用
            }
            else {
                html_data.q += ' until:' + self.until;
            }
            
            api_endpoint.data.q = html_data.q; // クエリは最初に設定したもので共通
            
            $.ajax( {
                type : 'GET',
                url : html_endpoint.url,
                data : html_data,
                dataType : 'html'
            } )
            .done( function ( html ) {
                var jq_html_fragment = get_jq_html_fragment( html ),
                    tweet_info_list = self.tweet_info_list,
                    api_max_position = search_timeline_parameters.api_max_position = jq_html_fragment.find( '*[data-min-position]' ).attr( 'data-min-position' );
                    // ※ data-min-position は数値ではなく、"TWEET-(from tweet id)-(to tweet id)-(長い文字列)==-T-0" みたいになっていることに注意
                
                log_debug( '__get_first_search_timeline() : data-min-position = ', api_max_position );
                
                if ( ! api_max_position ) {
                    if ( jq_html_fragment.find( 'div.SearchEmptyTimeline' ).length <= 0 ) {
                        log_error( '"data-min-position" not found' );
                        self.timeline_status = 'error';
                        return;
                    }
                    
                    self.timeline_status = 'end';
                    return;
                }
                
                jq_html_fragment.find( '.js-stream-item' ).each( function () {
                    var jq_stream_item = $( this ),
                        tweet_info = self.__get_tweet_info( jq_stream_item );
                    
                    if ( ( ! tweet_info ) || ( ! tweet_info.tweet_id  ) ) {
                        return;
                    }
                    
                    tweet_info.jq_stream_item = jq_stream_item;
                    tweet_info.timeline_kind = 'search-timeline';
                    
                    tweet_info_list.push( tweet_info );
                } );
            } )
            .fail( function ( jqXHR, textStatus, errorThrown ) {
                log_error( html_endpoint.url, textStatus );
                self.timeline_status = 'error';
            } )
            .always( function () {
                callback();
            } );
            
            return self;
        }, // end of __get_first_search_timeline()
        
        
        __get_last_note_ts : function () {
            var self = this,
                last_note_ts = new Date().getTime();
            
            return last_note_ts;
        }, // end of __get_last_note_ts()
        
        
        __get_tweet_info : function ( jq_tweet_container ) {
            var tweet_info = {},
                tweet_url,
                date,
                timestamp_ms,
                image_urls = [],
                jq_tweet = jq_tweet_container.find( '.js-stream-tweet' );
            
            if ( jq_tweet.length <= 0 ) {
                return null;
            }
            
            tweet_url = jq_tweet_container.find( '.js-permalink' ).attr( 'href' );
            if ( ! tweet_url ) {
                // '.js-stream-item' のうち、ツイートでないために Permalink が取得できないものもある（「タグ付けされたユーザー」等）
                return null;
            }
            if ( tweet_url.charAt( 0 ) == '/' ) {
                tweet_url = 'https://twitter.com' + tweet_url;
            }
            
            try {
                tweet_info.tweet_url = tweet_url;
                tweet_info.tweet_id = jq_tweet.attr( 'data-tweet-id' );
                tweet_info.tweet_screen_name = jq_tweet.attr( 'data-screen-name' );
                tweet_info.retweet_id = jq_tweet.attr( 'data-retweet-id' );
                tweet_info.retweeter = jq_tweet.attr( 'data-retweeter' );
                tweet_info.timestamp_ms = timestamp_ms = jq_tweet.find( '*[data-time-ms]' ).attr( 'data-time-ms' );
                tweet_info.date = date = new Date( parseInt( timestamp_ms, 10 ) );
                tweet_info.tweet_text = jq_tweet.find( '.js-tweet-text, .tweet-text' ).text();
            }
            catch ( error ) {
                // '.js-stream-item' のうち、ツイートでないために screen_name 等が取得できないものもある（「タグ付けされたユーザー」等）
                return null;
            }
            return tweet_info;
        } // end of __get_tweet_info()
        
    }; // end of TemplateUserTimeline


var recent_retweet_users_dialog = object_extender( {
        dialog_template : [
            '<div id="#SCRIPT_NAME#-dialog-container">',
            '  <div class="#SCRIPT_NAME#-dialog modal-content">',
            '    <div class="#SCRIPT_NAME#-header-container modal-header clearfix">',
            '      <h3 class="modal-title"></h3>',
            '      <span class="#SCRIPT_NAME#-button-close Icon Icon--close Icon--large" title="#CLOSE#""></span>',
            '    </div>',
            '    <div class="#SCRIPT_NAME#-content-container clearfix">',
            '      <div class="loading">',
            '        <span class="spinner-bigger"></span>',
            '      </div>',
            '      <ol class="activity-popup-users #SCRIPT_NAME#-recent-retweet-users" id="#SCRIPT_NAME#-recent-retweet-users">',
            '      </ol>',
            '    </div>',
            '    <div id="#SCRIPT_NAME#-shortcut-container" class="modal-content"><table><tbody></tbody></table></div>',
            '  </div>',
            '</div>'
        ].join( '\n' ),
        
        shortcut_template : [
            '<tr><td class="shortcut"><b class="sc-key"></b></td><td class="shortcut-label"></td></tr>'
        ].join( '\n' ),
        
        stream_item_header_template : [
            '<div class="stream-item-header">',
            '  <a class="account-group js-user-profile-link" href="/#SCREEN_NAME#" rel="noopener">',
            '    <img class="avatar js-action-profile-avatar" src="#ICON_URL#" alt="" data-user-id="#USER_ID#">',
            '    <strong class="fullname">#USER_NAME#</strong><span class="UserBadges"></span><span class="UserNameBreak">&nbsp;</span>',
            '    <span class="username u-dir" dir="ltr">@<b>#SCREEN_NAME#</b></span>',
            '  </a>',
            '</div>'
        ].join( '\n' ),
        
        timestamp_template : [
            '<small class="time">',
            '  <a href="/#SCREEN_NAME#/status/#TWEET_ID#" class="tweet-timestamp js-permalink js-nav js-tooltip" data-conversation-id="" data-original-title="#TIMESTAMP#">',
            '    <span class="_timestamp js-short-timestamp" data-aria-label-part="last" data-time="#DATA_TIME#" data-time-ms="#DATA_TIME_MS#" data-long-form="true">#TIMESTAMP_SHORT#</span>',
            '  </a>',
            '</small>'
        ].join( '\n' ),
        
        user_template : [
            '<li class="js-stream-item stream-item" data-item-id="#USER_ID#" id="stream-item-user-#USER_ID#" data-item-type="user">',
            '  <div class="account js-actionable-user js-profile-popup-actionable" data-screen-name="#SCREEN_NAME#" data-user-id="#USER_ID#" data-name="#USER_NAME#" data-emojified-name="" data-feedback-token="" data-impression-id="" data-retweeted-tweet-id="#RETWEETED_TWEET_ID#" data-retweet-id="#RETWEET_ID#">',
            '    <div class="activity-user-profile-content">',
            '      <div class="content">',
            '        #STREAM_ITEM_HEADER#',
            '        <p class="bio u-dir" dir="ltr"></p>',
            '      </div>',
            '    </div>',
            '    <div class="IconContainer js-tooltip load-item" data-original-title="">',
            '      <button class="btn"></button>',
            '    </div>',
            '    <div class="IconContainer js-tooltip close-item" data-original-title="">',
            '      <button class="btn"></button>',
            '    </div>',
            '    <div class="IconContainer js-tooltip open-item" data-original-title="">',
            '      <button class="btn"></button>',
            '    </div>',
            '    <div class="loading">',
            '      <span class="spinner-bigger"></span>',
            '    </div>',
            '  </div>',
            '</li>'
        ].join( '\n' ),
        
        reference_to_retweet_button_template: [
            '    <div class="IconContainer js-tooltip" data-original-title="">',
            '      <button class="btn"></button>',
            '    </div>'
        ].join( '\n' ),
        
        retweet_timeinfo_template : [
            '<li class="js-stream-item stream-item stream-item-retweeted">',
            '  <div class="tweet js-stream-tweet retweeted" data-item-id="#TWEET_ID#" data-screen-name="#SCREEN_NAME#">',
            '    <div class="context">',
            '      <div class="tweet-context with-icn">',
            '        <span class="Icon Icon--small Icon--retweeted"></span>',
            '        <span class="_timestamp js-short-timestamp""></span>',
            '      </div>',
            '    </div>',
            '    <div class="content">',
            '      #STREAM_ITEM_HEADER#',
            '      <div class="js-tweet-text-container">',
            '        <p class="TweetTextSize js-tweet-text tweet-text"></p>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</li>'
        ].join( '\n' ),
        
        shortcut_list : [
            { key : 'a', label : ( LANGUAGE == 'ja' ) ? '全て取得／開く' : 'Load or Open All' },
            { key : 's', label : ( LANGUAGE == 'ja' ) ? '全て閉じる' : 'Close All' },
            { key : 'j', label : ( LANGUAGE == 'ja' ) ? '下へ' : 'Down' },
            { key : 'k', label : ( LANGUAGE == 'ja' ) ? '上へ' : 'Up' },
            { key : 'o', label : ( LANGUAGE == 'ja' ) ? '取得／開く' : 'Load or Open' },
            { key : 'c', label : ( LANGUAGE == 'ja' ) ? '閉じる' : 'Close' },
            { key : 'l', label : ( LANGUAGE == 'ja' ) ? '開閉(トグル)' : 'Toggle(Open/Close)' },
            { key : 'f', label : ( LANGUAGE == 'ja' ) ? '近傍ツイート検索' : 'Search vicinity tweets' },
            { key : 't', label : ( LANGUAGE == 'ja' ) ? 'ツイートを開く' : 'Open this tweet' },
            { key : 'u', label : ( LANGUAGE == 'ja' ) ? 'ユーザープロファイルを開く' : "Open user's profile" },
            { key : 'Esc', label : ( LANGUAGE == 'ja' ) ? 'ダイアログを閉じる' : 'Close this dialog' },
            { key : '?', label : ( LANGUAGE == 'ja' ) ? 'ヘルプ' : 'Help' }
        ],
        
        init : function () {
            var self = this,
                
                user_template = self.user_template = self.user_template.replace( /#STREAM_ITEM_HEADER#/g, self.stream_item_header_template ),
                retweet_timeinfo_template = self.retweet_timeinfo_template = self.retweet_timeinfo_template.replace( /#STREAM_ITEM_HEADER#/g, self.stream_item_header_template ),
                retweet_user_info_list_cache = self.retweet_user_info_list_cache = {},
                
                jq_dialog_container = self.jq_dialog_container = $(
                    self.dialog_template
                    .replace( /#SCRIPT_NAME#/g, SCRIPT_NAME )
                    .replace( /#CLOSE#/g, OPTIONS.CLOSE_TEXT )
                )
                .css( {
                    'position' : 'fixed',
                    'top' : '0',
                    'right' : '0',
                    'bottom' : '0',
                    'left' : '0',
                    'overflow' : 'auto',
                    //'z-index' : '3000',
                    'z-index' : '1011', // プロフィールのポップアップ表示(z-index:1011)が表示され、個別ツイート(z-index:1010)に隠されないように
                    'background' : 'rgba( 0, 0, 0, 0.8 )'
                } )
                .on( 'click', function ( event ) {
                    var jq_target = $( event.target );
                    
                    if ( jq_target.attr( 'id' ) != jq_dialog_container.attr( 'id' ) ) {
                        return;
                    }
                    event.stopPropagation();
                    event.preventDefault();
                    
                    self.close();
                    
                    return false;
                } ),
                
                jq_dialog = self.jq_dialog = jq_dialog_container.find( '.' + SCRIPT_NAME + '-dialog' ).css( {
                    'position' : 'absolute',
                    'top' : '50%',
                    'left' : '50%',
                    'width' : '640px',
                    'height' : '480px',
                    'margin' : '-240px 0px 0px -320px',
                    'padding' : '0 0 0 0',
                    'overflow-x' : 'hidden',
                    'overflow-y' : 'hidden',
                    'border-radius' : '6px',
                    'background' : ( is_night_mode() ? '#182430' : '#f5f8fa' )
                } ),
                
                jq_header_container = self.jq_header_container = jq_dialog.find( '.' + SCRIPT_NAME + '-header-container' ).css( {
                    'width' : '100%',
                    'height' : '50px',
                    'position' : 'relative',
                    'margin' : '0 0 0 0',
                    'padding' : '0 0 0 0'
                } ),
                
                jq_title = self.jq_title = jq_header_container.find( 'h3' ).css( {
                    'width' : '100%',
                    'height' : '100%',
                    'text-align' : 'center',
                    'padding-top' : '14px'
                } ),
                
                jq_close = self.jq_close = jq_header_container.find( '.' + SCRIPT_NAME + '-button-close' ).css( {
                    'position' : 'absolute',
                    'top' : '2px',
                    'right' : '2px',
                    'cursor' : 'pointer'
                } )
                .on( 'click', function ( event ) {
                    event.stopPropagation();
                    event.preventDefault();
                    
                    self.close();
                    
                    return false;
                } ),
                
                jq_content_container = self.jq_content_container = jq_dialog.find( '.' + SCRIPT_NAME + '-content-container' ).css( {
                    'width' : '100%',
                    'height' : '430px',
                    'position' : 'relative'
                } ),
                
                jq_loading = self.jq_loading = jq_content_container.find( '.loading' ).css( {
                    'position' : 'absolute',
                    'top' : '50%',
                    'left' : '50%',
                    'transform' : 'translate(-50%, -50%)',
                    'z-index' : '10001'
                } ),
                
                jq_user_list = self.jq_user_list = jq_content_container.find( 'ol.activity-popup-users' ).css( {
                    'width' : '100%',
                    'height' : '100%',
                    'max-height' : '100%',
                    'padding' : '0 0 0 0',
                    'overflow-y' : 'scroll',
                    'overflow-x' : 'hidden'
                } ),
                
                jq_shortcut_container = self.jq_shortcut_container = jq_dialog.find( '#' + SCRIPT_NAME + '-shortcut-container' ).css( {
                    'position' : 'absolute',
                    'top' : '48px',
                    'left' : '16px',
                    'z-index' : '10002',
                    'padding' : '12px',
                    'box-shadow' : '0px 0px 3px 1px'
                } )
                .hide(),
                
                jq_shortcut_tbody = jq_shortcut_container.find( 'tbody' ).css( {
                } );
            
            self.shortcut_list.forEach( function ( shortcut ) {
                var jq_tr = $( self.shortcut_template ),
                    
                    jq_shortcut = jq_tr.find( 'td.shortcut' ).css( {
                        'min-width' : '40px',
                        'padding' : '2px'
                    } ),
                    
                    jq_label = jq_tr.find( 'td.shortcut-label' ).css( {
                        'opacity' : '0.8'
                    } )
                    .text( shortcut.label );
                
                jq_shortcut.find( 'b.sc-key' ).text( shortcut.key );
                
                jq_shortcut_tbody.append( jq_tr );
            } );
            
            jq_dialog_container.hide();
            
            //$( 'body' ).append( jq_dialog_container );
            //$( '#timeline' ).append( jq_dialog_container ); // div#timeline 下に挿入することで、プロフィールポップアップが自動的に機能する
            // TODO: このタイミングで挿入すると、ページ遷移（ホーム→個別など）の際に消されてしまう
            // → open() が呼ばれたときに逐次挿入
            
            self.current_request_id = 0;
            self.mouse_wheel_event_name = ( 'onwheel' in d ) ? 'wheel' : ( ( 'onmousewheel' in d ) ? 'mousewheel' : 'DOMMouseScroll' );
            
            return self;
        }, // end of init()
        
        
        open : function ( retweeted_tweet_id ) {
            var self = this,
                jq_dialog_container = self.jq_dialog_container,
                jq_dialog = self.jq_dialog,
                jq_header_container = self.jq_header_container,
                jq_title = self.jq_title,
                jq_loading = self.jq_loading,
                jq_user_list = self.jq_user_list,
                jq_shortcut_container = self.jq_shortcut_container,
                stream_item_cursor = self.stream_item_cursor = self.__get_stream_item_cursor(),
                jq_timeline = $( '#timeline' );
            
            ( ( 0 < jq_timeline.length ) ? jq_timeline : $( 'body' ) ).append( jq_dialog_container ); // div#timeline 下に挿入することで、プロフィールポップアップが自動的に機能する
            // TODO: div#timeline が存在しないケース（個別ツイートを単独で表示した場合等）は対応できない
            
            self.retweeted_tweet_id = retweeted_tweet_id;
            
            self.saved_body_overflow = $( d.body ).get( 0 ).style.overflow;
            self.saved_body_overflow_x = $( d.body ).get( 0 ).style.overflowX;
            self.saved_body_overflow_y = $( d.body ).get( 0 ).style.overflowY;
            // $( 'body' ).css( 'overflow' ) の値を保存していると、タイムライン→個別ツイート→[Re:RT]→[Esc]→[Esc]でタイムラインに戻った時、スクロールバーが消えてしまう不具合があった
            // ※ $( 'body' ).css( 'overflow' ) だと getComputedStyle() による値が取れてしまうため、element.style を取得したい場合には適さない
            //   例えば、個別ツイートを開いた場合、body の class に 'overlay-enabled' が追加され、overflow:hidden 状態になるが（body.style.overflow は
            //   変化していない）、この時、$( 'body' ).css( 'overflow' ) は "hidden" を返してくる
            
            $( d.body )
            .on( 'keypress.rert', function ( event ){
                var key_code = event.which;
                
                if (
                    ( 65 <= key_code && key_code <= 90 ) || // [A]-[Z]
                    ( 97 <= key_code && key_code <= 122 ) || // [a]-[z]
                    ( 48 <= key_code && key_code <= 57 ) || // [0]-[9]
                    ( 44 <= key_code && key_code <= 47 ) || // [,][-][.][/]
                    ( 60 <= key_code && key_code <= 63 ) || // [<][=][>][?]
                    ( key_code == 13 ) // [Enter]
                ) {
                    if ( event.altKey || event.ctrlKey ) {
                        return;
                    }
                    
                    // オーバーレイ表示中は、標準のショートカットキーを無効化
                    event.stopPropagation();
                    event.preventDefault();
                    return false;
                }
            } )
            .on( 'keydown.rert', function ( event ) {
                var key_code = event.keyCode;
                
                if (
                    ( 65 <= key_code && key_code <= 90 ) || // [a-z][A-Z]
                    ( 48 <= key_code && key_code <= 57 ) || // [0-9]
                    ( 188 <= key_code && key_code <= 191 ) || // [,-./][<=>?]
                    ( key_code == 13 ) || // [Enter]
                    ( key_code == 27 ) // [Esc]
                ) {
                    if ( event.altKey || event.ctrlKey ) {
                        return;
                    }
                    event.stopPropagation();
                    event.preventDefault();
                }
                else {
                    // 上記以外のキーについては何もしない（ブラウザのデフォルト動作を受け付ける）
                    return;
                }
                
                var jq_help_button = jq_header_container.find( 'div.help button' ),
                    is_help_opened = jq_help_button.hasClass( 'open' );
                
                if ( is_help_opened ) {
                    if ( ( key_code != 191 ) && ( key_code != 27 ) ) {
                        // ヘルプ表示時は [?] と [Esc] 以外は受け付けない
                        return false;
                    }
                }
                
                switch ( key_code ) {
                    case 65 : // [a]
                        var jq_load_all_button = jq_header_container.find( 'div.load-all button' ),
                            jq_open_all_button = jq_header_container.find( 'div.open-all button' );
                        
                        if ( jq_load_all_button.is( ':hidden' ) && jq_open_all_button.is( ':hidden' ) ) {
                            break;
                        }
                        
                        if ( jq_load_all_button.is( ':visible' ) ) {
                            jq_load_all_button.click();
                        }
                        else {
                            jq_open_all_button.click();
                        }
                        
                        break;
                        
                    case 83 : // [s]
                        var jq_close_all_button = jq_header_container.find( 'div.close-all button' );
                        
                        if ( jq_close_all_button.is( ':hidden' ) ) {
                            break;
                        }
                        
                        jq_close_all_button.click();
                        
                        break;
                    
                    case 74 : // [j]
                        stream_item_cursor.down();
                        
                        break;
                    
                    case 75 : // [k]
                        stream_item_cursor.up();
                        
                        break;
                    
                    case 79 : // [o]
                        stream_item_cursor.open();
                        
                        break;
                    
                    case 67 : // [c]
                        stream_item_cursor.close();
                        
                        break;
                    
                    case 76 : // [l]
                        stream_item_cursor.toggle();
                        
                        break;
                    
                    case 70 : // [f]
                        stream_item_cursor.open_vicinity_link();
                        
                        break;
                    
                    case 84 : // [t]
                        stream_item_cursor.open_tweet();
                        
                        break;
                    
                    case 85 : // [u]
                        stream_item_cursor.open_user_profile();
                        
                        break;
                    
                    case 13 : // [Enter]
                        stream_item_cursor.toggle_retweet();
                        
                        break;
                    
                    case 191 : // [?]
                        jq_help_button.click();
                        
                        break;
                    
                    case 69 : // [e]
                        self.close();
                        
                        break;
                        
                    case 27 : // [ESC]
                        if ( is_help_opened ) {
                            jq_help_button.click();
                        }
                        else {
                            self.close();
                        }
                        
                        break;
                }
                
                return false;
            } )
            .css( {
                // ダイアログを出している間は body のスクロールをさせない
                'overflow-x' : 'hidden',
                'overflow-y' : 'hidden'
            } );
            
            // デフォルトのマウスホイール動作を無効化し、ユーザーリスト部分のみマウスホイールが効くようにする
            // → TODO: Firefox でスクロールがぎこちなくなるので保留
            //{
            //$( d ).on( self.mouse_wheel_event_name, function ( event ) {
            //    event.stopPropagation();
            //    event.preventDefault();
            //    
            //    return false;
            //} );
            //
            //$( jq_user_list ).on( self.mouse_wheel_event_name, function ( event ) {
            //    var delta = ( event.originalEvent.deltaY ) ? -( event.originalEvent.deltaY ) : ( ( event.originalEvent.wheelDelta ) ? event.originalEvent.wheelDelta : -( event.originalEvent.detail ) );
            //    jq_user_list.scrollTop( jq_user_list.scrollTop() - delta );
            //    
            //    event.stopPropagation();
            //    event.preventDefault();
            //    
            //    return false;
            //} );
            //}
            
            jq_shortcut_container.hide();
            
            jq_header_container.find( 'div.IconContainer' ).remove();
            jq_user_list.empty();
            jq_title.css( {
                'color' : 'inherit'
            } )
            .text( OPTIONS.LOADING_TEXT );
            jq_loading.show();
            
            self.current_request_id ++;
            
            self.__load_recent_retweet_user_info( self.current_request_id, retweeted_tweet_id, function ( request_id, result_message, retweet_user_info_list ) {
                if ( result_message != 'ok' ) {
                    jq_loading.hide();
                    
                    if ( result_message != 'ignore' ) {
                        jq_title.css( {
                            'color' : 'red'
                        } )
                        .text( OPTIONS.LOADING_ERROR_TEXT );
                    }
                    return;
                }
                
                var load_image_counter = 0,
                    user_id_map = {},
                    retweet_user_info_to_show_list = [],
                    max_user_number = self.__get_max_user_number(),
                    timeout_timer_id = setTimeout( function () {
                        timeout_timer_id = null;
                        check_all_images_loaded();
                    }, 1 ),
                    is_completed = false;
                
                
                function check_all_images_loaded() {
                    if ( is_completed ) {
                        return;
                    }
                    
                    if ( request_id != self.current_request_id ) {
                        if ( timeout_timer_id ) {
                            clearTimeout( timeout_timer_id );
                            timeout_timer_id = null;
                        }
                        return;
                    }
                    
                    if ( timeout_timer_id ) {
                        load_image_counter --;
                        
                        if ( 0 < load_image_counter ) {
                            return;
                        }
                    }
                    
                    is_completed = true;
                    
                    if ( timeout_timer_id ) {
                        clearTimeout( timeout_timer_id );
                        timeout_timer_id = null;
                    }
                    
                    self.screen_name_to_retweet_user_info_map = {};
                    
                    retweet_user_info_to_show_list.forEach( function( retweet_user_info ) {
                        self.screen_name_to_retweet_user_info_map[ retweet_user_info.user.screen_name ] = retweet_user_info;
                        self.__insert_user( retweeted_tweet_id, retweet_user_info );
                    } );
                    
                    self.retweet_user_info_to_show_list = retweet_user_info_to_show_list;
                    
                    var jq_spacer = $( '<li class="spacer"></li>' ).css( {
                            'height' : '14px'
                        } );
                    
                    self.jq_user_list.append( jq_spacer );
                    
                    jq_title.text( OPTIONS.RECENT_RETWEET_USERS_TEXT );
                    
                    jq_loading.hide();
                    
                    stream_item_cursor.init( jq_user_list );
                    
                    if ( retweet_user_info_to_show_list.length <= 0 ) {
                        return;
                    }
                    
                    var jq_load_all_button_wrapper = $( self.reference_to_retweet_button_template ).css( {
                            'position' : 'absolute',
                            'bottom' : '8px',
                            'right' : '24px'
                        } )
                        .addClass( 'load-all' )
                        .attr( 'data-original-title', OPTIONS.REFERECE_TO_RETWEET_LOAD_ALL_BUTTON_TITLE ),
                        
                        jq_load_all_button = jq_load_all_button_wrapper.find( 'button.btn' ).css( {
                            'font-size' : '14px',
                            'padding' : '6px 8px',
                            'cursor' : 'pointer'
                        } )
                        .text( OPTIONS.REFERECE_TO_RETWEET_LOAD_ALL_BUTTON_TEXT )
                        .on( 'click', function ( event ) {
                            self.jq_user_list.find( 'div.IconContainer.load-item button.btn' ).each( function () {
                                var jq_load_button = $( this );
                                
                                if ( jq_load_button.is( ':hidden' ) ) {
                                    return;
                                }
                                jq_load_button.click();
                            } );
                            
                            jq_load_all_button_wrapper.remove();
                            jq_close_all_button_wrapper.show();
                            jq_open_all_button_wrapper.show();
                            
                            event.stopPropagation();
                            event.preventDefault();
                            
                            return false;
                        } ),
                        
                        jq_close_all_button_wrapper = $( self.reference_to_retweet_button_template ).css( {
                            'position' : 'absolute',
                            'bottom' : '8px',
                            'right' : '24px'
                        } )
                        .addClass( 'close-all' )
                        .attr( 'data-original-title', OPTIONS.REFERECE_TO_RETWEET_CLOSE_ALL_BUTTON_TITLE )
                        .hide(),
                        
                        jq_close_all_button = jq_close_all_button_wrapper.find( 'button.btn' ).css( {
                            'font-size' : '12px',
                            'padding' : '6px 8px',
                            'cursor' : 'pointer'
                        } )
                        .text( OPTIONS.REFERECE_TO_RETWEET_CLOSE_ALL_BUTTON_TEXT )
                        .on( 'click', function ( event ) {
                            self.jq_user_list.find( 'div.IconContainer.close-item button.btn' ).each( function () {
                                var jq_close_button = $( this );
                                
                                if ( jq_close_button.is( ':hidden' ) ) {
                                    return;
                                }
                                jq_close_button.click();
                            } );
                            
                            event.stopPropagation();
                            event.preventDefault();
                            
                            return false;
                        } ),
                        
                        jq_open_all_button_wrapper = $( self.reference_to_retweet_button_template ).css( {
                            'position' : 'absolute',
                            'bottom' : '8px',
                            'right' : '84px'
                        } )
                        .addClass( 'open-all' )
                        .attr( 'data-original-title', OPTIONS.REFERECE_TO_RETWEET_OPEN_ALL_BUTTON_TITLE )
                        .hide(),
                        
                        jq_open_all_button = jq_open_all_button_wrapper.find( 'button.btn' ).css( {
                            'font-size' : '12px',
                            'padding' : '6px 8px',
                            'cursor' : 'pointer'
                        } )
                        .text( OPTIONS.REFERECE_TO_RETWEET_OPEN_ALL_BUTTON_TEXT )
                        .on( 'click', function ( event ) {
                            self.jq_user_list.find( 'div.IconContainer.open-item button.btn' ).each( function () {
                                var jq_open_button = $( this );
                                
                                if ( jq_open_button.is( ':hidden' ) ) {
                                    return;
                                }
                                jq_open_button.click();
                            } );
                            
                            event.stopPropagation();
                            event.preventDefault();
                            
                            return false;
                        } ),
                        
                        jq_help_button_wrapper = $( self.reference_to_retweet_button_template ).css( {
                            'position' : 'absolute',
                            'bottom' : '8px',
                            'left' : '16px'
                        } )
                        .addClass( 'help' )
                        .attr( 'data-original-title', ( LANGUAGE == 'ja' ) ? 'ヘルプ' : 'Help' ),
                        
                        jq_help_button = jq_help_button_wrapper.find( 'button.btn' ).css( {
                            'font-size' : '14px',
                            'padding' : '6px 8px',
                            'cursor' : 'pointer'
                        } )
                        .text( '?' )
                        .addClass( 'close' )
                        .on( 'click', function ( event ) {
                            if ( jq_shortcut_container.is( ':hidden' ) ) {
                                jq_shortcut_container.show();
                                jq_help_button.removeClass( 'close' ).addClass( 'open' );
                            }
                            else {
                                jq_shortcut_container.hide();
                                jq_help_button.removeClass( 'open' ).addClass( 'close' );
                            }
                            event.stopPropagation();
                            event.preventDefault();
                            
                            return false;
                        } );
                    
                    self.jq_header_container
                    .append( jq_load_all_button_wrapper )
                    .append( jq_close_all_button_wrapper )
                    .append( jq_open_all_button_wrapper )
                    .append( jq_help_button_wrapper );
                } // end of check_all_images_loaded()
                
                
                retweet_user_info_list.forEach( function( retweet_user_info ) {
                    if ( user_id_map[ retweet_user_info.user.id_str ] ) {
                        return;
                    }
                    
                    user_id_map[ retweet_user_info.user.id_str ] = true;
                    
                    if ( max_user_number <= load_image_counter ) {
                        return;
                    }
                    
                    retweet_user_info_to_show_list.push( retweet_user_info );
                    
                    load_image_counter ++;
                    
                    var jq_image = $( new Image() );
                    
                    jq_image
                    .on( 'load', function( event ) {
                        check_all_images_loaded();
                    } )
                    .on( 'error', function( event ) {
                        check_all_images_loaded();
                    } );
                    
                    jq_image.attr( 'src', retweet_user_info.user.profile_image_url_https );
                } );
            } );
            
            jq_dialog.css( {
                'background' : ( is_night_mode() ? '#182430' : '#f5f8fa' )
            } );
            
            jq_dialog_container.show();
            
            return self;
        }, // end of open()
        
        
        close : function () {
            var self = this,
                jq_dialog_container = self.jq_dialog_container,
                jq_user_list = self.jq_user_list;
            
            $( jq_user_list ).off( self.mouse_wheel_event_name );
            
            $( d ).off( self.mouse_wheel_event_name );
            
            $( d.body )
            .css( {
                'overflow' : self.saved_body_overflow,
                'overflow-x' : self.saved_body_overflow_x,
                'overflow-y' : self.saved_body_overflow_y
            } )
            .off( self.mouse_wheel_event_name )
            .off( 'keydown.rert' )
            .off( 'keypress.rert' );
            
            jq_dialog_container.hide();
            
            return self;
        }, // end of close()
        
        
        is_opened : function () {
            var self = this;
            
            return self.jq_dialog_container.is( ':visible' );
        }, // end of is_opened()
        
        
        __load_recent_retweet_user_info : function ( request_id, retweeted_tweet_id, callback ) {
            var self = this,
                max_user_number = self.__get_max_user_number(),
                limit_user_number = max_user_number + 10, // 数が少なく取れたり重複したりするケースもあるので、大目に指定
                statuses_retweets_url = API_STATUSES_RETWEETS_TEMPLATE.replace( /#TWEETID#/g, retweeted_tweet_id ).replace( /#NUMBER#/g, '' + limit_user_number );
            
            if ( 0 < OPTIONS.STATUSES_RETWEETS_CACHE_SEC ) {
                var retweet_user_info_list = self.retweet_user_info_list_cache[ statuses_retweets_url ];
                
                if ( retweet_user_info_list ) {
                    callback( request_id, 'ok', retweet_user_info_list );
                    return self;
                }
            }
            
            $.ajax( {
                type : 'GET',
                url : statuses_retweets_url,
                dataType : 'json',
                headers : {
                    'Authorization' : 'Bearer ' + OAUTH2_ACCESS_TOKEN
                }
            } )
            .done( function ( retweet_user_info_list ) {
                if ( request_id != self.current_request_id ) {
                    callback( request_id, 'ignore', retweet_user_info_list );
                    return;
                }
                
                if ( 0 < OPTIONS.STATUSES_RETWEETS_CACHE_SEC ) {
                    self.retweet_user_info_list_cache[ statuses_retweets_url ] = retweet_user_info_list;
                    setTimeout( function () {
                        delete self.retweet_user_info_list_cache[ statuses_retweets_url ];
                    }, OPTIONS.STATUSES_RETWEETS_CACHE_SEC * 1000 );
                }
                
                callback( request_id, 'ok', retweet_user_info_list );
            } )
            .fail( function ( jqXHR, textStatus, errorThrown ) {
                log_error( statuses_retweets_url, textStatus );
                callback( request_id, 'load error: ' + textStatus, null );
            } )
            .always( function () {
            } );
            
            return self;
        }, // end of __load_recent_retweet_user_info()
        
        
        __get_max_user_number : function () {
            if ( ( ! OPTIONS.MAX_USER_NUMBER ) || isNaN( OPTIONS.MAX_USER_NUMBER ) ) {
                return DEFAULT_STATUSES_RETWEETS_USER_NUMBER;
            }
            var max_user_number = parseInt( OPTIONS.MAX_USER_NUMBER, 10 );
            
            if ( ( max_user_number < 1 ) || ( LIMIT_STATUSES_RETWEETS_USER_NUMBER < max_user_number ) ) {
                return DEFAULT_STATUSES_RETWEETS_USER_NUMBER;
            }
            
            return max_user_number;
        }, // end of __get_max_user_number()
        
        
        __get_max_after_retweet_minutes : function () {
            if ( ( ! OPTIONS.MAX_AFTER_RETWEET_MINUTES ) || isNaN( OPTIONS.MAX_AFTER_RETWEET_MINUTES ) ) {
                return DEFAULT_MAX_AFTER_RETWEET_MINUTES;
            }
            var max_after_retweet_minutes = parseInt( OPTIONS.MAX_AFTER_RETWEET_MINUTES, 10 );
            
            if ( ( max_after_retweet_minutes < 1 ) || ( LIMIT_MAX_AFTER_RETWEET_MINUTES < max_after_retweet_minutes ) ) {
                return DEFAULT_MAX_AFTER_RETWEET_MINUTES;
            }
            
            return max_after_retweet_minutes;
        }, // end of __get_max_after_retweet_minutes()
        
        
        __get_max_before_retweet_minutes : function () {
            if ( ( ( ! OPTIONS.MAX_BEFORE_RETWEET_MINUTES ) && ( OPTIONS.MAX_BEFORE_RETWEET_MINUTES !== 0 ) ) || isNaN( OPTIONS.MAX_BEFORE_RETWEET_MINUTES ) ) {
                return DEFAULT_MAX_BEFORE_RETWEET_MINUTES;
            }
            var max_before_retweet_minutes = parseInt( OPTIONS.MAX_BEFORE_RETWEET_MINUTES, 10 );
            
            if ( ( max_before_retweet_minutes < 0 ) || ( LIMIT_MAX_BEFORE_RETWEET_MINUTES < max_before_retweet_minutes ) ) {
                return DEFAULT_MAX_BEFORE_RETWEET_MINUTES;
            }
            
            return max_before_retweet_minutes;
        }, // end of __get_max_before_retweet_minutes()
        
        
        __insert_user : function ( retweeted_tweet_id, retweet_user_info ) {
            var self = this,
                jq_user_list = self.jq_user_list,
                jq_user = $(
                    self.user_template
                    .replace( /#RETWEETED_TWEET_ID#/g, retweeted_tweet_id ) // retweet_user_info.retweeted_status.id_str でも良い
                    .replace( /#RETWEET_ID#/g, retweet_user_info.id_str )
                    .replace( /#USER_ID#/g, retweet_user_info.user.id_str )
                    .replace( /#SCREEN_NAME#/g, retweet_user_info.user.screen_name )
                ),
                
                jq_user_content = jq_user.find( '.activity-user-profile-content .content' ).css( {
                    'margin-right' : '60px'
                } ),
                
                jq_avatar = jq_user.find( 'img.avatar' ).css( {
                } )
                .attr( 'src', retweet_user_info.user.profile_image_url_https ),
                
                jq_user_fullname = jq_user.find( 'strong.fullname' ).css( {
                    'min-width' : '50px'
                } )
                .text( retweet_user_info.user.name ),
                
                jq_screen_name = jq_user.find( 'span.username b' ).css( {
                    'word-break' : 'break-all'
                } )
                .text( retweet_user_info.user.screen_name ),
                
                jq_bio = jq_user.find( 'p.bio' ).css( {
                    'font-size' : '12px',
                    'opacity' : '0.8'
                } )
                .text( retweet_user_info.user.description ),
                
                jq_referece_to_retweet_load_button_wrapper = jq_user.find( 'div.IconContainer.load-item' ).css( {
                    'position' : 'absolute',
                    'bottom' : '8px',
                    'right' : '6px'
                } )
                .attr( 'data-original-title', OPTIONS.REFERECE_TO_RETWEET_LOAD_BUTTON_TITLE ),
                
                jq_referece_to_retweet_load_button = jq_referece_to_retweet_load_button_wrapper.find( 'button.btn' ).css( {
                    'font-size' : '14px',
                    'padding' : '6px 8px',
                    'cursor' : 'pointer'
                } )
                .text( OPTIONS.REFERECE_TO_RETWEET_LOAD_BUTTON_TEXT ),
                
                jq_referece_to_retweet_close_button_wrapper = jq_user.find( 'div.IconContainer.close-item' ).css( {
                    'position' : 'absolute',
                    'bottom' : '8px',
                    'right' : '6px'
                } )
                .attr( 'data-original-title', OPTIONS.REFERECE_TO_RETWEET_CLOSE_BUTTON_TITLE )
                .hide(),
                
                jq_referece_to_retweet_close_button = jq_referece_to_retweet_close_button_wrapper.find( 'button.btn' ).css( {
                    'font-size' : '16px',
                    'padding' : '2px 8px',
                    'cursor' : 'pointer'
                } )
                .text( OPTIONS.REFERECE_TO_RETWEET_CLOSE_BUTTON_TEXT ),
                
                jq_referece_to_retweet_open_button_wrapper = jq_user.find( 'div.IconContainer.open-item' ).css( {
                    'position' : 'absolute',
                    'bottom' : '8px',
                    'right' : '6px'
                } )
                .attr( 'data-original-title', OPTIONS.REFERECE_TO_RETWEET_OPEN_BUTTON_TITLE )
                .hide(),
                
                jq_referece_to_retweet_open_button = jq_referece_to_retweet_open_button_wrapper.find( 'button.btn' ).css( {
                    'font-size' : '16px',
                    'padding' : '2px 8px',
                    'cursor' : 'pointer'
                } )
                .text( OPTIONS.REFERECE_TO_RETWEET_OPEN_BUTTON_TEXT ),
                
                jq_referece_to_retweet_loading = jq_user.find( '.loading' ).css( {
                    'position' : 'absolute',
                    'z-index' : '3001',
                    'right' : '6px',
                    'bottom' : '2px'
                } )
                .hide();
            
            jq_user.find( SELECTOR_INFO.action_to_tweet_selector ).attr( 'data-name', retweet_user_info.user.name );
            
            jq_user_content.find( 'a.account-group' ).css( {
                'min-width' : '0',
                'max-width' : '470px'
            } );
            
            
            jq_referece_to_retweet_load_button.on( 'click', function ( event ) {
                event.stopPropagation();
                event.preventDefault();
                
                self.__load_referece_to_retweet(
                    retweet_user_info,
                    jq_user,
                    jq_referece_to_retweet_load_button,
                    jq_referece_to_retweet_loading,
                    jq_referece_to_retweet_close_button,
                    jq_referece_to_retweet_open_button
                );
                
                return false;
            } );
            
            self.__reset_tweet_click_event( jq_user );
            
            self.jq_user_list.append( jq_user );
            
        }, // end of __insert_user()
        
        
        __load_referece_to_retweet : function ( retweet_user_info, jq_user,  jq_referece_to_retweet_load_button, jq_referece_to_retweet_loading, jq_referece_to_retweet_close_button, jq_referece_to_retweet_open_button ) {
            var self = this,
                retweet_id = retweet_user_info.id_str,
                user = retweet_user_info.user, 
                screen_name = user.screen_name,
                retweet_date = new Date( retweet_user_info.created_at ),
                max_date = new Date( retweet_date.getTime() + ( 1000 * 60 * self.__get_max_after_retweet_minutes() ) ),
                min_date = new Date( retweet_date.getTime() - ( 1000 * 60 * self.__get_max_before_retweet_minutes() ) ),
                until_tweet_id = tweet_id_shift( retweet_id, ( 60 * self.__get_max_after_retweet_minutes() + 1 ) ),
                since_tweet_id = tweet_id_shift( retweet_id, -( 60 * self.__get_max_before_retweet_minutes() + 1 ) );
            
            jq_referece_to_retweet_load_button.parent().remove();
            jq_referece_to_retweet_loading.show();
            
            if ( ! since_tweet_id ) {
                since_tweet_id = ID_THRESHOLD;
            }
            
            log_debug( '[search conditaions]', screen_name, 'tweet id:', since_tweet_id, '～(', retweet_id, ')～', until_tweet_id, 'date:', min_date.toLocaleString(), '～(', retweet_date.toLocaleString(), ')～', max_date.toLocaleString() );
            
            var jq_stream_item_list = [],
                target_retweet_insert_index = -1,
                ignored_retweet_count = 0,
                user_timeline = object_extender( TemplateUserTimeline )
                .init( screen_name, {
                    max_date : max_date
                } );
            
            
            function get_jq_target_retweet_stream_item( error_message ) {
                var retweeted_status = retweet_user_info.retweeted_status,
                    retweet_timestamp = format_date( new Date( retweet_user_info.created_at ), 'YYYY/MM/DD hh:mm:ss' ),
                    tweet_timestamp = format_date( new Date( retweeted_status.created_at ), 'YYYY/MM/DD hh:mm:ss' ),
                    tweet_timestamp_short = format_date( new Date( retweeted_status.created_at ), 'YYYY/MM/DD' ),
                    tweet_timestamp_ms = new Date( retweeted_status.created_at ).getTime(),
                    
                    jq_stream_item = $(
                        self.retweet_timeinfo_template
                        .replace( /#USER_ID#/g, retweeted_status.user.id_str )
                        .replace( /#SCREEN_NAME#/g, retweeted_status.user.screen_name )
                        .replace( /#TWEET_ID#/g, retweeted_status.id_str )
                    ),
                    
                    jq_tweet_timestamp = $(
                        self.timestamp_template
                        .replace( /#SCREEN_NAME#/g, retweeted_status.user.screen_name )
                        .replace( /#TWEET_ID#/g, retweeted_status.id_str )
                        .replace( /#TIMESTAMP#/g, tweet_timestamp )
                        .replace( /#TIMESTAMP_SHORT#/g, tweet_timestamp_short )
                        .replace( /#DATA_TIME#/g, Math.floor( tweet_timestamp_ms / 1000 ) )
                        .replace( /#DATA_TIME_MS#/g, tweet_timestamp_ms )
                    ),
                    
                    jq_avatar = jq_stream_item.find( 'img.avatar' ).css( {
                    } )
                    .attr( 'src', retweeted_status.user.profile_image_url_https ),
                    
                    jq_user_fullname = jq_stream_item.find( 'strong.fullname' ).css( {
                        'min-width' : '50px'
                    } )
                    .text( retweeted_status.user.name ),
                    
                    jq_screen_name = jq_stream_item.find( 'span.username b' ).css( {
                        'word-break' : 'break-all'
                    } )
                    .text( retweeted_status.user.screen_name ),
                    
                    jq_account_group = jq_stream_item.find( 'a.account-group' ).css( {
                        'min-width' : '0',
                        'max-width' : '470px'
                    } )
                    .after( jq_tweet_timestamp ),
                    
                    jq_error_message = $( '<span/>' ).css( {
                        'color' : 'red',
                        'font-weight' : 'bold',
                        'margin-left' : '16px',
                        'display' : ( error_message ) ? 'inline' : 'none'
                    } )
                    .text( ( error_message ) ? error_message : '' ),
                    
                    jq_retweet_timestamp = jq_stream_item.find( 'div.context span._timestamp' ).css( {
                        'font-size' : '14px',
                        'margin-left' : '10px'
                    } )
                    .html( retweet_timestamp + '<span class="left-arrow">&#8592;</span><span class="Icon Icon--small Icon--tweet"></span>' + tweet_timestamp )
                    .after( jq_error_message ),
                    
                    jq_left_arrow = jq_retweet_timestamp.find( 'span.left-arrow' ).css( {
                        'margin' : 'auto 16px'
                    } ),
                    
                    jq_icon_tweet = jq_retweet_timestamp.find( 'span.Icon--tweet' ).css( {
                        'margin-right' : '16px'
                    } );
                
                jq_stream_item.css( {
                    'opacity' : '0.8',
                    'background' : ( is_night_mode() ) ? '#221100' : '#e4ecf8'
                } )
                .find( 'div.js-stream-tweet' ).css( {
                    'min-height' : 'auto'
                } );
                
                jq_stream_item.find( 'p.js-tweet-text' ).css( {
                    'font-size' : '12px'
                } )
                .text( retweet_user_info.retweeted_status.text );
                
                set_toggle_retweet_content_visible( jq_stream_item );
                
                return jq_stream_item;
            } // end of get_jq_target_retweet_stream_item()
            
            
            function complete( error_message ) {
                jq_referece_to_retweet_loading.hide();
                
                if ( target_retweet_insert_index < 0 ) {
                    target_retweet_insert_index = jq_stream_item_list.length;
                }
                
                jq_stream_item_list.splice( target_retweet_insert_index, 0, get_jq_target_retweet_stream_item( error_message ) );
                
                jq_stream_item_list.reverse().forEach( function ( jq_stream_item ) {
                    jq_user.after( jq_stream_item );
                } );
                
                jq_referece_to_retweet_close_button.on( 'click', function ( event ) {
                    jq_stream_item_list.forEach( function ( jq_stream_item ) {
                        jq_stream_item.hide();
                    } );
                    
                    jq_referece_to_retweet_close_button.parent().hide();
                    jq_referece_to_retweet_open_button.parent().show();
                    
                    event.stopPropagation();
                    event.preventDefault();
                    
                    return false;
                } );
                
                jq_referece_to_retweet_open_button.on( 'click', function ( event ) {
                    jq_stream_item_list.forEach( function ( jq_stream_item ) {
                        jq_stream_item.show();
                    } );
                    
                    jq_referece_to_retweet_open_button.parent().hide();
                    jq_referece_to_retweet_close_button.parent().show();
                    
                    event.stopPropagation();
                    event.preventDefault();
                    
                    return false;
                } );
                
                jq_referece_to_retweet_close_button.parent().show();
            } // end of complete()
            
            
            function set_toggle_retweet_content_visible( jq_stream_item ) {
                var jq_content = jq_stream_item.find( 'div.content:has(div.js-tweet-text-container)' ).css( {
                        'min-height' : '50px'
                    } )
                    .hide();
                
                self.__reset_tweet_click_event( jq_stream_item );
                
                jq_stream_item
                .addClass( 'hidden-item' )
                .on( 'click', function ( event ) {
                    if ( jq_content.is( ':hidden' ) ) {
                        jq_content.show();
                        jq_stream_item.removeClass( 'hidden-item' );
                    }
                    else {
                        jq_content.hide();
                        jq_stream_item.addClass( 'hidden-item' );
                    }
                    
                    event.stopPropagation();
                    event.preventDefault();
                    
                    return false;
                } );
                
                jq_stream_item.find( 'a[href]' ).each( function () {
                    self.__change_link_to_open_another_tab( this );
                } );
            } // end of set_toggle_retweet_content_visible()
            
            
            function search() {
                
                function add_quote_link( jq_stream_item, quote_url ) {
                    if ( quote_url.charAt( 0 ) == '/' ) {
                        quote_url = 'https://twitter.com' + quote_url;
                    }
                    
                    var jq_quote_link_wrapper = $( '<blockquote><a/></blockquote>' ).css( {
                        } ),
                        jq_quote_link = jq_quote_link_wrapper.find( 'a' ).css( {
                        } )
                        .attr( 'href', quote_url )
                        .text( quote_url );
                    
                    jq_stream_item.find( 'div.js-tweet-text-container' ).append( jq_quote_link_wrapper );
                } // end of add_quote_link()
                
                
                function add_data_card_link( jq_stream_item, jq_data_card, tweet_info ) {
                    var data_card_name = jq_data_card.attr( 'data-card-name' ), // 'summary', 'summary_large_image', 'promo_image_convo' 等
                        target_url = ( /(?:^promo_)/.test( data_card_name ) ) ? tweet_info.tweet_url : jq_data_card.attr( 'data-card-url' ),
                        // TODO: 'data-card-name' が 'promo_image_convo' の場合等、'data-card-url' へ飛ぶと空ページになってしまうことがある
                        iframe_url = jq_data_card.attr( 'data-src' );
                    
                    if ( iframe_url.charAt( 0 ) == '/' ) {
                        iframe_url = 'https://twitter.com' + iframe_url;
                    }
                    
                    $.get( iframe_url )
                    .done( function ( html ) {
                        var jq_html_fragment = get_jq_html_fragment( html ),
                            found_thumb_url = jq_html_fragment.find( 'img[data-src]' ).attr( 'data-src' ),
                            thumb_url = ( found_thumb_url ) ? found_thumb_url : 'https://ton.twimg.com/tfw/assets/news_stroke_v1_78ce5b21fb24a7c7e528d22fc25bd9f9df7f24e2.svg',
                            title = jq_html_fragment.find( 'h2.TwitterCard-title' ).text(),
                            
                            jq_quote_link_wrapper = $( '<blockquote></blockquote>' ).css( {
                            } )
                            .addClass( 'clearfix' ),
                            
                            jq_data_card_link = $( '<a><img /><span /></a>' ).css( {
                            } )
                            .attr( 'href', target_url )
                            .attr( 'title', title ),
                            
                            jq_data_card = jq_data_card_link.find( 'img' ).css( {
                                'float' : 'left',
                                'width' : '75px',
                                'height' : '75px',
                                'object-fit' : 'cover',
                                'margin-right' : '12px',
                                'border-radius' : '6px'
                            } )
                            .attr( 'src', thumb_url ),
                            
                            jq_data_card_text = jq_data_card_link.find( 'span' ).css( {
                                'font-size' : '12px'
                            } )
                            .text( title );
                        
                        self.__change_link_to_open_another_tab( jq_data_card_link  );
                        jq_quote_link_wrapper.append( jq_data_card_link );
                        jq_stream_item.find( 'div.js-tweet-text-container' ).append( jq_quote_link_wrapper );
                    } );
                } // end of add_data_card_link()
                
                
                function add_image_links( jq_stream_item, image_url_list ) {
                    var jq_quote_link_wrapper = $( '<blockquote></blockquote>' ).css( {
                        } );
                    
                    $( image_url_list ).each( function () {
                        var image_url = this,
                            base_url = image_url.replace( /:\w*$/, '' ),
                            thumb_url = base_url + ':thumb',
                            orig_url = base_url + ':orig',
                            jq_image_link = $( '<a><img /></a>' ).css( {
                            } )
                            .attr( 'href', orig_url ),
                            jq_image = jq_image_link.find( 'img' ).css( {
                                'width' : '75px',
                                'height' : 'auto',
                                'margin-right' : '12px',
                                'border-radius' : '6px'
                            } )
                            .attr( 'src', thumb_url );
                        jq_quote_link_wrapper.append( jq_image_link );
                    } );
                    
                    jq_stream_item.find( 'div.js-tweet-text-container' ).append( jq_quote_link_wrapper );
                } // end of add_image_links()
                
                
                function add_media_link( jq_stream_item, media_alt_url, tweet_info ) {
                    var jq_quote_link_wrapper = $( '<blockquote><a/></blockquote>' ).css( {
                        } ),
                        base_url = media_alt_url.replace( /:\w*$/, '' ),
                        thumb_url = base_url + ':thumb',
                        
                        jq_media_link = $( '<a><img /></a>' ).css( {
                        } )
                        .attr( 'href', tweet_info.tweet_url ),
                        jq_image = jq_media_link.find( 'img' ).css( {
                            'width' : '75px',
                            'height' : 'auto',
                            'margin-right' : '6px',
                            'border-radius' : '6px'
                        } )
                        .attr( 'src', thumb_url );
                    
                    jq_quote_link_wrapper.append( jq_media_link );
                    
                    jq_stream_item.find( 'div.js-tweet-text-container' ).append( jq_quote_link_wrapper );
                } // end of add_media_link()
                
                
                user_timeline.fetch_tweet_info( function ( result ) {
                    var error_message = null;
                    
                    if ( ( ! result ) || ( ! result.tweet_info ) ) {
                        if ( ( ! result ) || ( result.timeline_status == 'error' ) ) {
                            error_message = 'load error';
                        }
                        complete( error_message );
                        return;
                    }
                    
                    var tweet_info = result.tweet_info;
                    
                    if ( target_retweet_insert_index < 0 ) {
                        if ( bignum_cmp( ( tweet_info.retweet_id || tweet_info.tweet_id ), retweet_id ) <= 0 ) {
                            // 対象リツイートの挿入位置決定
                            target_retweet_insert_index = jq_stream_item_list.length;
                        }
                    }
                    
                    if ( tweet_info.retweeter ) {
                        // リツイートは無視する
                        
                        ignored_retweet_count ++;
                        
                        if ( ( 50 < ignored_retweet_count ) || ( bignum_cmp( tweet_info.retweet_id, since_tweet_id ) <= 0 ) ) {
                            // TODO: リツイート日時が存在しないため、Tweet ID で比較するしか無い→ since_tweet_id が ID_THRESHOLD の場合、リツイートしかしないアカウントの場合延々と検索してしまう
                            // →無視されたリツイート数が一定数を超えたら完了とする
                            complete( error_message );
                            return;
                        }
                        
                        search();
                        return;
                    }
                    
                    ignored_retweet_count = 0;
                    
                    if ( tweet_info.date.getTime() < min_date.getTime() ) {
                        complete( error_message );
                        return;
                    }
                    
                    var jq_stream_item = tweet_info.jq_stream_item,
                        quote_url = jq_stream_item.find( 'div.QuoteTweet a.QuoteTweet-link' ).attr( 'href' ),
                        jq_data_card = jq_stream_item.find( 'div.js-media-container div[data-card-url]' ),
                        jq_img_url_list = jq_stream_item.find( 'div.AdaptiveMediaOuterContainer div.AdaptiveMedia-photoContainer img' ).map( function ( index, img ) {
                            return img.src;
                        } ),
                        jq_media_player = jq_stream_item.find( 'div.AdaptiveMediaOuterContainer div.PlayableMedia-player[style]' ),
                        media_alt_url;
                    
                    if ( quote_url ) {
                        add_quote_link( jq_stream_item, quote_url );
                    }
                    
                    if ( 0 < jq_data_card.length ) {
                        add_data_card_link( jq_stream_item, jq_data_card, tweet_info );
                    }
                    
                    if ( 0 < jq_img_url_list.length ) {
                        add_image_links( jq_stream_item, jq_img_url_list );
                    }
                    
                    if ( 0 < jq_media_player.length ) {
                        try {
                            media_alt_url = jq_media_player.attr( 'style' ).match( /url\('?([^']+?)'?\)/ )[ 1 ];
                            if ( media_alt_url ) {
                                add_media_link( jq_stream_item, media_alt_url, tweet_info );
                            }
                        }
                        catch ( error ) {
                        }
                    }
                    
                    // TODO: リプライを検索対象として含めるか？
                    // →とりあえず、含めておく
                    jq_stream_item.find( 'div.ReplyingToContextBelowAuthor a.js-user-profile-link' ).css( {
                        'display' : ''
                    } )
                    .addClass( 'remained-item' );
                    
                    jq_stream_item.find( [
                        'a.js-user-profile-link:not(.remained-item)',
                        'div.ProfileTweet-action',
                        'div.js-media-container',
                        'div.stream-item-footer',
                        'div.QuoteTweet',
                        'div.Tombstone',
                        'div.AdaptiveMediaOuterContainer',
                        'button.js-translate-tweet',
                        'div.tweet-translation-container',
                        'div.context:has(div.tweet-context.with-icn)'
                    ].join( ',' ) )
                    .remove();
                    
                    var jq_timestamp = jq_stream_item.find( 'span._timestamp' ),
                        timestamp_ms = jq_timestamp.attr( 'data-time-ms' ),
                        date = new Date( parseInt( timestamp_ms, 10 ) ),
                        timestamp = format_date( date, 'YYYY/MM/DD hh:mm:ss');
                    
                    if ( tweet_info.retweeter ) {
                        // 先にリツイートは無視しているため、ここは通らないはず
                    }
                    else {
                        jq_timestamp.text( timestamp );
                        jq_stream_item.css( {
                            'background' : ( is_night_mode() ) ? '#282828' : '#f8fcff'
                        } );
                        jq_stream_item.find( 'p.js-tweet-text' ).css( {
                            'font-size' : '14px'
                        } );
                        
                        self.__reset_tweet_click_event( jq_stream_item );
                    }
                    
                    jq_stream_item_list.push( jq_stream_item );
                    
                    search();
                } );
            } // end of search()
            
            search();
            
        }, // end of __load_referece_to_retweet()
        
        
        __get_stream_item_cursor : function () {
            var self = this,
                stream_item_cursor;
            
            stream_item_cursor = object_extender( {
                initialized : false,
                
                jq_focused_item : $( [] ),
                
                init : function ( jq_user_list ) {
                    var self = this;
                    
                    self.jq_user_list = jq_user_list;
                    
                    self.focus( jq_user_list.find( 'li.js-stream-item[data-item-type="user"]:first' ) );
                    
                    self.initialized = true;
                    
                    return self;
                }, // end of init()
                
                
                focus : function ( jq_stream_item ) {
                    var self = this,
                        jq_old_focused_item = self.jq_focused_item;
                    
                    if ( jq_stream_item.length <= 0 ) {
                        return self;
                    }
                    
                    if ( 0 < jq_old_focused_item.length ) {
                        jq_old_focused_item.css( {
                            'border' : ''
                        } )
                        .removeClass( SCRIPT_NAME + '-focused' );
                    }
                    
                    self.jq_focused_item = jq_stream_item.css( {
                        'border' : 'solid 1px red'
                    } )
                    .addClass( SCRIPT_NAME + '-focused' );
                    
                    return self;
                }, // end of focus()
                
                
                down : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item,
                        jq_next_item = jq_focused_item.nextAll( 'li.js-stream-item:visible' ).first();
                    
                    self.focus( jq_next_item );
                    self.__scroll_to( jq_next_item );
                    
                    return self;
                }, // end of down()
                
                
                up : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item,
                        jq_next_item = jq_focused_item.prevAll( 'li.js-stream-item:visible' ).first();
                    
                    self.focus( jq_next_item );
                    self.__scroll_to( jq_next_item );
                    
                    return self;
                }, // end of up()
                
                
                open : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item;
                    
                    if ( jq_focused_item.hasClass( 'stream-item-retweeted' ) ) {
                        if ( jq_focused_item.hasClass( 'hidden-item' ) ) {
                            jq_focused_item.click();
                        }
                        return self;
                    }
                    
                    if ( jq_focused_item.attr( 'data-item-type' ) != 'user' ) {
                        return self;
                    }
                    
                    jq_focused_item.find( 'div.IconContainer.open-item:visible button, div.IconContainer.load-item:visible button' ).click();
                    
                    return self;
                }, // end of open()
                
                
                close : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item,
                        jq_target_item = ( jq_focused_item.attr( 'data-item-type' ) == 'user' ) ? jq_focused_item : jq_focused_item.prevAll( 'li.js-stream-item[data-item-type="user"]' ).first(),
                        jq_button_close = jq_target_item.find( 'div.IconContainer.close-item:visible button' );
                    
                    if ( jq_button_close.length <= 0 ) {
                        return self;
                    }
                    
                    jq_button_close.click();
                    
                    self.focus( jq_target_item );
                    self.__scroll_to( jq_target_item );
                    
                    return self;
                }, // end of close()
                
                
                toggle : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item,
                        jq_target_item = ( jq_focused_item.attr( 'data-item-type' ) == 'user' ) ? jq_focused_item : jq_focused_item.prevAll( 'li.js-stream-item[data-item-type="user"]' ).first();
                    
                    if ( 0 < jq_target_item.find( 'div.IconContainer.close-item:visible button' ).length ) {
                        self.close();
                    }
                    else {
                        self.open();
                    }
                    
                    return self;
                }, // end of toggle()
                
                
                toggle_retweet : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item;
                    
                    if ( ! jq_focused_item.hasClass( 'stream-item-retweeted' ) ) {
                        return;
                    }
                    
                    jq_focused_item.click();
                    
                    return self;
                }, // end of toggle_retweet()
                
                
                open_vicinity_link : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item;
                    
                    self.jq_focused_item.find( 'small.' + LINK_CONTAINER_CLASS + ' a, small.' + ACT_CONTAINER_CLASS + ' a' ).first().click();
                    
                    return self;
                }, // end of open_vicinity_link()
                
                
                open_tweet : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item;
                    
                    self.jq_focused_item.find( 'a.js-permalink' ).first().click();
                    
                    return self;
                }, // end of open_tweet()
                
                
                open_user_profile : function () {
                    var self = this;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    var jq_focused_item = self.jq_focused_item,
                        jq_user_profile_link = jq_focused_item.find( 'a.js-user-profile-link' );
                    
                    if ( 0 < jq_user_profile_link.length ) {
                        jq_user_profile_link.click();
                        return self;
                    }
                    
                    jq_focused_item.prevAll( 'li.js-stream-item[data-item-type="user"]' ).first().find( 'a.js-user-profile-link' ).click();
                    
                    return self;
                }, // end of open_tweet()
                
                
                __scroll_to : function ( jq_stream_item ) {
                    var self = this,
                        jq_user_list = self.jq_user_list;
                    
                    if ( ! self.initialized ) {
                        return self;
                    }
                    
                    if ( jq_stream_item.length <= 0 ) {
                        return self;
                    }
                    
                    //jq_user_list.animate( {
                    //    scrollTop : jq_stream_item.position().top - jq_user_list.children().first().position().top - 12
                    //}, 'fast' );
                    jq_user_list.scrollTop( jq_stream_item.position().top - jq_user_list.children().first().position().top - 12 );
                    
                    return self;
                } // end of __scroll_to()
            } );
            
            return stream_item_cursor;
        }, // end of __get_stream_item_cursor()
        
        
        __reset_tweet_click_event : function ( jq_stream_item ) {
            var self = this;
            
            jq_stream_item.on( 'click', function ( event ) {
                self.stream_item_cursor.focus( jq_stream_item );
                
                event.stopPropagation();
                event.preventDefault();
                
                return false;
            } );
            
            // TODO: リンクをどうするか？（そのままではクリックするとダイアログの裏で遷移したりする）
            // →とりあえず、別タブで開く
            jq_stream_item.find( 'a[href]' ).each( function () {
                self.__change_link_to_open_another_tab( this );
            } );
        }, // end of __reset_tweet_click_event()
        
        
        __change_link_to_open_another_tab : function ( link ) {
            var self = this,
                jq_link = $( link );
            
            jq_link.on( 'click', function ( event ) {
                var url = jq_link.attr( 'href' );
                
                if ( /^(?:\/|https?:\/\/)/.test( url ) ) {
                    open_child_window( url );
                }
                
                event.stopPropagation();
                event.preventDefault();
                
                return false;
            } );
            
            return jq_link;
        } // end of __change_link_to_open_another_tab()
        
    } ).init();


function set_url_list_to_jq_link( jq_link, search_url_list ) {
    if ( search_url_list.length < 1 ) {
        jq_link.attr( 'href', '#' );
        jq_link.attr( 'data-search-url-shift', '' );
        return;
    }
    
    jq_link.attr( 'href', search_url_list[ 0 ] );
    
    if ( search_url_list.length < 2 ) {
        jq_link.attr( 'data-search-url-shift', '' );
        return;
    }
    
    jq_link.attr( 'data-search-url-shift', search_url_list[ 1 ] );
} // end of set_url_list_to_jq_link()


var get_jq_link_container = ( function () {
    var jq_link_container_template = $( '<small><a></a></small>' ),
        style = $( '<style/>' );
    
    style.text(
        'a.' + SCRIPT_NAME + '_image {' + [
            'display : inline-block!important',
            'width : 12px!important',
            'height : 12px!important',
            'margin : 0 3px 0 2px!important',
            'padding : 0 0 0 0!important',
            'text-decoration : none!important',
            'background-image : url(' + LINK_ICON_URL + ' )',
            'background-repeat : no-repeat',
            'background-position : 0 0',
            'background-size : 24px 12px'
        ].join( ';\n' ) + '}\n' +
        
        'a.' + SCRIPT_NAME + '_image:hover {' + [
            'background-position : -12px 0'
        ].join( ';\n' ) + '}\n'
    );
    
    $( 'head' ).append( style );
    
    return function ( search_url_list, options ) {
        options = ( options ) ? options : {};
        
        var class_name = options.class_name,
            title = options.title,
            text = options.text,
            css = options.css,
            jq_link_container = jq_link_container_template.clone( true ),
            jq_link = jq_link_container.find( 'a:first' );
        
        if ( class_name ) {
            jq_link_container.addClass( class_name );
        }
        if ( title ) {
            jq_link.attr( 'title', title );
        }
        set_url_list_to_jq_link( jq_link , search_url_list );
        
        jq_link.css( {
            'font-size' : '12px',
            'white-space' : 'nowrap'
        } );
        
        if ( css ) {
            jq_link.css( css );
        }
        
        // TODO: 404 画面だと CSP エラー(Refused to load the image 'data:image/gif;base64,～' ...)になってしまう→除外することで対処
        if ( ( OPTIONS.USE_LINK_ICON ) &&( ! IS_PAGE_404 ) ) {
            jq_link.addClass( SCRIPT_NAME + '_image' );
            jq_link.text( ' ' );
        }
        else {
            if ( text ) {
                jq_link.text( text );
            }
            jq_link.css( {
                'opacity' : '0.8'
            } );
        }
        
        return { container : jq_link_container, link : jq_link };
    }; // end of get_jq_link_container()
} )(); // end of get_jq_link_container()


function get_search_timeline_url( search_url_list ) {
    var filtered_url_list = search_url_list.filter( function ( search_url ) {
            return ( search_url && ( search_url.indexOf( SEARCH_API, 0 ) === 0 ) );
        } );
    
    if ( filtered_url_list.length <= 0 ) {
        return null;
    }
    return filtered_url_list[ 0 ];
} // end of get_search_timeline_url()


function start_search_tweet() {
    if ( ! is_search_mode() ) {
        return false;
    }
    
    var current_search_url = SEARCH_PARAMETERS.initial_search_url,
        search_timeline_url = get_search_timeline_url( SEARCH_PARAMETERS.search_url_list ),
        
        target_tweet_id = SEARCH_PARAMETERS.search_tweet_id || ( SEARCH_PARAMETERS.tweet_id_range && SEARCH_PARAMETERS.tweet_id_range.current_id ),
        reacted_tweet_id = SEARCH_PARAMETERS.reacted_tweet_id,
        search_time_sec = SEARCH_PARAMETERS.search_time_sec,
        target_color = ( is_night_mode() ) ? OPTIONS.TARGET_TWEET_COLOR_NIGHTMODE : OPTIONS.TARGET_TWEET_COLOR,
        
        last_tweet_id = null,
        jq_timeline = null,
        giveup_tid = null,
        wait_counter = MAX_CHECK_RETRY,
        
        ua = w.navigator.userAgent.toLowerCase(),
        animate_target_selector = ( ( ( ! w.chrome ) && ua.indexOf( 'webkit' ) != -1 ) || ( ua.indexOf( 'opr' ) != -1 ) || ( ua.indexOf( 'edge' ) != -1 ) ) ? 'body,html' : 'html',
        // [Javascript Chromeでページトップに戻る(scrollTop)が効かなくなってた件。 - かもメモ](http://chaika.hatenablog.com/entry/2017/09/22/090000)
        // ※ 2017/10現在 ($.fn.jquery = 3.1.1)
        //   'html' ← Firefox, Chrome, Vivaldi, IE
        //   'body' ← Safari, Opera, Edge
        animate_speed = 'fast'; //  'slow', 'normal', 'fast' またはミリ秒単位の数値
    
    
    jq_timeline = $( [
            'div.GridTimeline-items',
            'ol.stream-items'
        ].join( ',' ) );
        
    if ( jq_timeline.length <= 0 ) {
        log_error( '*** timeline-items not found ***' );
        return;
    }
    
    giveup_tid = setInterval( function () {
        var jq_last_tweet = jq_timeline.find( '.js-stream-item[data-item-id]:last' ),
            tmp_tweet_id = ( 0 < jq_last_tweet.length ) ? jq_last_tweet.attr( 'data-item-id' ) : null;
        
        if ( ( ! is_search_mode() ) || ( tmp_tweet_id == last_tweet_id ) ) {
            // 読み込まれたタイムラインの最後のツイートにいつまでも変化が無ければ諦める
            clearInterval( giveup_tid );
            giveup_tid = null;
            return;
        }
        last_tweet_id = tmp_tweet_id;
    }, 1000 * WAIT_BEFORE_GIVEUP_SCROLL_SEC );
    
    
    function search_tweet() {
        if ( ! is_search_mode() ) {
            return;
        }
        
        var jq_target_tweet = null,
            retweet_found = false;
        
        if ( target_tweet_id ) {
            jq_target_tweet = jq_timeline.find( [
                'div.js-stream-tweet[data-retweet-id="' + target_tweet_id + '"]:first',
                'div.js-stream-tweet[data-item-id="' + target_tweet_id + '"]:first'
            ].join( ',' ) );
        }
        
        if ( ( ( ! jq_target_tweet ) || ( jq_target_tweet.length <= 0 ) ) && ( reacted_tweet_id ) ) {
            jq_target_tweet = jq_timeline.find( [
                'div.js-stream-tweet[data-item-id="' + reacted_tweet_id + '"]:first'
            ].join( ',' ) );
        }
        
        if ( ( jq_target_tweet ) && ( 0 < jq_target_tweet.length ) ) {
            // 目的ツイートが見つかった際の処理
            if ( jq_target_tweet.attr( 'data-retweet-id' ) == target_tweet_id ) {
                retweet_found = true;
                //target_color = OPTIONS.VICINITY_TWEET_COLOR; // 目的ツイートが見つかった場合は"近傍ツイート"ではなく"対象ツイート"扱いのため、コメントアウト
            }
            log_debug( '*** Pattern A *** :', target_tweet_id, jq_target_tweet.attr( 'data-item-id' ) );
        }
        else {
            // 目的ツイートが見つからない→ツイートIDやタイムスタンプをキーに近傍を探す
            
            jq_target_tweet = null;
            
            if ( $( '.empty-text' ).is( ':visible' ) ) {
                // https://～/with_replies で「@～さんはまだツイートしていません。」が表示される場合、https://twitter.com/search の方へ移動
                if ( search_timeline_url && ( search_timeline_url != current_search_url ) ) {
                    w.location.replace( search_timeline_url );
                }
                log_debug( '*** empty-text was found ***' );
                return;
            }
            
            jq_timeline.find(
                'div.js-stream-tweet:not(".' + SCRIPT_NAME + '_touched")[data-item-id]'
            )
            .each( function () {
                var jq_tweet = $( this ),
                    tweet_id = jq_tweet.attr( 'data-item-id' ),
                    tweet_time_sec = parseInt( jq_tweet.find( 'span[data-time]:first' ).attr( 'data-time' ), 10 ),
                    retweet_id = jq_tweet.attr( 'data-retweet-id' );
                
                jq_tweet.addClass( SCRIPT_NAME + '_touched' );
                
                if ( target_tweet_id ) {
                    log_debug( 'target_tweet_id=', target_tweet_id, 'retweet_id=', retweet_id, 'tweet_id=', tweet_id );
                    
                    if ( retweet_id ) {
                        // リツイートの場合、tweet_id では無く、retweet_id で比較
                        if ( bignum_cmp( retweet_id, target_tweet_id ) < 0 ) {
                            jq_target_tweet = jq_tweet;
                            return false;
                        }
                    }
                    else {
                        if ( bignum_cmp( tweet_id, target_tweet_id ) < 0 ) {
                            jq_target_tweet = jq_tweet;
                            return false;
                        }
                    }
                }
                
                if ( search_time_sec ) {
                    if ( retweet_id ) {
                        // TODO: リツイートの場合、時刻情報を持たない→IDから時刻を割り出し（ツイートID仕様の切替以前の場合は適当）
                        var retweet_time_sec = Math.floor( tweet_id_to_date_legacy( retweet_id ).getTime() / 1000 );
                        
                        log_debug( 'search_time_sec=', search_time_sec, 'retweet_time_sec=', retweet_time_sec );
                        
                        if ( retweet_time_sec <= search_time_sec ) {
                            jq_target_tweet = jq_tweet;
                            return false;
                        }
                    }
                    else {
                        log_debug( 'search_time_sec=', search_time_sec, 'tweet_time_sec=', tweet_time_sec );
                        
                        if ( tweet_time_sec <= search_time_sec ) {
                            jq_target_tweet = jq_tweet;
                            return false;
                        }
                    }
                }
            } );
            
            if ( ! jq_target_tweet ) {
                // 見つからなかった場合→強制スクロール
                
                if ( ! giveup_tid ) {
                    log_error( '*** give up scrolling ***' );
                    return;
                }
                
                var jq_last_tweet = jq_timeline.find( '.js-stream-item[data-item-id]:last' );
                
                if ( 0 < jq_last_tweet.length ) {
                    log_debug( 'last tweet: data-item-id: ', jq_last_tweet.attr( 'data-item-id' ), ' top: ', jq_last_tweet.offset().top );
                    $( animate_target_selector )
                    .animate( {
                        scrollTop : jq_last_tweet.offset().top
                    }, animate_speed );
                }
                
                if ( $( 'div.stream-end' ).is( ':visible' ) ) {
                    wait_counter --;
                    
                    if ( wait_counter <= 0 ) {
                        // TODO: 旧版では元ツイートをコピーして挿入する処理が入っていたが、新版では仕組み上困難
                        
                        log_error( '*** stream-end found: retry over ***' );
                        return;
                    }
                    log_debug( 'stream-end found: remaining count =', wait_counter );
                }
                else {
                    wait_counter = MAX_CHECK_RETRY;
                }
                
                setTimeout( search_tweet, INTV_CHECK_MS );
                
                return;
            }
            
            target_color = ( is_night_mode() ) ? OPTIONS.VICINITY_TWEET_COLOR_NIGHTMODE : OPTIONS.VICINITY_TWEET_COLOR;
            log_debug( '*** Pattern B *** :', target_tweet_id, jq_target_tweet.attr( 'data-item-id' ) );
        }
        
        // 目的ツイートもしくは近傍ツイートが見つかった場合→色を付けて位置を調整
        var jq_tweet_li = ( jq_target_tweet.hasClass( 'js-stream-item' ) ) ? jq_target_tweet : jq_target_tweet.parents( '.js-stream-item' );
        
        if ( jq_tweet_li.length <= 0 ) {
            jq_tweet_li = jq_target_tweet;
        }
        else {
            // TODO: 旧版では元ツイートをコピーして挿入する処理が入っていたが、新版では仕組み上困難
        }
        
        var jq_tweet_li_innter = jq_tweet_li.find( 'div.js-tweet' );

        if ( 0 < jq_tweet_li_innter.length ) {
            jq_tweet_li_innter.css( 'background-color', target_color );
        }
        else {
            jq_tweet_li.css( 'background-color', target_color );
        }
        
        function adjust() {
            $( animate_target_selector )
            .animate( {
                scrollTop : jq_tweet_li.offset().top - $( w ).height() / 2
            }, animate_speed );
        } // end of adjust()
        
        adjust();
        
        setTimeout( function () {
            adjust();
            // ※タイムラインが表示しきれておらず目的ツイートを真ん中にもってこれなかった場合等のために時間をずらして再度スクロール
        }, INTV_CHECK_MS );
        
        log_debug( '*** target tweet was found ***' );
        
        return;
    } // end of search_tweet()
    
    search_tweet();
    
    return true;

} // end of start_search_tweet()


function open_search_window( parameters ) {
    parameters = ( parameters ) ? parameters : {};
    
    var jq_link = parameters.jq_link,
        event = parameters.event,
        search_parameters = parameters.search_parameters,
        child_window = parameters.child_window,
        search_url = jq_link.attr( 'href' ),
        search_url_shift = jq_link.attr( 'data-search-url-shift' ),
        search_timeline_url = get_search_timeline_url( search_parameters.search_url_list );
    
    if ( event && ( event.shiftKey || event.altKey ) && search_url_shift ) {
        search_url = search_url_shift;
    }
    
    log_debug( 'open_search_window(): search_url =', search_url );
    
    if ( search_url == search_timeline_url ) {
        child_window = open_child_window( search_url, {
            existing_window : child_window,
            search_parameters : search_parameters
        } );
        
        return child_window;
    }
    
    var target_tweet_id = search_parameters.search_tweet_id || ( search_parameters.tweet_id_range && search_parameters.tweet_id_range.current_id ),
        search_time_sec = search_parameters.search_time_sec,
        max_position;
    
    if ( ! target_tweet_id ) {
        target_tweet_id = get_tweet_id_from_utc_sec( search_time_sec );
        
        if ( ! target_tweet_id ) {
            child_window = open_child_window( search_timeline_url, {
                existing_window : child_window,
                search_parameters : search_parameters
            } );
            
            return child_window;
        }
    }
    
    // ユーザータイムラインを予め取得し、当該ツイート以前のツイートが無いようであれば、最初から https://twitter.com/search の方を開く
    max_position = Decimal.add( target_tweet_id, 1 ).toString();
    
    if ( ! child_window ) {
        //child_window = open_child_window( 'about:blank' );
        // TODO: 非同期処理の中で window.open() を行うと、タブではなくウィンドウで開いてしまうという現象があったための対策だった
        //   [Google Chromeでの window.open() の動作の違い - 風柳メモ](http://furyu.hatenablog.com/entry/20140330/1396162061)
        //   しかし、Firefox だと、のちに href に入れようとしたところで
        //   Permission denied to access property "href" on cross-origin object
        //   のエラーが出てしまい、回避方法が不明
        //   幸い、↑の対策がなくても、現在ではタブで開いてくれるようになっている模様 ( Chrome, Firefox共に)
    }
    
    var user_timeline = object_extender( TemplateUserTimeline )
        .init( search_parameters.screen_name, {
            max_tweet_id : target_tweet_id
        } );
    
    user_timeline.fetch_tweet_info( function ( result ) {
        if ( ( ! result ) || ( ! result.tweet_info ) || ( result.tweet_info.timeline_kind != 'user-timeline' ) ) {
            log_debug( '*** target tweet was not found in user-timeline, then open search-timeline ***', search_parameters.screen_name, target_tweet_id, result );
            search_url = search_timeline_url;
        }
        
        child_window = open_child_window( search_url, {
            existing_window : child_window,
            search_parameters : search_parameters
        } );
    } );
    
    return child_window;
} // end of open_search_window()


function add_container_to_tweet( jq_tweet, jq_link_container ) {
    var jq_insert_point = jq_tweet.find( 'a.ProfileTweet-timestamp' ).parent();
    
    if ( jq_insert_point.length <= 0 ) {
        jq_insert_point = jq_tweet.find( 'small.time:first' );
    }
    jq_tweet.find( 'div.client-and-actions span.metadata:first' ).after( jq_link_container.clone( true ) );
    
    if ( jq_insert_point.next().hasClass( 'follow-bar' ) || jq_tweet.hasClass( 'js-initial-focus' ) ) {
        jq_link_container.css( 'margin-right', '24px' );
        
        if ( OPTIONS.USE_LINK_ICON ) {
            jq_link_container.css( 'transform', 'scale(2.0,2.0)' );
        }
    }
    jq_insert_point.after( jq_link_container );
} // end of add_container_to_tweet()


function add_rtlink_to_tweet( jq_tweet, tweet_id ) {
    var retweet_id = jq_tweet.attr( 'data-retweet-id' ),
        retweeter = jq_tweet.attr( 'data-retweeter' );
    
    if ( ( ! retweet_id ) || ( ! retweeter ) ) {
        return;
    }
    
    var search_info = get_search_info( {
            search_tweet_id : retweet_id,
            reacted_tweet_id : tweet_id,
            screen_name : retweeter
        } ),
        tweet_id_range = search_info.tweet_id_range,
        url_rt_search_list = search_info.search_url_list,
        search_parameters = search_info.search_parameters,
        result = get_jq_link_container( url_rt_search_list, {
            class_name : ACT_CONTAINER_CLASS,
            title : OPTIONS.ACT_LINK_TITLE,
            text : OPTIONS.ACT_LINK_TEXT,
            css : {
                'color' : OPTIONS.ACT_LINK_COLOR,
                'padding' : '4px'
            }
        } ),
        jq_rtlink_container = result.container,
        jq_rtlink = result.link,
        jq_append_point = jq_tweet.find( 'div.ProfileTweet-context:first' );
    
    set_click_handler( jq_rtlink, function ( link, event ) {
        open_search_window( {
            jq_link : jq_rtlink,
            event : event,
            search_parameters : search_parameters,
            child_window : null
        } );
        
        return false;
    } );
    
    // TODO: 旧版では、tweet_id_range が取れなかった場合（ID_THRESHOLD以前のとき）を考慮した処理が書かれていたが、不具合があったため削除
    
    if ( jq_append_point.length <= 0 ) {
        jq_append_point = jq_tweet.find( 'div.context:first' ).find( 'div.with-icn:first' );
    }
    jq_append_point.append( jq_rtlink_container );
    
} // end of add_rtlink_to_tweet()


function create_recent_retweet_users_button( tweet_id ) {
    var recent_retweet_users_button_class = SCRIPT_NAME + '-recent-retweets-button',
        recent_retweet_users_button_template = [
            '<div class="ProfileTweet-action">',
            '  <div class="IconContainer js-tooltip" data-original-title="">',
            '    <button class="btn"></button>',
            '  </div>',
            '</div>'
        ].join( '\n' ),
        
        jq_recent_retweet_users_button_container = $( recent_retweet_users_button_template ).css( {
            'min-width' : '54px'
        } )
        .addClass( recent_retweet_users_button_class ),
        
        jq_button_wrapper = jq_recent_retweet_users_button_container.find( 'div.IconContainer' ).css( {
        } )
        .attr( 'data-original-title', OPTIONS.RECENT_RETWEET_USERS_BUTTON_TITLE ),
        
        jq_button = jq_button_wrapper.find( 'button.btn' ).css( {
            'padding' : '4px 4px',
            'font-size' : '11px',
            //'background-image' : 'initial'
            'background' : 'transparent'
        } )
        .text( OPTIONS.RECENT_RETWEET_USERS_BUTTON_TEXT );
    
    jq_button.on( 'click', function ( event ) {
        event.stopPropagation();
        event.preventDefault();
        
        recent_retweet_users_dialog.open( tweet_id );
        
        return false;
    } );
    
    return jq_recent_retweet_users_button_container;

} // end of create_recent_retweet_users_button()


function add_link_to_quote_tweet( jq_item ) {
    var jq_quote_tweets = jq_item.find( 'div.QuoteTweet div.js-permalink[data-item-type="tweet"]');
    
    jq_quote_tweets.each( function () {
        var jq_quote_tweet = $( this ),
            jq_user_name = jq_quote_tweet.find( 'div.QuoteTweet-originalAuthor span.username' );
        
        if ( jq_user_name.length <= 0 ) {
            return;
        }
        
        var tweet_id = jq_quote_tweet.attr( 'data-item-id' ),
            screen_name = jq_quote_tweet.attr( 'data-screen-name' ),
            search_info = get_search_info( {
                search_tweet_id : tweet_id,
                screen_name : screen_name
            } ),
            search_url_list = search_info.search_url_list,
            search_parameters = search_info.search_parameters,
            result = get_jq_link_container( search_url_list, {
                class_name : LINK_CONTAINER_CLASS,
                title : OPTIONS.LINK_TITLE,
                text : OPTIONS.LINK_TEXT,
                css : {
                    'color' : OPTIONS.LINK_COLOR,
                    'padding' : '4px'
                }
            } ),
            jq_link_container = result.container,
            jq_link = result.link;
        
        set_click_handler( jq_link, function ( link, event ) {
            open_search_window( {
                jq_link : jq_link,
                event : event,
                search_parameters : search_parameters,
                child_window : null
            } );
            
            return false;
        } );
        
        jq_user_name.after( jq_link_container );
        
        if ( OPTIONS.ENABLE_RECENT_RETWEET_USERS_BUTTON && OAUTH2_ACCESS_TOKEN ) {
            if ( jq_quote_tweet.parents( [
                'div[data-activity-type="retweet"]',
                'div[data-activity-type="retweeted_mention"]',
                'li[data-component-context="retweet_activity"]',
                'li[data-component-context="retweeted_mention_activity"]'
               ].join( ',' ) ).length <= 0 ) {
                return;
            }
            
            var recent_retweet_users_button_class = SCRIPT_NAME + '-recent-retweets-button',
                jq_recent_retweet_users_button_container = create_recent_retweet_users_button( tweet_id ).css( {
                    'margin-left' : '12px'
                } );
            
            jq_quote_tweet.find( '.' + recent_retweet_users_button_class ).remove();
            
            jq_user_name.after( jq_recent_retweet_users_button_container );
        }
    } );
} // end of add_link_to_quote_tweet()


function add_recent_retweeets_button_to_tweet( jq_tweet ) {
    var tweet_id = jq_tweet.attr( 'data-tweet-id' ),
        jq_action_list = jq_tweet.find( '.ProfileTweet-actionList,footer' ),
        jq_action_retweet = jq_action_list.find( '.ProfileTweet-action--retweet' ),
        retweet_number;
    
    if ( ( ! tweet_id ) || ( jq_action_list.length <= 0 ) || ( jq_action_retweet.length <= 0 ) ) {
        return;
    }
    
    try {
        retweet_number = parseInt( jq_action_retweet.find( '.ProfileTweet-actionCountForPresentation' ).text(), 10 );
        if ( isNaN( retweet_number ) ) {
            retweet_number = 0;
        }
    }
    catch ( error ) {
        retweet_number = 0;
    }
    
    if ( retweet_number <= 0 ) {
        return;
    }
    
    var recent_retweet_users_button_class = SCRIPT_NAME + '-recent-retweets-button',
        jq_recent_retweet_users_button_container = create_recent_retweet_users_button( tweet_id );
    
    jq_action_list.find( '.' + recent_retweet_users_button_class ).remove();
    
    jq_recent_retweet_users_button_container.css( {
        'margin-left' : '4px'
    } );
    
    jq_action_retweet.css( {
        'min-width' : '40px'
    } );
    
    jq_action_retweet.after( jq_recent_retweet_users_button_container );

} // end of add_recent_retweeets_button_to_tweet()


function add_link_to_tweet( jq_tweet ) {
    var tweet_id = jq_tweet.attr( 'data-item-id' ),
        screen_name = jq_tweet.attr( 'data-screen-name' );
    
    if ( ( ! tweet_id ) || ( ! screen_name ) ) {
        return;
    }
    
    var time_sec = parseInt( jq_tweet.find( 'span[data-time]:first' ).attr( 'data-time' ), 10 ),
        search_info = get_search_info( {
            search_tweet_id : tweet_id,
            screen_name : screen_name,
            search_time_sec : time_sec
        } ),
        search_url_list = search_info.search_url_list,
        search_parameters = search_info.search_parameters,
        result = get_jq_link_container( search_url_list, {
            class_name : LINK_CONTAINER_CLASS,
            title : OPTIONS.LINK_TITLE,
            text : OPTIONS.LINK_TEXT,
            css : {
                'color' : OPTIONS.LINK_COLOR,
                'padding' : '4px'
            }
        } ),
        jq_link_container = result.container,
        jq_link = result.link,
        removed_number = jq_tweet.find( 'small.' + LINK_CONTAINER_CLASS ).remove().length; // 既存のものも一旦削除（Twitterによってページが書き換えられるケースに対応）
    
    log_debug( 'add_link_to_tweet(): screen_name:', screen_name, ' tweet_id:', tweet_id, ' removed_number:', removed_number, search_info );
    
    set_click_handler( jq_link, function ( jq_link, event ) {
        open_search_window( {
            jq_link : jq_link,
            event : event,
            search_parameters : search_parameters,
            child_window : null
        } );
        
        return false;
    } );
    
    add_container_to_tweet( jq_tweet, jq_link_container );
    
    add_rtlink_to_tweet( jq_tweet, tweet_id );
    
    add_link_to_quote_tweet( jq_tweet );
    
    if ( OPTIONS.ENABLE_RECENT_RETWEET_USERS_BUTTON && OAUTH2_ACCESS_TOKEN ) {
        add_recent_retweeets_button_to_tweet( jq_tweet );
    }
} // end of add_link_to_tweet()


function add_link_to_activity( jq_activity ) {
    var jq_timestamp = jq_activity.find( 'div.activity-timestamp span[data-time]:first' );
    if ( jq_timestamp.length < 1 ) {
        return;
    }
    
    var jq_tweet = jq_activity.find( 'div.tweet:first' ),
        jq_quote_tweets = jq_activity.find( 'div.js-permalink[data-item-type="tweet"]'),
        tweet_id = ( 0 < jq_tweet.length ) ? jq_tweet.attr( 'data-item-id' ) : jq_quote_tweets.attr( 'data-item-id' ),
        // TO: 引用ツイートは複数ある場合有り→暫定的に Tweet ID はそのうちの一つだけを取得
        time_sec = parseInt( jq_timestamp.attr( 'data-time' ), 10 ),
        min_sec = parseInt( jq_activity.attr( 'data-activity-min-position' ), 10 ) / 1000,
        max_sec = parseInt( jq_activity.attr( 'data-activity-max-position' ), 10 ) / 1000,
        removed_number = jq_activity.find( 'small.' + ACT_CONTAINER_CLASS ).remove().length; // 既存のものも一旦削除（Twitterによってページが書き換えられるケースに対応
    
    log_debug( 'add_link_to_activity(): time:', time_sec, ' min:', min_sec, ' max:', max_sec, ' removed_number:', removed_number );
    
    jq_activity.find( 'a.js-user-profile-link[data-user-id],a.js-profile-popup-actionable' )
    .each( function () {
        var jq_user_link = $( this ),
            screen_name = jq_user_link.attr( 'href' ).replace( /^.*\//, '' ),
            search_info = get_search_info( {
                search_tweet_id : null,
                reacted_tweet_id : tweet_id,
                screen_name : screen_name,
                search_time_sec : time_sec,
                search_time_range : {
                    time_sec : time_sec,
                    min_sec : min_sec,
                    max_sec : max_sec
                }
            } ),
            search_url_list = search_info.search_url_list,
            search_parameters = search_info.search_parameters,
            result = get_jq_link_container( search_url_list, {
                class_name : ACT_CONTAINER_CLASS,
                title : OPTIONS.ACT_LINK_TITLE,
                text : OPTIONS.ACT_LINK_TEXT,
                css : {
                    'color' : OPTIONS.ACT_LINK_COLOR
                }
            } ),
            jq_link_container = result.container,
            jq_link = result.link;
        
        set_click_handler( jq_link, function ( link, event ) {
            open_search_window( {
                jq_link : jq_link,
                event : event,
                search_parameters : search_parameters,
                child_window : null
            } );
            
            return false;
        } );
        
        if ( jq_user_link.hasClass( 'js-profile-popup-actionable' ) ) {
            if ( jq_link.hasClass( SCRIPT_NAME + '_image' ) ) {
                // アバターアイコンに挿入する際のマージン調整
                jq_user_link.find( 'img.avatar' ).css( {
                    'margin-right' : '0'
                } );
            }
            else {
                jq_link_container.css( {
                    'margin-left' : '2px'
                } );
            }
        }
        else {
            if ( ! OPTIONS.USE_LINK_ICON ) {
                jq_link_container.css( {
                    'margin-left' : '2px',
                    'margin-right' : '1px'
                } );
            }
        }
        jq_user_link.after( jq_link_container );
    } );
    
    add_link_to_quote_tweet( jq_activity );

} // end of add_link_to_activity()


function add_link_to_action_to_tweet( jq_action_to_tweet ) {
    var jq_action_to_tweet_container = jq_action_to_tweet.parents(  SELECTOR_INFO.action_to_tweet_container_selector ),
        retweeted_tweet_id = jq_action_to_tweet.attr( 'data-retweeted-tweet-id' ),
        retweet_id = jq_action_to_tweet.attr( 'data-retweet-id' );
    
    if ( ( jq_action_to_tweet_container.length <= 0 ) || ( ! retweeted_tweet_id ) || ( ! retweet_id ) ) {
        return;
    }
    
    var action_screen_name = jq_action_to_tweet.attr( 'data-screen-name' ),
        search_info = get_search_info( {
            search_tweet_id : retweet_id,
            reacted_tweet_id : retweeted_tweet_id,
            screen_name : action_screen_name
        } ),
        search_url_list = search_info.search_url_list,
        search_parameters = search_info.search_parameters,
        result = get_jq_link_container( search_url_list, {
            class_name : ACT_CONTAINER_CLASS,
            title : OPTIONS.ACT_LINK_TITLE,
            text : OPTIONS.ACT_LINK_TEXT,
            css : {
                'color' : OPTIONS.ACT_LINK_COLOR,
                'padding' : '4px'
            }
        } ),
        jq_link_container = result.container,
        jq_link = result.link,
        removed_number = jq_action_to_tweet.find( 'small.' + ACT_CONTAINER_CLASS ).remove().length; // 既存のものも一旦削除（Twitterによってページが書き換えられるケースに対応）
    
    log_debug( 'add_link_to_action_to_tweet(): action_screen_name:', action_screen_name, 'retweet_id:', retweet_id, 'retweeted_tweet_id:', retweeted_tweet_id, 'removed_number:', removed_number );
    
    set_click_handler( jq_link, function ( jq_link, event ) {
        open_search_window( {
            jq_link : jq_link,
            event : event,
            search_parameters : search_parameters,
            child_window : null
        } );
        return false;
    } );
    
    jq_action_to_tweet.find( 'a.js-user-profile-link:first' ).after( jq_link_container );
    
} // end of add_link_to_action_to_tweet()


function hide_newer_tweet( jq_tweet, threshold_tweet_id ) {
    if ( ( ! OPTIONS.HIDE_NEWER_TWEETS ) || ( ! is_search_mode() ) ) {
        return false;
    }
    
    if ( ! threshold_tweet_id ) {
        return false;
    }
    
    var tweet_id = jq_tweet.attr( 'data-retweet-id' ) || jq_tweet.attr( 'data-item-id' );
    
    if ( bignum_cmp( tweet_id, threshold_tweet_id ) < 0 ) {
        return false;
    }
    
    var jq_container = null;
    
    jq_tweet
    .parents( SELECTOR_INFO.tweet_wrapper_selector )
    .each( function () {
        var jq_tweet_wrapper = $( this ),
            jq_tweet_wrapper_parent = jq_tweet_wrapper.parent( SELECTOR_INFO.container_selector );
        
        if ( ( 0 < jq_tweet_wrapper_parent.length ) && ( ! jq_tweet_wrapper_parent.hasClass( SCRIPT_NAME + '-recent-retweet-users' ) ) ) {
            jq_container = jq_tweet_wrapper;
            return false;
        }
    } );
    
    if ( ! jq_container ) {
        return false;
    }
    
    jq_tweet.hide();
    jq_container.hide();
    
    log_debug( '* notice *: hide ', tweet_id, jq_tweet );
    
    return true;
} // end of hide_newer_tweet()


function hide_newer_tweet_container( jq_target, threshold_tweet_id ) {
    if ( ( ! OPTIONS.HIDE_NEWER_TWEETS ) || ( ! is_search_mode() ) ) {
        return false;
    }
    
    ( jq_target.hasClass( 'js-new-tweets-bar' ) ? jq_target : jq_target.find( 'div.js-new-tweets-bar') )
    .each( function () {
        var jq_new_bar = $( this ),
            jq_container = jq_new_bar.parent( 'div.stream-item' );
        
        if ( jq_container.length <= 0 ) {
            return;
        }
        
        jq_new_bar.hide();
        jq_container.hide();
        
        log_debug( '* notice *: hide new tweets bar', jq_new_bar );
    } );
    
    return true;
} // end of hide_newer_tweet_container()


function check_back_to_top( jq_target ) {
    if ( $( '#timeline.ProfileTimeline' ).length <= 0 ) {
        // ユーザータイムライン以外
        return;
    }
    
    function set_event( jq_go_to_past_button ) {
        jq_go_to_past_button
        .off( 'click' )
        .on( 'click', function ( event ) {
            var screen_name = get_screen_name_from_url(),
                jq_last_tweet = $( 'ol.stream-items div.js-stream-tweet:last' );
            
            if ( ( ! screen_name ) || ( jq_last_tweet.length <= 0 ) ) {
                jq_go_to_past_button.remove();
                return false;
            }
            
            var min_tweet_id = ( jq_last_tweet.attr( 'data-retweet-id' ) || jq_last_tweet.attr( 'data-tweet-id' ) ),
                max_id = Decimal.sub( min_tweet_id, 1 ),
                query = 'from:' + screen_name + ' max_id:' + max_id + ' include:nativeretweets',
                search_url = SEARCH_API + '?q=' + encodeURIComponent( query ) + '&f=tweets';
            
            open_child_window( search_url );
            
            return false;
        } );
    } // end of set_event()
    
    var go_to_past_button_class = SCRIPT_NAME + '_go_to_past_timeline';
    
    ( ( jq_target.hasClass( 'back-to-top' ) ) ? jq_target : jq_target.find( 'button.back-to-top' ) )
    .each( function () {
        var jq_tmp_button = $( this );
        
        if ( jq_tmp_button.hasClass( go_to_past_button_class ) ) {
            set_event( jq_tmp_button );
            return false;
        }
        
        if ( jq_tmp_button.parents( '.stream-footer' ).length <= 0 ) {
            return;
        }
        
        var jq_back_to_top_button = jq_tmp_button,
            jq_go_to_past_button = jq_back_to_top_button.clone();
        
        jq_go_to_past_button.addClass( go_to_past_button_class ).css( 'margin-left', '24px' );
        jq_go_to_past_button.text( OPTIONS.GO_TO_PAST_TEXT );
        
        set_event( jq_go_to_past_button );
        
        jq_back_to_top_button.after( jq_go_to_past_button );
    } );

} // end of check_back_to_top()


function check_help_dialog( jq_target ) {
    ( ( jq_target.attr( 'id' ) == 'keyboard-shortcut-dialog' ) ? jq_target : jq_target.find( '#keyboard-shortcut-dialog' ) ).each( function () {
        var jq_help_dialog = $( this ),
            help_class_name = SCRIPT_NAME + '_key_help';
        
        if ( 0 < jq_help_dialog.find( '.' + help_class_name ).length ) {
            return;
        }
        
        var key_info_list = [
                { key : OPTIONS.HELP_OPEN_LINK_KEYCHAR, label : OPTIONS.LINK_TITLE },
                { key : OPTIONS.HELP_OPEN_ACT_LINK_KEYCHAR, label : OPTIONS.ACT_LINK_TITLE },
                { key : OPTIONS.HELP_OPEN_RERT_DIALOG_KEYCHAR, label : OPTIONS.HELP_OPEN_RERT_DIALOG_LABEL }
            ],
            jq_modal_table_tbody = jq_help_dialog.find( 'table.modal-table:first tbody' );
        
        key_info_list.forEach( function ( key_info ) {
            var jq_tr = jq_modal_table_tbody.find( 'tr:first' ).clone()
                .addClass( help_class_name ),
                
                jq_shortcut_key = jq_tr.find( '.shortcut .sc-key' )
                .empty()
                .text( key_info.key ),
                
                jq_shortcut_label = jq_tr.find( '.shortcut-label' ).css( {
                    'max-width' : '200px',
                    'overflow' : 'hidden'
                } )
                .empty()
                .text( key_info.label ) ;
            
            jq_modal_table_tbody.append( jq_tr );
        } );
    } );
} // end of check_help_dialog()


function check_changed_node( target_node ) {
    if ( ( ! target_node ) || ( target_node.nodeType != 1 ) ) {
        return false;
    }
    
    var jq_target = $( target_node ),
        hide_threshold_tweet_id = get_hide_threshold_tweet_id();
    
    ( ( jq_target.hasClasses( SELECTOR_INFO.tweet_class_names, true ) ) ? jq_target : jq_target.find( SELECTOR_INFO.simple_tweet_selector ) )
    .each( function () {
        var jq_tweet = $( this );
        
        if ( jq_tweet.parents( SELECTOR_INFO.container_selector ).length <= 0 ) {
            return;
        }
        
        add_link_to_tweet( jq_tweet );
        
        hide_newer_tweet( jq_tweet, hide_threshold_tweet_id );
    } );
    
    ( ( jq_target.hasClasses( SELECTOR_INFO.activity_class_names, true ) ) ? jq_target : jq_target.find( SELECTOR_INFO.activity_selector ) )
    .each( function () {
        var jq_activity = $( this );
        
        add_link_to_activity( jq_activity );
    } );
    
    if ( OPTIONS.ENABLE_RECENT_RETWEET_USERS_BUTTON && OAUTH2_ACCESS_TOKEN ) {
        ( ( jq_target.hasClasses( SELECTOR_INFO.action_to_tweet_class_names, true ) ) ? jq_target : jq_target.find( SELECTOR_INFO.action_to_tweet_selector ) )
        .each( function () {
            var jq_action_to_tweet = $( this );
            
            add_link_to_action_to_tweet( jq_action_to_tweet );
        } );
    }
    
    hide_newer_tweet_container( jq_target );
    
    check_back_to_top( jq_target );
    
    check_help_dialog( jq_target );
    
} // end of check_changed_node()


function start_tweet_observer() {
    var observer = new MutationObserver( function ( records ) {
            log_debug( '*** MutationObserver ***' );
            
            records.forEach( function ( record ) {
                var target = record.target;
                                
                to_array( record.addedNodes ).forEach( function ( addedNode ) {
                    check_changed_node( addedNode );
                } );
            } );
        } );
    
    observer.observe( d.body, { childList : true, subtree : true } );
    
    // TODO: MutationObserver() で既存のリンクがあればそれをいったん削除して再挿入することで対処できるのではないかと様子見中
    //{
    //$( d ).mouseover( function ( event ){
    //   // set_click_handler() でセットした click イベントが、ツイートを「開く」→「閉じる」を実施すると無効化される(Twitter側のスクリプトの動作と思われる)
    //   // → mouseover イベント発火時に、click イベントを再設定することで対応
    //    
    //    var jq_target = $( event.target ),
    //        onclick = get_click_handler( jq_target.attr( 'id' ) );
    //    
    //    if ( onclick ) {
    //        jq_target
    //        .off( 'click' );
    //        .on( 'click', function ( event ) {
    //            onclick( $( this ), event );
    //            return false;
    //        } );
    //    }
    //} );
    //}
} // end of start_tweet_observer()


function search_and_click_button_on_stream_item( event, button_selector ) {
    function get_jq_button( jq_ancestor ) {
        return ( 0 < jq_ancestor.length ) ? jq_ancestor.find( button_selector ) : $( [] );
    } // end of get_jq_button()
    
    var tweet_selector = SELECTOR_INFO.simple_tweet_selector + ', div.QuoteTweet div.js-permalink[data-item-type="tweet"]',
        jq_gallery = $( d.body ).find( '.Gallery, .js-modal-panel' ),
        jq_target_container = ( ( 0 < jq_gallery.length ) && jq_gallery.is( ':visible' ) ) ? jq_gallery.find( tweet_selector ) : $( [] ),
        jq_button = get_jq_button( ( ( 0 < jq_gallery.length ) && jq_gallery.hasClass( 'js-modal-panel' ) ) ? jq_gallery : jq_target_container );
    
    if ( ( jq_target_container.length <= 0 ) || ( jq_button.length <= 0 ) ) {
        var jq_ancestor = $( d.body ).find( '#permalink-overlay:visible' );
        
        if ( jq_ancestor.length <= 0 ) {
            jq_ancestor = $( d.body );
        }
        
        jq_target_container = jq_ancestor.find( '.selected-stream-item, .is-selected-tweet' );
        jq_button = get_jq_button( jq_target_container );
        
        if ( ( jq_target_container.length <= 0 ) || ( jq_button.length <= 0 ) ) {
            jq_target_container = jq_ancestor.find( '.permalink-tweet' );
            jq_button = get_jq_button( jq_target_container );
        }
        
        if ( ( jq_target_container.length <= 0 ) || ( jq_button.length <= 0 ) ) {
            return;
        }
    }
    
    event.stopPropagation();
    event.preventDefault();
    
    jq_button.first().click();
    
    return false;
    
} // end of search_and_click_button_on_stream_item()


function start_key_observer() {
    function is_key_acceptable() {
        var jq_active_element = $( d.activeElement );
        
        if ( (
                ( ( jq_active_element.hasClass( 'tweet-box' ) ) || ( jq_active_element.attr( 'role' ) == 'textbox' ) || ( jq_active_element.attr( 'name' ) == 'tweet' ) ) &&
                ( jq_active_element.attr( 'contenteditable' ) == 'true' )
            ) ||
            ( jq_active_element.prop( 'tagName' ) == 'TEXTAREA' ) ||
            ( ( jq_active_element.prop( 'tagName' ) == 'INPUT' ) && ( jq_active_element.attr( 'type' ).toUpperCase() == 'TEXT' ) )
        ) {
            return false;
        }
        return true;
    } // end of is_key_acceptable()
    
    
    $( d.body )
    .on( 'keydown.main', function ( event ) {
        if ( recent_retweet_users_dialog.is_opened() ) {
            return;
        }
        
        if ( event.shiftKey || event.altKey || event.ctrlKey ) {
            return;
        }
        
        if ( ! is_key_acceptable() ) {
            return;
        }
        
        var key_code = event.keyCode;
        
        switch ( key_code ) {
            case OPTIONS.OPEN_LINK_KEYCODE :
                return search_and_click_button_on_stream_item( event, 'small.' + LINK_CONTAINER_CLASS + ' a' );
            
            case OPTIONS.OPEN_ACT_LINK_KEYCODE :
                return search_and_click_button_on_stream_item( event, 'small.' + ACT_CONTAINER_CLASS + ' a' );
            
            case OPTIONS.TOGGLE_RERT_DIALOG_KEYCODE :
                return search_and_click_button_on_stream_item( event, '.' + SCRIPT_NAME + '-recent-retweets-button button' );
        }
    } );
} // end of start_key_observer()


function check_404_page() {
    if ( ! IS_PAGE_404 ) {
        return false;
    }
    
    var tweet_info = parse_individual_tweet_url( w.location.href );
    
    if ( ! tweet_info ) {
        return false;
    }
    
    function check_header( target_node ) {
        if ( ( ! target_node ) || ( target_node.nodeType != 1 ) ) {
            return false;
        }
        
        var jq_target = $( target_node );
        
        ( ( jq_target.prop( 'tagName' ) == 'H1' ) ? jq_target : jq_target.find( 'h1' ) ).each( function () {
            var jq_h1 = $( this );
            
            if ( 0 < jq_h1.find( 'small.' + LINK_CONTAINER_CLASS ).length ) {
                return;
            }
            
            var screen_name = tweet_info.screen_name,
                tweet_id = tweet_info.tweet_id,
                search_info = get_search_info( {
                    search_tweet_id : tweet_id,
                    screen_name : screen_name
                } ),
                search_url_list = search_info.search_url_list,
                search_parameters = search_info.search_parameters,
                result = get_jq_link_container( search_url_list, {
                    class_name : LINK_CONTAINER_CLASS,
                    title : OPTIONS.LINK_TITLE,
                    text : OPTIONS.LINK_TEXT,
                    css : {
                        'color' : OPTIONS.LINK_COLOR,
                        'padding' : '4px'
                    }
                } ),
                jq_link_container = result.container,
                jq_link = result.link;
            
            jq_link_container.css( {
                'display' : 'inline-block',
                'background-color' : ( is_night_mode() ) ? '#444444' : '#ffffee',
                'margin-left' : '16px',
                'height' : '30px',
                'border-radius' : '6px'
            } );
            
            jq_link.css( {
                'display' : 'inline-block',
                'color' : ( is_night_mode() ) ? 'inherit' : '#0084b4',
                'font-size' : '16px',
                'font-weight' : 'bold',
                'padding' : '0 4px',
                'vertical-align' : 'top',
                'line-height' : '30px'
            } );
            
            set_click_handler( jq_link, function ( jq_link, event ) {
                open_search_window( {
                    jq_link : jq_link,
                    event : event,
                    search_parameters : search_parameters,
                    child_window : null
                } );
                
                return false;
            } );
            
            jq_h1.append( jq_link_container );
        } );
        
        return true;
    } // end of check_header()
    
    
    var observer = new MutationObserver( function ( records ) {
            records.forEach( function ( record ) {
                if ( 0 < record.removedNodes.length ) {
                    check_header( d.body );
                }
                
                to_array( record.addedNodes ).forEach( function ( addedNode ) {
                    var jq_target = $( addedNode );
                    if ( jq_target.hasClass( LINK_CONTAINER_CLASS ) ) {
                        return;
                    }
                    check_header( addedNode );
                } );
            } );
        } );
    
    observer.observe( d.body, { childList : true, subtree : true } );
    
    check_header( d.body );
    
    return true;

} // end of check_404_page()


function initialize( user_options ) {
    log_debug( 'Initializing...' );
    log_debug( 'document.referrer : ', d.referrer );
    
    if ( user_options ) {
        Object.keys( user_options ).forEach( function ( name ) {
            if ( user_options[ name ] === null ) {
                return;
            }
            OPTIONS[ name ] = user_options[ name ];
        } );
    }
    
    if ( ! OPTIONS.OPERATION ) {
        return;
    }
    
    ID_BEFORE = Decimal.mul( ID_INC_PER_SEC, OPTIONS.HOUR_BEFORE * 3600 );
    ID_AFTER = Decimal.mul( ID_INC_PER_SEC, OPTIONS.HOUR_AFTER * 3600 );
    ID_BEFORE_LEGACY = Decimal.mul( ID_INC_PER_SEC_LEGACY, OPTIONS.HOUR_BEFORE * 3600 );
    ID_AFTER_LEGACY = Decimal.mul( ID_INC_PER_SEC_LEGACY, OPTIONS.HOUR_AFTER * 3600 );
    ID_THRESHOLD = new Decimal( ID_THRESHOLD );
    
    log_debug( 'ID_INC_PER_SEC =', ID_INC_PER_SEC.toString() );
    log_debug( 'ID_BEFORE =', ID_BEFORE.toString() );
    log_debug( 'ID_AFTER =', ID_AFTER.toString() );
    log_debug( 'ID_THRESHOLD =', ID_THRESHOLD.toString() );
    log_debug( 'SEARCH_PARAMETERS =', SEARCH_PARAMETERS );
    
    if ( check_404_page() ) {
        // 404 ページ→ H1 に近傍リンクをセットして終了
        return;
    }
    
    
    function start_main() {
        check_changed_node( d.body );
        start_tweet_observer();
        start_search_tweet();
        start_key_observer();
        
        log_debug( 'All set.' );
    } // end of start_main()
    
    
    if ( ! OPTIONS.ENABLE_RECENT_RETWEET_USERS_BUTTON ) {
        start_main();
        return;
    }
    
    
    function get_access_token() {
        OAUTH2_ACCESS_TOKEN = null;
        set_value( SCRIPT_NAME + '_OAUTH2_ACCESS_TOKEN', '' );
        
        $.ajax( {
            type : 'POST',
            url : OAUTH2_TOKEN_API_URL,
            headers : {
                'Authorization' : 'Basic '+ ENCODED_TOKEN_CREDENTIAL,
                'Content-Type' : 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            data : {
                'grant_type' : 'client_credentials'
            },
            dataType : 'json',
            xhrFields : {
                withCredentials : false // Cross-Origin Resource Sharing(CORS)用設定
                // TODO: Chrome 拡張機能だと false であっても Cookie が送信されてしまう
                // → webRequest を有効にして、background.js でリクエストヘッダから Cookie を取り除くようにして対応
                // → webRequest を無効にしていても、Cookie が送信されなくなったので、元に戻す
                // → 0.2.6.7: 状況によっては Cookie が送出されるようなので、webRequest 有効化
                //   ※ Cookie 内に auth_token が含まれていると、403 (code:99)が返る模様
            }
        } )
        .done( function ( json ) {
            OAUTH2_ACCESS_TOKEN = json.access_token;
            if ( OPTIONS.CACHE_OAUTH2_ACCESS_TOKEN ) {
                set_value( SCRIPT_NAME + '_OAUTH2_ACCESS_TOKEN', OAUTH2_ACCESS_TOKEN );
            }
        } )
        .fail( function ( jqXHR, textStatus, errorThrown ) {
            log_error( OAUTH2_TOKEN_API_URL, textStatus );
            // TODO: Cookies 中に auth_token が含まれていると、403 (code:99)が返ってきてしまう
            // → auth_token は Twitter ログイン中保持されるため、Cookies を送らないようにする対策が取れない場合、対応は困難
            OAUTH2_ACCESS_TOKEN = null;
            set_value( SCRIPT_NAME + '_OAUTH2_ACCESS_TOKEN', '' );
        } )
        .always( function () {
            start_main();
        } );
    } // end of get_access_token()
    
    
    OAUTH2_ACCESS_TOKEN = ( OPTIONS.CACHE_OAUTH2_ACCESS_TOKEN ) ? get_value( SCRIPT_NAME + '_OAUTH2_ACCESS_TOKEN' ) : null;
    
    if ( OAUTH2_ACCESS_TOKEN ) {
        $.ajax( {
            type : 'GET',
            url : API_RATE_LIMIT_STATUS,
            data : {
                'resources' : 'statuses'
            },
            dataType : 'json',
            headers : {
                'Authorization' : 'Bearer ' + OAUTH2_ACCESS_TOKEN
            }
        } )
        .done( function ( json ) {
            if ( ( ! json ) || ( ! json.rate_limit_context ) || ( ! json.resources ) || ( ! json.resources.statuses ) ) {
                get_access_token();
                return;
            }
            start_main();
        } )
        .fail( function ( jqXHR, textStatus, errorThrown ) {
            log_debug( API_RATE_LIMIT_STATUS, textStatus );
            get_access_token();
        } )
        .always( function () {
        } );
    }
    else {
        get_access_token();
    }

} // end of initialize()


// ■ エントリポイント
if ( typeof w.twDisplayVicinity_chrome_init == 'function' ) {
    // Google Chorme 拡張機能から実行した場合、ユーザーオプションを読み込む
    w.twDisplayVicinity_chrome_init( function ( user_options ) {
        initialize( user_options );
    } );
}
else {
    initialize();
}

} )( window, document );

// ■ end of file
