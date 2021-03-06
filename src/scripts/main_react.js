// 【React 版 Twitter 用・近傍ツイート検索 メイン処理】

( ( w, d ) => {

'use strict';

w.chrome = ( ( typeof browser != 'undefined' ) && browser.runtime ) ? browser : chrome;


// ■ Firefox で XMLHttpRequest や fetch が予期しない動作をしたり、開発者ツールのネットワークに通信内容が表示されないことへの対策
// 参考: [Firefox のアドオン(content_scripts)でXMLHttpRequestやfetchを使う場合の注意 - 風柳メモ](https://memo.furyutei.work/entry/20180718/1531914142)
const XMLHttpRequest = ( typeof content != 'undefined' && typeof content.XMLHttpRequest == 'function' ) ? content.XMLHttpRequest  : w.XMLHttpRequest;
const fetch = ( typeof content != 'undefined' && typeof content.fetch == 'function' ) ? content.fetch  : w.fetch;


//{ ■ パラメータ
var OPTIONS = {
    USE_SEARCH_TL_BY_DEFAULT : false, // true: デフォルトで検索タイムラインを使用
    
    HOUR_AFTER : 3, // 対象ツイートより後の期間(時間)
    
    TARGET_TWEET_COLOR : 'gold', // 対象ツイートの色
    TARGET_TWEET_COLOR_NIGHTMODE : '#444400', // 対象ツイートの色（夜間モード）
    VICINITY_TWEET_COLOR : 'pink', // 近傍ツイートの色
    VICINITY_TWEET_COLOR_NIGHTMODE : '#440044', // 近傍ツイートの色（夜間モード）
    
    USE_LINK_ICON : true, // 近傍リンクの種類（true: アイコンを使用 ／ false: 文字を使用(未対応)
    //TODO: 文字リンクはレイアウトが難しいため、現在未対応
    //LINK_COLOR : 'inherit', // 近傍リンクの色('darkblue'→'inherit')
    //ACT_LINK_COLOR : 'inherit', // 通知リンクの色('indigo'→'inherit')
    
    LINK_ICON_COLOR : '#aab8c2',
    LINK_ICON_COLOR_HOVER : '#ff9613',
    LINK_ICON_COLOR_NIGHTMODE : '#aab8c2',
    LINK_ICON_COLOR_HOVER_NIGHTMODE : '#ff9613',
    
    ENABLE_RECENT_RETWEET_USERS_BUTTON : true, // true: [Re:RT]（最近リツイートしたユーザーを表示するボタン）を有効に
    
    MAX_USER_NUMBER : 30, // 取得ユーザー数(API制限により、100ユーザまで) (ENABLE_RECENT_RETWEET_USERS_BUTTON が true の場合に使用)
    // TODO: 元々のの「リツイートしたユーザー」ダイアログを利用しているため、未使用
    MAX_AFTER_RETWEET_MINUTES : 10, // リツイート後のツイート取得期間(分)
    MAX_BEFORE_RETWEET_MINUTES : 10, // リツイート前のツイート取得時間(分)
    
    OPEN_LINK_KEYCODE : 70, // 近傍ツイート検索キーコード([f]:70)
    HELP_OPEN_LINK_KEYCHAR : 'f', // 近傍ツイート検索キー表示
    
    OPEN_ACT_LINK_KEYCODE : 65, // アクションの近傍ツイート検索キーコード([a]:65)
    HELP_OPEN_ACT_LINK_KEYCHAR : 'a', // アクションの近傍ツイート検索キー
    
    TOGGLE_RERT_DIALOG_KEYCODE : 69, // [Re:RT]ダイアログを開くキーコード([e]:69)
    HELP_OPEN_RERT_DIALOG_KEYCHAR : 'e', // [Re:RT]ダイアログを開くキー表示
    
    STATUSES_RETWEETS_CACHE_SEC : 10, // statuses/retweets API のキャッシュを保持する時間(秒)(0:保持しない)
    
    OBSERVE_DOM_FETCH_DATA : false, // true: fetch wrapper で取得した内容を DOM 要素に書き出し、MutationObserver で監視
    
    OPERATION : true // true: 動作中、false: 停止中
};

//}


//{ ■ 共通変数
var SCRIPT_NAME = 'twDisplayVicinity_React',
    SCRIPT_NAME_JA = '近傍ツイート検索',
    
    DEBUG = false,
    DEBUG_PERFORMANCE = false;

//{ 実行環境の確認

if ( ! w.is_web_extension ) {
    // TODO: ユーザースクリプトとしての動作は未対応（拡張機能のみ対応）
    return;
}

if ( ! d.querySelector( 'div#react-root' ) ) {
    return;
}

if ( w !== w.parent ) {
    return;
}

if ( ( typeof jQuery != 'function' ) || ( typeof Decimal != 'function' ) ) {
    console.error( SCRIPT_NAME + ':', 'Library not found', typeof jQuery, typeof Decimal );
    return;
}

var $ = jQuery,
    
    IS_TOUCHED = ( function () {
        var touched_id = SCRIPT_NAME + '_touched',
            $touched = $( '#' + touched_id );
        
        if ( 0 < $touched.length ) {
            return true;
        }
        
        $( '<b>' ).attr( 'id', touched_id ).css( 'display', 'none' ).appendTo( $( d.documentElement ) );
        
        return false;
    } )(),
    
    LANGUAGE = ( function () {
        return $( 'html' ).attr( 'lang' );
    } )(),
    
    IS_FIREFOX = ( 0 <= w.navigator.userAgent.toLowerCase().indexOf( 'firefox' ) ),
    IS_EDGE = ( 0 <= w.navigator.userAgent.toLowerCase().indexOf( 'edge' ) ),
    IS_MAC = ( 0 <= w.navigator.platform.toLowerCase().indexOf( 'mac' ) );

if ( IS_TOUCHED ) {
    console.error( SCRIPT_NAME + ': Already loaded.' );
    return;
}

if ( /[?&]_temporary_page=true(?:&|$)/.test( location.href ) ) {
    // ポップアップブロック対策用暫定ページの場合は表示を隠す
    $( d.documentElement ).hide();
    return;
}

//}


switch ( LANGUAGE ) {
    case 'ja' :
        OPTIONS.LINK_TEXT = '近傍';
        OPTIONS.LINK_TITLE = '近傍ツイート検索';
        OPTIONS.ACT_LINK_TEXT = '近傍';
        OPTIONS.ACT_LINK_TITLE = 'アクションの近傍ツイート検索';
        OPTIONS.GO_TO_PAST_TEXT = '→以前のツイート';
        OPTIONS.CLOSE_TEXT = '閉じる';
        OPTIONS.RECENT_RETWEET_USERS_TEXT = '最近リツイートしたユーザー';
        OPTIONS.LOADING_TEXT = '取得中...';
        OPTIONS.LOADING_ERROR_TEXT = '読み込めませんでした';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TITLE = '最近リツイートしたユーザーを表示';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TEXT = 'Re:RT';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_BUTTON_TITLE = 'リツイート前後のツイートを取得';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_BUTTON_TEXT = '↓↑';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_BUTTON_TITLE = '閉じる';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_BUTTON_TEXT = '↑';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_BUTTON_TITLE = '開く';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_BUTTON_TEXT = '↓';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_ALL_BUTTON_TITLE = '全てのリツイート前後のツイートを取得';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_ALL_BUTTON_TEXT = 'まとめて ↓↑';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_ALL_BUTTON_TITLE = '全て閉じる';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_ALL_BUTTON_TEXT = '全て↑';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_ALL_BUTTON_TITLE = '全て開く';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_ALL_BUTTON_TEXT = '全て↓';
        OPTIONS.HELP_OPEN_RERT_DIALOG_LABEL = '[Re:RT]ダイアログを開く';
        OPTIONS.STOP_SCROLLING_BUTTON_TEXT = 'スクロール停止';
        break;
    default:
        OPTIONS.LINK_TEXT = 'Vicinity';
        OPTIONS.LINK_TITLE = 'Search vicinity tweets';
        OPTIONS.ACT_LINK_TEXT = 'Vicinity';
        OPTIONS.ACT_LINK_TITLE = 'Search vicinity tweets around action';
        OPTIONS.GO_TO_PAST_TEXT = '→ Older tweets';
        OPTIONS.CLOSE_TEXT = 'Close';
        OPTIONS.RECENT_RETWEET_USERS_TEXT = 'Recent Retweeters';
        OPTIONS.LOADING_TEXT = 'Loading...';
        OPTIONS.LOADING_ERROR_TEXT = 'Load error';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TITLE = 'Display recent users that have retweeted';
        OPTIONS.RECENT_RETWEET_USERS_BUTTON_TEXT = 'Re:RT';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_BUTTON_TITLE = 'Retrieve Tweets around this Retweet';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_BUTTON_TEXT = '↓↑';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_BUTTON_TITLE = 'Close';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_BUTTON_TEXT = '↑';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_BUTTON_TITLE = 'Open';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_BUTTON_TEXT = '↓';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_ALL_BUTTON_TITLE = 'Retrieve Tweets around all Retweets';
        OPTIONS.REFERENCE_TO_RETWEET_LOAD_ALL_BUTTON_TEXT = 'All ↓↑';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_ALL_BUTTON_TITLE = 'Close All';
        OPTIONS.REFERENCE_TO_RETWEET_CLOSE_ALL_BUTTON_TEXT = 'All ↑';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_ALL_BUTTON_TITLE = 'Open All';
        OPTIONS.REFERENCE_TO_RETWEET_OPEN_ALL_BUTTON_TEXT = 'All ↓';
        OPTIONS.HELP_OPEN_RERT_DIALOG_LABEL = 'Open [Re:RT] dialog';
        OPTIONS.STOP_SCROLLING_BUTTON_TEXT = 'Stop scrolling';
        break;
}

var API_AUTHORIZATION_BEARER = 'AAAAAAAAAAAAAAAAAAAAAF7aAAAAAAAASCiRjWvh7R5wxaKkFp7MM%2BhYBqM%3DbQ0JPmjU9F6ZoMhDfI4uTNAaQuTDm2uO9x3WFVr2xBZ2nhjdP0',
    API2_AUTHORIZATION_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    // TODO: 継続して使えるかどうか不明→変更された場合の対応を要検討
    // ※ https://abs.twimg.com/responsive-web/web/main.<version>.js (例：https://abs.twimg.com/responsive-web/web/main.007c24006b6719434.js) 内で定義されている値
    // ※ これを使用しても、一定時間内のリクエスト回数に制限有り→参考；[TwitterのAPI制限 [2019/05/31現在] - Qiita](https://qiita.com/mpyw/items/32d44a063389236c0a65)
    
    API_USER_TIMELINE_TEMPLATE = 'https://api.twitter.com/1.1/statuses/user_timeline.json?count=#COUNT#&include_my_retweet=1&include_rts=1&cards_platform=Web-13&include_entities=1&include_user_entities=1&include_cards=1&send_error_codes=1&tweet_mode=extended&include_ext_alt_text=true&include_reply_count=true',
    API_SEARCH_TIMELINE_TEMPLATE = 'https://api.twitter.com/1.1/search/universal.json?q=#QUERY#&count=#COUNT#&modules=status&result_type=recent&pc=false&cards_platform=Web-13&include_entities=1&include_user_entities=1&include_cards=1&send_error_codes=1&tweet_mode=extended&include_ext_alt_text=true&include_reply_count=true',
    API_STATUSES_RETWEETS_TEMPLATE = 'https://api.twitter.com/1.1/statuses/retweets/#TWEET_ID#.json?count=#COUNT#',
    
    VICINITY_LINK_CONTAINER_CLASS = SCRIPT_NAME + '_vicinity_link_container',
    SELF_CONTAINER_CLASS = SCRIPT_NAME + '_vicinity_link_container_self',
    ACT_CONTAINER_CLASS = SCRIPT_NAME + '_vicinity_link_container_act',
    VICINITY_LINK_CLASS = SCRIPT_NAME + '_vicinity_link',
    RECENT_RETWEETS_BUTTON_CLASS = SCRIPT_NAME + '-recent-retweets-button',
    OPEN_VICINITY_TWEETS_BUTTON_CONTAINER_CLASS = SCRIPT_NAME + '-open-vicinity-tweets-button-container',
    OPEN_VICINITY_TWEETS_BUTTON_CLASS = SCRIPT_NAME + '-open-vicinity-tweets-button',
    VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS = SCRIPT_NAME + '-vicinity-tweet-list-base-container',
    VICINITY_TWEET_LIST_PARENT_CLASS = SCRIPT_NAME + '-vicinity-tweet-list-parent',
    VICINITY_TWEET_LIST_CLASS = SCRIPT_NAME + '-vicinity-tweet-list',
    VICINITY_TWEET_CONTAINER_CLASS = SCRIPT_NAME + '-vicinity-tweet-container',
    TARGET_TWEET_CLASS = SCRIPT_NAME + '-target-tweet',
    VICINITY_TWEET_CLASS = SCRIPT_NAME + '-vicinity-tweet',
    TO_PAST_TIMELINE_CLASS = SCRIPT_NAME + '-to-past-timeline',
    
    OBSERVATION_WRAPPER_ID = SCRIPT_NAME + '-observation_wrapper',
    
    RETWEET_SEARCH_OFFSET_SEC = 24 * 60 * 60, // ユーザーアクション（リツイート／いいね）通知近傍検索の際に、通知時間から遡るオフセット値(秒)
    
    WAIT_DOM_REFRESH_MS = 100, // 通信データ通知→DOM更新待ち時間(単位：ms)
    WAIT_BEFORE_GIVEUP_SCROLL_SEC = 30, // 強制スクロールさせてタイムラインの続きを読み込む際に、いつまでも変化が見られず、諦めるまでの時間(単位:秒)
    
    MAX_ADJUST_SCROLL_NUMBER = 15, // ツイート検索後の位置調整でチェックする最大数
    ADJUST_CHECK_INTERVAL_MS = 100, // 同・チェック間隔(単位：ms)
    ADJUST_ACCEPTABLE_NUMBER = 3, // 同・ツイートのスクロール位置が安定するまでの回数（連続してADJUST_ACCEPTABLE_NUMBER回一致すれば安定したとみなす）
    MIN_TWEET_FOUND_NUMBER = 3, // 同一ツイートが表示されたとみなすまでの回数（一度表示された後にまた消えてしまうケースがあるため）
    
    LIMIT_USER_TIMELINE_TWEET_NUMBER = 200, // statuses/user_timeline の最大取得ツイート数
    DEFAULT_USER_TIMELINE_TWEET_NUMBER = 20, // statuses/user_timeline のデフォルト取得ツイート数
    
    LIMIT_SEARCH_TIMELINE_TWEET_NUMBER = 100, // search/universal の最大取得ツイート数
    DEFAULT_SEARCH_TIMELINE_TWEET_NUMBER = 20, // search/universal のデフォルト取得ツイート数
    
    LIMIT_STATUSES_RETWEETS_USER_NUMBER = 100, // statuses/retweets の最大取得ユーザー数
    DEFAULT_STATUSES_RETWEETS_USER_NUMBER = 30, // statuses/retweets のデフォルト取得ユーザー数
    
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
    
    CURRENT_REFERENCE_TO_RETWEETERS_INFO = {
        status : 'idle', // 'idle', 'wait_dialog', 'dialog_displayed'
        tweet_id : null,
        url_to_return : null,
        load_button_is_locked : false,
        $open_button_containers : [],
    },
    
    /*
    //LINK_ICON_URL = [ // アイコン(48×48)
    //    'data:image/gif;base64,',
    //    'R0lGODlhYAAwAKECAP+WE6q4wv///////yH5BAEKAAIALAAAAABgADAAQAL+lI+pi+HBopwKWEDz',
    //    'fLx7p2nXSJZWiDZdyi7l9kEGd8Tg/NSxeRrjwesJfj4ejNZKFonKjM3WZASD0ariebNGpkKtxOMN',
    //    'vcLOFZkyToLPkzQbhzWHuaY3/GNPTPPWGF9fxxeHdEbH5DWI52UYaLf2h+AGKfA4OURy5JcQd3dj',
    //    'w1UBekkUBEVpxrn5RDV6scQaufclZykJWTlpS5aIG8WoW5WYxzjZ+wdsGWLMh8z2lAvrODhs+Mab',
    //    'Q/brGnZNaKV92NddCP63TB1+Swudbr4O2Wz9fow52/18ivQJLjpWanoF35p9RlzI8sfD1EB8AXcU',
    //    'RBgtVkJNC+8RhLiNn6gyCOfsxHM2j1m9ZB3ffDxTks3JJhZlaNGIAZHFORpR8jL5K08qdBGlpaS5',
    //    'khu2ZK/eFAAAOw=='
    //].join( '' ),
    */
    
    LINK_ICON_SVG = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 -343.6)"><path transform="translate(0 343.6)" d="m0 10v4h3.8633a3.154 2.162 0 0 1 3.1367-1.9414 3.154 2.162 0 0 1 3.1348 1.9414h13.865v-4h-3.8594a3.154 2.162 0 0 1-3.1406 1.9766 3.154 2.162 0 0 1-3.1406-1.9766z" fill="currentColor"/><g transform="matrix(.48001 0 0 .42911 1.3839 211.29)" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="3"><path d="m11.7 351.77h11l-11 11z"/><path d="m11.7 351.77h-11l11 11z"/></g><rect x="6.5596" y="357.32" width=".88075" height="6.3802" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.255" style="paint-order:stroke fill markers"/><g transform="matrix(.48001 0 0 -.42911 11.384 499.94)" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="3"><path d="m11.7 351.77h11l-11 11z"/><path d="m11.7 351.77h-11l11 11z"/></g><rect transform="scale(1,-1)" x="16.56" y="-353.92" width=".88075" height="6.3802" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.255" style="paint-order:stroke fill markers"/></g></svg>',
    
    OPEN_ICON_SVG = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 -343.6)"><g fill="currentColor"><path d="m1 346.6v13h8.2083v-2.3095h-5.0511v-8.3809h15.686v8.3809h-5.0511v2.3095h8.2083v-13z" style="paint-order:markers stroke fill"/><rect x="10.433" y="351.6" width="3.1333" height="12" style="paint-order:markers stroke fill"/><path d="m12 366.6-7.1182-5.0182 14.236-1e-5z" style="paint-order:markers stroke fill"/></g></g></svg>',
    
    CLOSE_ICON_SVG = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 -343.6)"><g fill="currentColor"><path d="m1 346.6v13h8.2083v-2.3095h-5.0511v-8.3809h15.686v8.3809h-5.0511v2.3095h8.2083v-13z" style="paint-order:markers stroke fill"/><rect transform="scale(1,-1)" x="10.4" y="-364.6" width="3.1333" height="12" style="paint-order:markers stroke fill"/><path d="m11.967 349.58-7.1182 5.0182 14.236 1e-5z" style="paint-order:markers stroke fill"/></g></g></svg>',
    
    LOADING_ICON_SVG = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="10" stroke-width="4" style="stroke: currentColor; opacity: 0.4;"></circle><path d="M 12,2 a 10 10 -90 0 1 9,5" fill="none" stroke="currentColor" stroke-width="4" />',
    
    SEARCH_PARAMETERS = ( function () {
        if ( ! w.opener ) {
            return {};
        }
        
        var search_parameters = {},
            current_url = location.href,
            comparison_url = current_url;
        
        try {
            search_parameters = JSON.parse( w.name );
            
            if ( ! search_parameters ) {
                return {};
            }
            
            if ( search_parameters.search_url != comparison_url ) {
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
    
    DOMAIN_PREFIX = location.hostname.match( /^(.+\.)?twitter\.com$/ )[ 1 ] || '',
    
    TEMPORARY_PAGE_URL = ( () => {
        if ( IS_FIREFOX ) {
            // 2021/04: Firefox の場合、子ウィンドウを favicon.ico の URL で開いてから遷移しようとすると error: undefined TypeError: can't access dead object が発生するようになってしまった
            //return location.href;
            return null;
        }
        // ポップアップブロック対策に一時的に読み込むページのURLを取得
        // ※なるべく軽いページが望ましい
        // ※非同期で設定しているが、ユーザーがアクションを起こすまでには読み込まれているだろうことを期待
        var test_url = new URL( '/favicon.ico', d.baseURI ).href;
        
        fetch( test_url ).then( ( response ) => {
            TEMPORARY_PAGE_URL = test_url;
        } );
        return null;
    } )();

//}


//{ ■ 関数

function to_array( array_like_object ) {
    return Array.prototype.slice.call( array_like_object );
} // end of to_array()


//{ ログ関連
if ( typeof console.log.apply == 'undefined' ) {
    // MS-Edge 拡張機能では console.log.apply 等が undefined
    // → apply できるようにパッチをあてる
    // ※参考：[javascript - console.log.apply not working in IE9 - Stack Overflow](https://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9)
    
    [ 'log', 'info', 'warn', 'error', 'assert', 'dir', 'clear', 'profile', 'profileEnd' ].forEach( function ( method ) {
        console[ method ] = this.bind( console[ method ], console );
    }, Function.prototype.call );
    
    console.log( 'note: console.log.apply is undefined => patched' );
}


function log_debug() {
    if ( ! DEBUG ) {
        return;
    }
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.log.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_debug()


function log_info() {
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.info.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_info()


function log_error() {
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.error.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_error()

//}

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


function get_gmt_datetime( time, is_msec ) {
    var date = new Date( ( is_msec ) ? time : 1000 * time );
    
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
        url = location.href;
    }
    
    if ( ! url.match( /^(?:https?:\/\/[^\/]+)?\/([^\/]+)/ ) ) {
        return null;
    }
    
    return RegExp.$1;
} // end of get_screen_name_from_url()


function is_error_page() {
    //return ( 0 < $( 'div[data-testid="primaryColumn"] h1[role="heading"][data-testid="error-detail"]' ).length );
    return ( 0 < $( 'div[data-testid="primaryColumn"] [data-testid="error-detail"]' ).length );
} // end of is_error_page()


function is_night_mode() {
    return ( getComputedStyle( d.body ).backgroundColor != 'rgb(255, 255, 255)' );
} // end of is_night_mode()


function is_search_mode() {
    var initial_search_url = SEARCH_PARAMETERS.initial_search_url;
    
    return ( ( initial_search_url ) && ( location.href == initial_search_url ) );
} // end of is_search_mode()


function update_display_mode() {
    $( d.body ).attr( 'data-nightmode', is_night_mode() );
} // end of update_display_mode()


function is_reacted_event_element( event_element ) {
    return /^users?_(retweet|like)/.test( event_element );
} // end of is_reacted_event_element()


function is_retweeted_event_element( event_element ) {
    return /^users?_retweet/.test( event_element );
} // end of is_retweeted_event_element()


function is_liked_event_element( event_element ) {
    return /^users?_like/.test( event_element );
} // end of is_liked_event_element()


var is_tweet_retweeters_url = ( () => {
    var reg_retweeter_list_url = /^https?:\/\/([^\/]+)?\/([^\/]+)\/status(?:es)?\/(\d+)\/retweets/;
    
    return ( tweet_url ) => {
        if ( ! tweet_url ) {
            tweet_url = location.href;
        }
        return reg_retweeter_list_url.test( tweet_url );
    };
} )(); // end of is_tweet_retweeters_url()


var parse_individual_tweet_url = ( () => {
    var reg_tweet_url = /^(?:https?:\/\/[^\/]+)?\/([^\/]+)\/status(?:es)?\/(\d+)/;
    
    return ( tweet_url ) => {
        if ( ! tweet_url ) {
            tweet_url = location.href;
        }
        
        try {
            tweet_url = new URL( tweet_url, d.baseURI ).href;
        }
        catch( error ) {
            tweet_url = '';
        }
        
        if ( ! tweet_url.match( reg_tweet_url ) ) {
            return null;
        }
        
        return {
            screen_name : RegExp.$1,
            tweet_id : RegExp.$2,
            tweet_url : tweet_url
        };
    };
} )(); // end of parse_individual_tweet_url()


function get_retweet_icon( $retweeter_link ) {
    //return $retweeter_link.parents().eq( 1 ).prev().find( 'svg:first' );
    //return $retweeter_link.parents().eq( 3 ).prev().find( 'svg:first' ); // 2020.08.06: RTアイコンの位置変更に対応
    return $retweeter_link.parents().filter( ( index, element ) => element.previousSibling ).first().prev().find( 'svg:first' );
} // end of get_retweeter_icon()


function get_retweeter_link( $tweet ) {
    //return $tweet.find( 'a[role="link"]:not([href^="/i/"]):has(>span>span[dir="ltr"]>span)' ); // ←だと、自分自身がリツイートした場合に合致しない
    //return $tweet.find( 'a[role="link"]:not([href^="/i/"]):has(>span>span)' );
    return $( $tweet.get( 0 ).querySelector( 'a[role="link"][href^="/"]:not([href^="/i/"])' ) ).filter( function () {
        var $link = $( this );
        
        if ( $link.children('span').children('span').length <= 0 ) {
            return false;
        }
        
        return ( 0 < get_retweet_icon( $link ).length );
    } );
} // end of get_retweeter_link()


function get_retweeter_screen_name( $tweet ) {
    return ( get_retweeter_link( $tweet ).attr( 'href' ) || '' ).replace( /^\//, '' );
} // end of get_retweeter_screen_name()


var [
    request_observation,
    get_request_observation_container,
] = ( () => {
    var $observation_container = $( '<div/>' ).attr( 'id', OBSERVATION_WRAPPER_ID ).appendTo( $( d.documentElement ) ).css( {
            'display' : 'none',
        } ),
        
        $update_mark = $( '<input />' ).addClass( 'update_mark' ).appendTo( $observation_container ).attr( {
            'type' : 'hidden',
        } ),
        
        get_request_observation_container = () => $observation_container,
        
        request_observation = () => {
            $update_mark.remove();
            $update_mark.attr( 'value', new Date().getTime() ).appendTo( $observation_container );
        };
    
    return [
        request_observation,
        get_request_observation_container,
    ];
} )();


var open_child_window = ( () => {
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
                log_error( error );
            }
        }
        
        if ( child_window ) {
            if ( child_window.name != name ) {
                child_window.name = name;
            }
            if ( child_window.location.href != url ) {
                //child_window.location.href = url;
                child_window.location.replace( url );
            }
        }
        else {
            child_window = w.open( url, name );
        }
        
        return child_window;
    };
} )(); // end of open_child_window()


//{ Twitter API コール関連
var [
    fetch_user_timeline,
    fetch_search_timeline,
    fetch_retweets,
] = ( () => {
    var api_get_csrf_token = () => {
            var csrf_token;
            
            try {
                csrf_token = document.cookie.match( /ct0=(.*?)(?:;|$)/ )[ 1 ];
            }
            catch ( error ) {
            }
            
            return csrf_token;
        }, // end of api_get_csrf_token()
        
        create_api_header = ( api_url ) => {
            return {
                'authorization' : 'Bearer ' + ( ( ( api_url || '' ).indexOf( '/2/' ) < 0 ) ? API_AUTHORIZATION_BEARER : API2_AUTHORIZATION_BEARER ),
                'x-csrf-token' : api_get_csrf_token(),
                'x-twitter-active-user' : 'yes',
                'x-twitter-auth-type' : 'OAuth2Session',
                'x-twitter-client-language' : LANGUAGE,
            };
        },
        
        fetch_json = ( url, options ) => {
            log_debug( 'fetch_json()', url, options );
            
            if (
                //( ! DOMAIN_PREFIX ) ||
                ( IS_FIREFOX ) 
            ) {
                return fetch( url, options ).then( ( response ) => response.json() );
            }
            
            /*
            // mobile.twitter.com 等から api.twitter.com を呼ぶと、
            // > Cross-Origin Read Blocking (CORB) blocked cross-origin response <url> with MIME type application/json. See https://www.chromestatus.com/feature/5629709824032768 for more details.
            // のような警告が出て、レスポンスボディが空になってしまう
            // 参考：
            //   [Changes to Cross-Origin Requests in Chrome Extension Content Scripts - The Chromium Projects](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches)
            //   [Cross-Origin Read Blocking (CORB) とは - ASnoKaze blog](https://asnokaze.hatenablog.com/entry/2018/04/10/205717)
            */
            
            return new Promise( ( resolve, reject ) => {
                chrome.runtime.sendMessage( {
                    type : 'FETCH_JSON',
                    url : url,
                    options : options,
                }, function ( response ) {
                    log_debug( 'FETCH_JSON => response', response );
                    
                    if ( response.error ) {
                        reject( response.error );
                        return;
                    }
                    resolve( response.json );
                    // TODO: シークレット(incognito)モードだと、{"errors":[{"code":353,"message":"This request requires a matching csrf cookie and header."}]} のように返されてしまう
                    // → manifest.json に『"incognito" : "split"』が必要だが、煩雑になる(Firefoxでは manifest.json 読み込み時にエラーとなる)ため、保留
                } );
            } );
        }, // end of fetch_json()
        
        fetch_user_timeline = ( user_id, screen_name, max_id, count ) => {
            if ( isNaN( count ) || ( count < 0 ) || ( LIMIT_USER_TIMELINE_TWEET_NUMBER < count ) ) {
                count = DEFAULT_USER_TIMELINE_TWEET_NUMBER;
            }
            
            var api_url = ( API_USER_TIMELINE_TEMPLATE + ( ( user_id ) ? '&user_id=' + encodeURIComponent( user_id ) : '&screen_name=' + encodeURIComponent( screen_name ) ) ).replace( /#COUNT#/g, count ) + ( /^\d+$/.test( max_id || '' ) ? '&max_id=' + max_id : '' );
            
            return fetch_json( api_url, {
                method : 'GET',
                headers : create_api_header( api_url ),
                mode: 'cors',
                credentials: 'include',
            } );
        }, // end of fetch_user_timeline()
        
        fetch_search_timeline = ( query, count ) => {
            if ( isNaN( count ) || ( count < 0 ) || ( LIMIT_SEARCH_TIMELINE_TWEET_NUMBER < count ) ) {
                count = DEFAULT_SEARCH_TIMELINE_TWEET_NUMBER;
            }
            
            var api_url = API_SEARCH_TIMELINE_TEMPLATE.replace( /#QUERY#/g, encodeURIComponent( query ) ).replace( /#COUNT#/g, count );
            
            return fetch_json( api_url, {
                method : 'GET',
                headers : create_api_header( api_url ),
                mode: 'cors',
                credentials: 'include',
            } );
        }, // end of fetch_search_timeline()
        
        fetch_retweets = ( tweet_id, max_user_count ) => {
            if ( isNaN( max_user_count ) || ( max_user_count < 0 ) || ( LIMIT_STATUSES_RETWEETS_USER_NUMBER < max_user_count ) ) {
                max_user_count = DEFAULT_STATUSES_RETWEETS_USER_NUMBER;
            }
            
            var api_url = API_STATUSES_RETWEETS_TEMPLATE.replace( /#TWEET_ID#/g, tweet_id ).replace( /#COUNT#/g, max_user_count );
            
            return fetch_json( api_url, {
                method : 'GET',
                headers : create_api_header( api_url ),
                mode: 'cors',
                credentials: 'include',
            } );
        }; // end of fetch_retweets()
        
    return [
        fetch_user_timeline,
        fetch_search_timeline,
        fetch_retweets,
    ];
} )();
//}


//{ ユーザーアクションイベントデータ取得関連
//  TODO: ユーザーアクション→HTTP Requestまで時間がかかるため、リアルタイム取得は困難
//  →現状未使用
var [
        analyze_client_event,
        get_last_client_event,
        get_client_event_log_list,
] = ( () => {
    var client_event_log_list = [],
        max_client_event_log_number = 100,
        
        reg_client_event_url = /^\/1\.1\/jot\/client_event\.json/;
    
    function analyze_client_event( url, request_body ) {
        var url_path = new URL( url ).pathname;
        
        if ( ! reg_client_event_url.test( url_path ) ) {
            return;
        }
        
        if ( ( ! ( request_body || '' ).match( /(?:^|&)log=(.+?)(?:&|$)/ ) ) ) {
            return;
        }
        
        var log_list = JSON.parse( decodeURIComponent( RegExp.$1 ) ),
            click_event_log_list = log_list.filter( ( log ) => {
                return ( ( ! isNaN( log.client_event_sequence_number ) ) && log.event_namespace && ( ( log._category_ == 'click_event' ) || ( log.event_namespace.action == 'navigate' ||  log.event_namespace.action == 'click' ) ) );
            } );
        
        client_event_log_list = client_event_log_list.concat( click_event_log_list ).slice( -max_client_event_log_number );
    } // end of analyze_client_event()
    
    
    function get_last_client_event( action ) {
        if ( ! action ) {
            return client_event_log_list.slice( -1 )[ 0 ];
        }
        
        return client_event_log_list.slice( 0 ).reverse().find( log => ( log.event_namespace && ( log.event_namespace.action == action ) ) );
    } // end of get_last_client_event()
    
    
    function get_client_event_log_list() {
        return client_event_log_list;
    } // end of get_client_event_log_list()
    
    return [
        analyze_client_event,
        get_last_client_event,
        get_client_event_log_list,
    ];
} )();
//}


//{ Twitter API 応答取得処理関連
var [
    analyze_capture_result,
    update_tweet_info_from_user_timeline,
    update_tweet_info_from_search_timeline,
    update_tweet_retweeters_info,
    get_stored_tweet_info,
    get_stored_tweet_info_map,
    get_event_element_from_title,
    get_event_title_info_map,
    get_page_path_info,
] = ( () => {
    var reg_api_2 = /(^|\/api)\/2\//,
        reg_home_timeline_url = /(^|\/api)\/2\/timeline\/home\.json/,
        reg_conversation_url = /(^|\/api)\/2\/timeline\/conversation\/(\d+)\.json/,
        reg_user_timeline_all_url = /(^|\/api)\/2\/timeline\/(profile|media|favorites)\/(\d+)\.json/,
        reg_user_timeline_url = /(^|\/api)\/2\/timeline\/(profile|media)\/(\d+)\.json/,
        reg_user_timeline_profile_url = /(^|\/api)\/2\/timeline\/profile\/(\d+)\.json/,
        reg_user_timeline_media_url = /(^|\/api)\/2\/timeline\/media\/(\d+)\.json/,
        reg_user_timeline_favorites_url = /(^|\/api)\/2\/timeline\/favorites\/(\d+)\.json/,
        reg_search_url = /(^|\/api)\/2\/search\/adaptive\.json/,
        reg_bookmark_timeline_url = /(^|\/api)\/2\/timeline\/bookmark.json/,
        reg_retweeted_by_url = /(^|\/api)\/2\/timeline\/retweeted_by\.json/,
        reg_notification_all_url = /(^|\/api)\/2\/notifications\/all\.json/,
        reg_notification_view_url = /(^|\/api)\/2\/notifications\/view\/([^\/]+)\.json/,
        // 2020.10.14: APIのURLポイントが https://twitter.com/i/api/2/* になるものが出てきた模様
        
        reg_graphql = /(^|\/api)\/graphql\//,
        reg_graphql_retweeters = /(^|\/api)\/graphql\/[^/]+\/Retweeters/,
        reg_graphql_UserTweetsAndReplies = /(^|\/api)\/graphql\/[^/]+\/(UserTweetsAndReplies|TweetDetail)/,
        reg_graphql_TweetDetail = /(^|\/api)\/graphql\/[^/]+\/TweetDetail/,
        // [2021.07.20] 個別ツイート取得時に呼び出されるAPIが UserTweetsAndReplies から TweetDetail に変更された模様（必要な要素の構造は同じなので処理も共通とする）
        
        reg_capture_url_list = [
            reg_api_2,
        ],
        
        tweet_info_map = {},
        notification_info_map = {},
        event_title_info_map = {},
        page_path_info_map = {};
    
    function analyze_capture_result( url, json ) {
        var url_path = new URL( url ).pathname,
            globalObjects = ( json || {} ).globalObjects,
            page_url_path = new URL( location.href ).pathname,
            page_path_info = page_path_info_map[ page_url_path ] = page_path_info_map[ page_url_path ] || {};
        
        if ( ( ! reg_capture_url_list.some( reg_capture_url => reg_capture_url.test( url_path ) ) ) || ( ! globalObjects ) ) {
            if ( reg_graphql.test( url_path ) ) {
                analyze_capture_graphql( url, json );
            }
            return;
        }
        
        var timeline = json.timeline,
            tweets = globalObjects.tweets,
            users = globalObjects.users,
            notifications = globalObjects.notifications,
            
            get_tweet_info = ( tweet_id ) => {
                var tweet = tweets[ tweet_id ],
                    tweet_info = tweet_info_map[ tweet_id ] = tweet_info_map[ tweet_id ] || {
                        rt_info_map : { tweet_id_map : {}, user_id_map : {}, screen_name_map : {} },
                        like_info_map : { user_id_map : {}, screen_name_map : {} },
                    },
                    user_id = tweet.user_id_str,
                    user = users[ user_id ];
                
                Object.assign( tweet_info, {
                    id : tweet_id,
                    user_id : user_id,
                    screen_name : user.screen_name,
                    user_name : user.name,
                    timestamp_ms : Date.parse( tweet.created_at ),
                    reacted_id : tweet.retweeted_status_id_str,
                    tweet : tweet,
                } );
                
                return tweet_info;
            },
            
            get_add_entries = () => {
                try {
                    return ( ( timeline && timeline.instructions ) || [] ).filter( ( instruction ) => instruction.addEntries )[ 0 ].addEntries.entries;
                }
                catch ( error ) {
                    return [];
                }
            },
            
            analyze_tweet_info = () => {
                if ( ( ! tweets ) || ( ! users ) ) {
                    return;
                }
                var update = ( tweet ) => {
                    var tweet_id = tweet.id_str,
                        tweet_info = get_tweet_info( tweet_id ),
                        reacted_id = tweet_info.reacted_id;
                    
                    if ( ! reacted_id ) {
                        return;
                    }
                    
                    var retweeted_tweet_info = get_tweet_info( reacted_id ),
                        user_id = tweet_info.user_id,
                        screen_name = tweet_info.screen_name,
                        rt_info = {
                            id : tweet_id,
                            user_id : user_id,
                            screen_name : screen_name,
                            user_name : tweet_info.user_name,
                            timestamp_ms : tweet_info.timestamp_ms,
                        },
                        rt_info_map = retweeted_tweet_info.rt_info_map;
                    
                    rt_info_map.tweet_id_map[ tweet_id ] = rt_info_map.user_id_map[ user_id ] = rt_info_map.screen_name_map[ screen_name ] = rt_info;
                };
                
                for ( var [ key, tweet ] of Object.entries( tweets ) ) {
                    update( tweet );
                }
            }, // end of analyze_tweet_info()
            
            analyze_retweeted_tweet_info = () => {
                if ( ! reg_retweeted_by_url.test( url_path ) ) {
                    return;
                }
                
                if ( ( ! users ) || ( ! timeline ) || ( ! ( timeline.id || '' ).match( /^Retweeters-(\d+)$/ ) ) ) {
                    return;
                }
                
                var tweet_id = RegExp.$1,
                    reacted_tweet_info = get_stored_tweet_info( tweet_id );
                
                if ( ! reacted_tweet_info ) {
                    return;
                }
                
                // TODO: /2/timeline/retweeted_by の場合、リツイートIDや時刻が取得できない
                // → /1.1/statuses/retweets で取得しなおす
                // ※頻繁にRTされていると、二つの API 結果にずれが生じる（頻繁にRTされている最中ならば retweeted_by の方の entry.sortIndex を使用しても時刻のずれはそれ程問題にならないかも）
                var reacted_info_map = reacted_tweet_info.rt_info_map,
                    entries = get_add_entries();
                
                entries.forEach( ( entry ) => {
                    if ( ( ! entry.entryId ) || ( ! entry.entryId.match( /^user-(.+)$/ ) ) ) {
                        return;
                    }
                    
                    var user_id = RegExp.$1,
                        timestamp_ms = 1 * entry.sortIndex, // →これがリツイート時間だと思っていたが、単に現在時刻を元にしたソート用インデックスな模様
                        user = users[ user_id ];
                    
                    if ( ! user ) {
                        return;
                    }
                    
                    var screen_name = user.screen_name,
                        existing_reacted_info = reacted_info_map.user_id_map[ user_id ],
                        // 既存のものがある場合(個別ツイートのリツイート情報が既に得られている場合)、id(リツイートのステータスID) と timestamp_ms(リツイートの正確な時刻) は保持
                        reacted_info = {
                            id : ( existing_reacted_info ) ? existing_reacted_info.id : '',
                            user_id : user_id,
                            screen_name : screen_name,
                            user_name : user.name,
                            timestamp_ms : ( existing_reacted_info && ( existing_reacted_info.timestamp_ms < timestamp_ms ) ) ? existing_reacted_info.timestamp_ms : timestamp_ms,
                        };
                    
                    reacted_info_map.user_id_map[ user_id ] = reacted_info_map.screen_name_map[ screen_name ] = reacted_info;
                } );
                
                // /1.1/statuses/retweets で取得しなおして上書き
                update_tweet_retweeters_info( tweet_id, {
                    max_user_count : LIMIT_STATUSES_RETWEETS_USER_NUMBER,
                    cache_sec : 0, // キャッシュは使用しない
                } )
                .then( ( result ) => {
                    log_debug( 'update_tweet_retweeters_info(): result=', result );
                } )
                .catch( ( result ) => {
                    log_error( 'update_tweet_retweeters_info(): error=', result.error, result );
                } );
                
            }, // end of analyze_retweeted_tweet_info()
            
            analyze_notification_all_info = () => {
                if ( ! reg_notification_all_url.test( url_path ) ) {
                    return;
                }
                
                if ( ( ! tweets ) || ( ! users ) || ( ! notifications ) ) {
                    return;
                }
                
                var entries = get_add_entries();
                
                entries.forEach( ( entry ) => {
                    if ( ( ! entry.entryId ) || ( ! entry.entryId.match( /^notification-(.+)$/ ) ) ) {
                        return;
                    }
                    
                    var content = entry.content.item.content,
                        clientEventInfo = entry.content.item.clientEventInfo;
                    
                    if ( ! content.notification ) {
                        // content.tweet / clientEventInfo.element = 'user_replied_to_your_tweet' 等については未対応
                        return;
                    }
                    
                    var notification_id = content.notification.id, // ^notification-(.+)$ の数値部分と同じ
                        notification = notifications[ notification_id ],
                        event_element = clientEventInfo.element;
                    
                    if ( ( ! notification ) || ( ! is_reacted_event_element( event_element ) ) ) {
                        return;
                    }
                    
                    var notification_info = notification_info_map[ notification_id ] = notification_info_map[ notification_id ] || {},
                        event_title,
                        timestamp_ms,
                        targetObjects,
                        fromUsers;
                    
                    try {
                        event_title = content.notification.url.urtEndpointOptions.title;
                        timestamp_ms = 1 * notification.timestampMs; // 1 * entry.sortIndex と同じ
                        targetObjects = notification.template.aggregateUserActionsV1.targetObjects;
                        fromUsers = notification.template.aggregateUserActionsV1.fromUsers;
                    }
                    catch ( error ) {
                        // TODO: event_title が取れない場合あり？
                        log_error( 'content error:', error, content );
                        return;
                    }
                    
                    event_title_info_map[ event_element ] = {
                        event_element : event_element,
                        event_title : event_title,
                    };
                    
                    Object.assign( notification_info, {
                        id : notification_id,
                        event_element : event_element,
                        timestamp_ms : timestamp_ms,
                        event_title : event_title, // https://twitter.com/i/timeline の [data-testid="primaryColumn"] h2[role="heading"] に入る
                        content : content,
                        clientEventInfo : clientEventInfo,
                        notification : notification,
                    } );
                    
                    targetObjects.forEach( ( targetObject ) => {
                        var tweet_id = targetObject.tweet.id,
                            reacted_tweet_info = get_stored_tweet_info( tweet_id ),
                            reacted_info_map = ( is_retweeted_event_element( event_element ) ) ? reacted_tweet_info.rt_info_map : reacted_tweet_info.like_info_map;
                        
                        fromUsers.forEach( ( fromUser ) => {
                            var user_id = fromUser.user.id,
                                user = users[ user_id ],
                                screen_name = user.screen_name,
                                existing_reacted_info = reacted_info_map.user_id_map[ user_id ],
                                // 既存のものがある場合(個別ツイートのリツイート情報が既に得られている場合)、id(リツイートのステータスID) と timestamp_ms(リツイートの正確な時刻) は保持
                                reacted_info = {
                                    id : ( existing_reacted_info ) ? existing_reacted_info.id : '',
                                    user_id : user_id,
                                    screen_name : screen_name,
                                    user_name : user.name,
                                    timestamp_ms : ( existing_reacted_info && existing_reacted_info.timestamp_ms ) ? existing_reacted_info.timestamp_ms : timestamp_ms,
                                    event_element : event_element,
                                    event_title : event_title,
                                    notification_info : notification_info,
                                };
                            
                            reacted_info_map.user_id_map[ user_id ] = reacted_info_map.screen_name_map[ screen_name ] = reacted_info;
                        } );
                    } );
                } );
            }, // end of analyze_notification_all_info()
            
            analyze_notification_info = () => {
                if ( ( ! tweets ) || ( ! users ) ) {
                    return;
                }
                
                if ( ! url_path.match( reg_notification_view_url ) ) {
                    return;
                }
                
                var notification_id = RegExp.$1,
                    notification_info = notification_info_map[ notification_id ],
                    event_element;
                
                if ( notification_info && notification_info.clientEventInfo ) {
                    event_element = notification_info.clientEventInfo.element; // 'users_retweeted_your_tweet', 'users_liked_your_tweet' 等
                }
                else {
                    event_element = get_event_element_from_title();
                }
                
                if ( ! is_reacted_event_element( event_element ) ) {
                    return;
                }
                
                var entries = get_add_entries(),
                    filtered_entries = [],
                    reg_main_tweet = /^main-tweet-(\d+)$/,
                    reg_main_user = /^main-user-(\d+)$/,
                    reg_user = /^user-(\d+)$/,
                    reg_tweet = /^tweet-(\d+)$/,
                    main_tweet_id,
                    main_user_id;
                
                filtered_entries = entries.filter( ( entry ) => {
                    var entryId = entry.entryId;
                    
                    if ( ! entryId ) {
                        return false;
                    }
                    
                    if ( entryId.match( reg_main_tweet ) ) {
                        main_tweet_id = RegExp.$1;
                        return false;
                    }
                    
                    if ( entryId.match( reg_main_user ) ) {
                        main_user_id = RegExp.$1;
                        return false;
                    }
                    
                    return true;
                } );
                
                if ( ! ( main_tweet_id || main_user_id ) ) {
                    return;
                }
                
                filtered_entries.forEach( ( entry ) => {
                    var entryId = entry.entryId,
                        reg_id = ( main_tweet_id ) ? reg_user : reg_tweet,
                        tweet_id,
                        user_id;
                    
                    if ( main_tweet_id ) {
                        if ( ! entryId.match( reg_user ) ) {
                            return;
                        }
                        user_id = RegExp.$1;
                        tweet_id = main_tweet_id;
                    }
                    else {
                        if ( ! entryId.match( reg_tweet ) ) {
                            return;
                        }
                        tweet_id = RegExp.$1;
                        user_id = main_user_id;
                    }
                    
                    var reacted_tweet_info = get_tweet_info( tweet_id ),
                        reacted_info_map = ( is_retweeted_event_element( event_element ) ) ? reacted_tweet_info.rt_info_map : reacted_tweet_info.like_info_map,
                        user = users[ user_id ],
                        screen_name = user.screen_name,
                        timestamp_ms = 1 * entry.sortIndex,
                        existing_reacted_info = reacted_info_map.user_id_map[ user_id ],
                        // 既存のものがある場合(個別ツイートのリツイート情報が既に得られている場合)、id(リツイートのステータスID) と timestamp_ms(リツイートの正確な時刻) は保持
                        reacted_info = {
                            id : ( existing_reacted_info ) ? existing_reacted_info.id : '',
                            user_id : user_id,
                            screen_name : screen_name,
                            user_name : user.name,
                            timestamp_ms : ( existing_reacted_info && existing_reacted_info.timestamp_ms ) ? existing_reacted_info.timestamp_ms : timestamp_ms,
                            event_element : event_element,
                            event_title : event_title_info_map[ event_element ].event_title,
                            notification_info : notification_info,
                        };
                    
                    reacted_info_map.user_id_map[ user_id ] = reacted_info_map.screen_name_map[ screen_name ] = reacted_info;
                } );
            }; // end of analyze_notification_info()
            
        analyze_tweet_info();
        analyze_retweeted_tweet_info();
        analyze_notification_all_info();
        analyze_notification_info();
        
        if ( reg_user_timeline_all_url.test( url_path ) ) {
            page_path_info[ 'user_timeline' ] = true;
        }
    } // end of analyze_capture_result();
    
    
    function analyze_capture_graphql( url, json ) {
        var url_object = new URL( url ),
            url_path = url_object.pathname,
            url_params = url_object.searchParams,
            
            analyze_graphql_retweeters = () => {
                if ( ! reg_graphql_retweeters.test( url_path ) ) {
                    return;
                }
                var tweet_id;
                
                try {
                    tweet_id = JSON.parse( url_params.get( 'variables' ) ).tweetId;
                }
                catch ( error ) {
                    log_error( 'Tweet ID not found', url, json, error );
                    return;
                }
                
                var reacted_tweet_info = get_stored_tweet_info( tweet_id );
                
                if ( ! reacted_tweet_info ) {
                    return;
                }
                
                // TODO: /graphql/<無作為な?文字列>/Retweeters の場合、リツイートIDや時刻が取得できない
                // → /1.1/statuses/retweets で取得しなおす
                // ※頻繁にRTされていると、二つの API 結果にずれが生じる（頻繁にRTされている最中ならば graphql の方の entry.sortIndex を使用しても時刻のずれはそれ程問題にならないかも）
                var reacted_info_map = reacted_tweet_info.rt_info_map,
                    entries;
                
                try {
                    entries = json.data.retweeters_timeline.timeline.instructions[ 0 ].entries;
                }
                catch ( error ) {
                    log_error( 'entries not found', url, json, error );
                    entries = [];
                }
                
                entries.forEach( ( entry ) => {
                    if ( ( ! entry.entryId ) || ( ! entry.entryId.match( /^user-(.+)$/ ) ) ) {
                        return;
                    }
                    
                    var user_id = RegExp.$1,
                        timestamp_ms = 1 * entry.sortIndex, // →これがリツイート時間だと思っていたが、単に現在時刻を元にしたソート用インデックスな模様
                        user;
                    
                    try {
                        user = entry.content.itemContent.user.legacy;
                    }
                    catch ( error ) {
                        log_error( 'user information not found', entry.entryId, entry );
                    }
                    
                    if ( ! user ) {
                        return;
                    }
                    
                    var screen_name = user.screen_name,
                        existing_reacted_info = reacted_info_map.user_id_map[ user_id ],
                        // 既存のものがある場合(個別ツイートのリツイート情報が既に得られている場合)、id(リツイートのステータスID) と timestamp_ms(リツイートの正確な時刻) は保持
                        reacted_info = {
                            id : ( existing_reacted_info ) ? existing_reacted_info.id : '',
                            user_id : user_id,
                            screen_name : screen_name,
                            user_name : user.name,
                            timestamp_ms : ( existing_reacted_info && ( existing_reacted_info.timestamp_ms < timestamp_ms ) ) ? existing_reacted_info.timestamp_ms : timestamp_ms,
                        };
                    
                    reacted_info_map.user_id_map[ user_id ] = reacted_info_map.screen_name_map[ screen_name ] = reacted_info;
                } );
                
                // /1.1/statuses/retweets で取得しなおして上書き
                update_tweet_retweeters_info( tweet_id, {
                    max_user_count : LIMIT_STATUSES_RETWEETS_USER_NUMBER,
                    cache_sec : 0, // キャッシュは使用しない
                } )
                .then( ( result ) => {
                    log_debug( 'update_tweet_retweeters_info(): result=', result );
                } )
                .catch( ( result ) => {
                    log_error( 'update_tweet_retweeters_info(): error=', result.error, result );
                } );
            },
            
            analyze_graphql_UserTweetsAndReplies = () => {
                if ( ! reg_graphql_UserTweetsAndReplies.test( url_path ) ) {
                    return;
                }
                
                var entries = ( () => {
                        // ※ APIによって entries の位置が異なる
                        if ( reg_graphql_TweetDetail.test( url_path ) ) {
                            // /api/graphql/.*/TweetDetail の場合
                            return json.data.threaded_conversation_with_injections.instructions[ 0 ].entries;
                        }
                        else {
                            // /api/graphql/.*/UserTweetsAndReplies の場合
                            return json.data.user.result.timeline.timeline.instructions[ 0 ].entries;
                        }
                    } )(),
                    tweets = entries.reduce( ( tweets, entry ) => {
                        if ( ( ! entry.content.itemContent ) || ( ! entry.content.itemContent.tweet_results ) ) {
                            return tweets;
                        }
                        var tweet_result = entry.content.itemContent.tweet_results.result,
                            tweet = tweet_result.legacy,
                            user = tweet_result.core.user.legacy,
                            retweetd_status_result = tweet_result.legacy.retweeted_status_result;
                        
                        tweet.user = user;
                        tweets[ tweet.id_str ] = tweet;
                        
                        if ( retweetd_status_result ) {
                            var retweeted_result = retweetd_status_result.result,
                                retweeted_tweet = retweeted_result.legacy,
                                retweeted_user = retweeted_result.core.user.legacy;
                            
                            tweet.retweeted_status_id_str = retweeted_tweet.id_str;
                            retweeted_tweet.user = retweeted_user;
                            tweets[ retweeted_tweet.id_str ] = retweeted_tweet;
                        }
                        else {
                            tweet.retweeted_status_id_str = null;
                        }
                        return tweets;
                    }, {} ),
                    
                    get_tweet_info = ( tweet_id ) => {
                        var tweet = tweets[ tweet_id ],
                            tweet_info = tweet_info_map[ tweet_id ] = tweet_info_map[ tweet_id ] || {
                                rt_info_map : { tweet_id_map : {}, user_id_map : {}, screen_name_map : {} },
                                like_info_map : { user_id_map : {}, screen_name_map : {} },
                            },
                            user_id = tweet.user_id_str,
                            user = tweet.user;
                        
                        Object.assign( tweet_info, {
                            id : tweet_id,
                            user_id : user_id,
                            screen_name : user.screen_name,
                            user_name : user.name,
                            timestamp_ms : Date.parse( tweet.created_at ),
                            reacted_id : tweet.retweeted_status_id_str,
                            tweet : tweet,
                        } );
                        
                        return tweet_info;
                    },
                    
                    update = ( tweet ) => {
                        var tweet_id = tweet.id_str,
                            tweet_info = get_tweet_info( tweet_id ),
                            reacted_id = tweet_info.reacted_id;
                        
                        if ( ! reacted_id ) {
                            return;
                        }
                        
                        var retweeted_tweet_info = get_tweet_info( reacted_id ),
                            user_id = tweet_info.user_id,
                            screen_name = tweet_info.screen_name,
                            rt_info = {
                                id : tweet_id,
                                user_id : user_id,
                                screen_name : screen_name,
                                user_name : tweet_info.user_name,
                                timestamp_ms : tweet_info.timestamp_ms,
                            },
                            rt_info_map = retweeted_tweet_info.rt_info_map;
                        
                        rt_info_map.tweet_id_map[ tweet_id ] = rt_info_map.user_id_map[ user_id ] = rt_info_map.screen_name_map[ screen_name ] = rt_info;
                    };
                
                for ( var [ key, tweet ] of Object.entries( tweets ) ) {
                    update( tweet );
                }
            };
        
        analyze_graphql_retweeters();
        analyze_graphql_UserTweetsAndReplies();
    } // end of analyze_capture_graphql()
    
    
    // API1.1 用
    var [
        update_tweet_info_from_user_timeline,
        update_tweet_info_from_search_timeline,
        update_tweet_retweeters_info,
    ] = ( () => {
        var get_tweet_info = ( src_tweet ) => {
                var tweet_id = src_tweet.id_str,
                    tweet_info = tweet_info_map[ tweet_id ] = tweet_info_map[ tweet_id ] || {
                        rt_info_map : { tweet_id_map : {}, user_id_map : {}, screen_name_map : {} },
                        like_info_map : { user_id_map : {}, screen_name_map : {} },
                    },
                    src_user = src_tweet.user,
                    src_retweeted_status = src_tweet.retweeted_status || {},
                    dst_tweet = Object.assign( {}, src_tweet );
                
                delete dst_tweet.user;
                delete dst_tweet.retweeted_status;
                delete dst_tweet.quoted_status;
                
                Object.assign( tweet_info, {
                    id : tweet_id,
                    user_id : src_user.id_str,
                    screen_name : src_user.screen_name,
                    user_name : src_user.name,
                    user_icon : src_user.profile_image_url_https,
                    timestamp_ms : Date.parse( src_tweet.created_at ),
                    reacted_id : src_retweeted_status.id_str,
                    tweet : dst_tweet,
                } );
                
                return tweet_info;
            },
            
            update_retweeted_tweet_info = ( tweet_info, retweeted_tweet_info ) => {
                var tweet_id = tweet_info.id,
                    user_id = tweet_info.user_id,
                    screen_name = tweet_info.screen_name,
                    rt_info = {
                        id : tweet_id,
                        user_id : user_id,
                        screen_name : screen_name,
                        user_name : tweet_info.user_name,
                        timestamp_ms : tweet_info.timestamp_ms,
                    },
                    rt_info_map = retweeted_tweet_info.rt_info_map;
                
                rt_info_map.tweet_id_map[ tweet_id ] = rt_info_map.user_id_map[ user_id ] = rt_info_map.screen_name_map[ screen_name ] = rt_info;
            },
            
            update_tweet_info = ( src_tweet ) => {
                var src_reacted_status = src_tweet.retweeted_status,
                    src_quoted_status = src_tweet.quoted_status,
                    tweet_info = get_tweet_info( src_tweet ),
                    tweet_id = tweet_info.id,
                    retweeted_tweet_info,
                    quoted_tweet_info,
                    
                    updated_tweet_info_map = {},
                    retweeted_tweet_id_map = {};
                
                updated_tweet_info_map[ tweet_id ] = tweet_info;
                
                if ( src_reacted_status ) {
                    retweeted_tweet_info = get_tweet_info( src_reacted_status );
                    updated_tweet_info_map[ retweeted_tweet_info.id ] = retweeted_tweet_info;
                    
                    update_retweeted_tweet_info( tweet_info, retweeted_tweet_info );
                    retweeted_tweet_id_map[ tweet_info.id ] = retweeted_tweet_info.id;
                }
                
                if ( src_quoted_status ) {
                    quoted_tweet_info = get_tweet_info( src_quoted_status );
                    updated_tweet_info_map[ quoted_tweet_info.id ] = quoted_tweet_info;
                }
                
                return {
                    timeline_tweet_id : tweet_id, 
                    updated_tweet_info_map : updated_tweet_info_map,
                    retweeted_tweet_id_map : retweeted_tweet_id_map,
                };
            };
        
        var update_tweet_info_from_user_timeline = ( () => {
            return ( options ) => {
                log_debug( 'update_tweet_info_from_user_timeline() called', options );
                
                if ( ! options ) {
                    options = {};
                }
                
                var user_id = options.user_id,
                    screen_name = options.screen_name,
                    max_id = options.max_id,
                    count = options.count;
                
                return new Promise( ( resolve, reject ) => {
                    fetch_user_timeline( user_id, screen_name, max_id, count )
                    .then( ( json ) => {
                        log_debug( 'update_tweet_info_from_user_timeline(): json=', json );
                        
                        var tweets = json;
                        
                        if ( ! Array.isArray( tweets ) ) {
                            reject( {
                                json : json,
                                error : 'result JSON structure error',
                            } );
                            return;
                        }
                        
                        var timeline_tweet_ids = [],
                            updated_tweet_info_map = [],
                            retweeted_tweet_id_map = {};
                        
                        tweets.forEach( ( tweet ) => {
                            var result = update_tweet_info( tweet );
                            
                            timeline_tweet_ids.push( result.timeline_tweet_id );
                            Object.assign( updated_tweet_info_map, result.updated_tweet_info_map );
                            Object.assign( retweeted_tweet_id_map, result.retweeted_tweet_id_map );
                        } );
                        
                        resolve( {
                            json : json,
                            timeline_info : {
                                timeline_tweet_ids : timeline_tweet_ids,
                                updated_tweet_info_map : updated_tweet_info_map,
                                retweeted_tweet_id_map : retweeted_tweet_id_map,
                            }
                        } );
                    } )
                    .catch( ( error ) => {
                        log_debug( 'update_tweet_info_from_user_timeline(): fetch error:', error );
                        
                        reject( {
                            error : error,
                        } );
                    } );
                } );
            };
        } )(); // end of update_tweet_info_from_user_timeline()
        
        
        var update_tweet_info_from_search_timeline = ( () => {
            return ( query, options ) => {
                log_debug( 'update_tweet_info_from_search_timeline() called', query, options );
                
                if ( ! options ) {
                    options = {};
                }
                
                var count = options.count;
                
                return new Promise( ( resolve, reject ) => {
                    fetch_search_timeline( query, count )
                    .then( ( json ) => {
                        log_debug( 'update_tweet_info_from_search_timeline(): json=', json );
                        
                        var modules = json.modules;
                        
                        if ( ! Array.isArray( modules ) ) {
                            reject( {
                                json : json,
                                error : 'result JSON structure error',
                            } );
                            return;
                        }
                        
                        var timeline_tweet_ids = [],
                            updated_tweet_info_map = [],
                            retweeted_tweet_id_map = {};
                        
                        modules.forEach( ( module ) => {
                            var tweet;
                            
                            try {
                                tweet = module.status.data;
                                tweet.metadata = module.status.metadata;
                            }
                            catch ( error ) {
                                return;
                            }
                            
                            var result = update_tweet_info( tweet );
                            
                            timeline_tweet_ids.push( result.timeline_tweet_id );
                            Object.assign( updated_tweet_info_map, result.updated_tweet_info_map );
                            Object.assign( retweeted_tweet_id_map, result.retweeted_tweet_id_map );
                        } );
                        
                        resolve( {
                            json : json,
                            timeline_info : {
                                timeline_tweet_ids : timeline_tweet_ids,
                                updated_tweet_info_map : updated_tweet_info_map,
                                retweeted_tweet_id_map : retweeted_tweet_id_map,
                            }
                        } );
                    } )
                    .catch( ( error ) => {
                        log_debug( 'update_tweet_info_from_search_timeline(): fetch error:', error );
                        
                        reject( {
                            error : error,
                        } );
                    } );
                } );
            };
        } )(); // end of update_tweet_info_from_search_timeline()
        
        
        var update_tweet_retweeters_info = ( () => {
            var request_cache = {};
            
            return ( tweet_id, options ) => {
                log_debug( 'update_tweet_retweeters_info() called', tweet_id, options );
                
                if ( ! options ) {
                    options = {};
                }
                
                var max_user_count = options.max_user_count,
                    last_request_ms = request_cache[ tweet_id ],
                    current_ms = new Date().getTime(),
                    cache_sec = options.cache_sec ? options.cache_sec : OPTIONS.STATUSES_RETWEETS_CACHE_SEC;
                
                return new Promise( ( resolve, reject ) => {
                    if ( ( last_request_ms ) && ( ( current_ms < last_request_ms + 1000 * cache_sec ) ) ) {
                        log_debug( 'update_tweet_retweeters_info() => cached', tweet_id  );
                        
                        resolve( {
                            cached : true,
                        } );
                        return;
                    }
                    
                    request_cache[ tweet_id ] = current_ms;
                    
                    fetch_retweets( tweet_id, max_user_count )
                    .then( ( json ) => {
                        log_debug( 'update_tweet_retweeters_info(): json=', json );
                        
                        var retweets = json;
                        
                        if ( ! Array.isArray( retweets ) ) {
                            reject( {
                                json : json,
                                error : 'result JSON structure error',
                            } );
                            return;
                        }
                        
                        var reacted_tweet_info = get_stored_tweet_info( tweet_id ),
                            reacted_info_map = reacted_tweet_info.rt_info_map;
                        
                        retweets.forEach( ( retweet ) => {
                            var user = retweet.user,
                                user_id = user.id_str,
                                screen_name = user.screen_name,
                                existing_reacted_info = reacted_info_map.user_id_map[ user_id ],
                                reacted_info = {
                                    id : retweet.id_str,
                                    user_id : user_id,
                                    screen_name : screen_name,
                                    user_name : user.name,
                                    timestamp_ms : Date.parse( retweet.created_at ),
                                };
                            
                            reacted_info_map.user_id_map[ user_id ] = reacted_info_map.screen_name_map[ screen_name ] = reacted_info;
                        } );
                        
                        log_debug( 'update_tweet_retweeters_info(): ', retweets.length, 'users registerd' );
                        
                        resolve( {
                            json : json,
                            reacted_tweet_info : reacted_tweet_info,
                        } );
                    } )
                    .catch( ( error ) => {
                        log_debug( 'update_tweet_retweeters_info(): fetch error:', error );
                        
                        reject( {
                            error : error,
                        } );
                    } );
                } );
            };
        } )(); // end of update_tweet_retweeters_info()
        
        
        return [
            update_tweet_info_from_user_timeline,
            update_tweet_info_from_search_timeline,
            update_tweet_retweeters_info,
        ];
    } )();
    
    function get_stored_tweet_info( tweet_id ) {
        return tweet_info_map[ tweet_id ];
    } // end of get_stored_tweet_info
    
    
    function get_stored_tweet_info_map() {
        return tweet_info_map;
    } // end of get_stored_tweet_info_map()
    
    /*
    //var get_shortcut_keys = ( () => {
    //    var shortcut_keys = null;
    //    
    //    return () => {
    //        if ( shortcut_keys ) {
    //            return shortcut_keys;
    //        }
    //        
    //        try {
    //            shortcut_keys = JSON.parse( $( 'div[data-at-shortcutkeys]' ).attr( 'data-at-shortcutkeys' ) );
    //        }
    //        catch ( error ) {
    //            shortcut_keys = null;
    //            return {};
    //        }
    //        return shortcut_keys;
    //    };
    //} )(); // end of get_shortcut_keys()
    //
    //function get_event_element_from_title( title ) {
    //    // TODO: https://twitter.com/i/timeline のページ種別（「リツイートされました」「いいねされました」等）判別が困難（多国語対応のため）
    //    // →暫定的に、キーボードショートカットを元に、document.title に一致するものを探して判別
    //    // → /2/notifications/all.json で取得された title が document.title のものと一致するかによってイベント種別を判別できるようになったため、get_event_element_from_title() は現状未使用
    //    
    //    if ( ! title ) {
    //        title = d.title;
    //    }
    //    
    //    var retweet_string = get_shortcut_keys()[ 't' ],
    //        like_string = get_shortcut_keys()[ 'l' ];
    //    
    //    if ( ( ! retweet_string ) || ( ! like_string ) ) {
    //        return 'unknown_event';
    //    }
    //    
    //    if ( title.match( retweet_string ) ) {
    //        return 'user_retweeted_tweet';
    //    }
    //    else if ( title.match( like_string ) ) {
    //        return 'user_liked_tweet';
    //    }
    //    else {
    //        return 'unknown_event';
    //    }
    //    
    //} // end of get_event_element_from_title()
    */
    
    function get_event_element_from_title( title ) {
        if ( ! title ) {
            title = d.title;
        }
        
        var event_element = 'unknown_event';
        
        for ( var event_title_info of Object.values( event_title_info_map ) ) {
            if ( title.match( event_title_info.event_title ) ) {
                event_element = event_title_info.event_element;
                break;
            }
        }
        return event_element;
    } // end of get_event_element_from_title()
    
    function get_event_title_info_map() {
        return event_title_info_map;
    } // end of get_event_title_info_map()
    
    function get_page_path_info( page_path ) {
        if ( ! page_path ) {
            page_path = new URL( location.href ).pathname;
        }
        if ( /^https?:\/\//.test( page_path ) ) {
            page_path = new URL( page_path ).pathname;
        }
        
        return page_path_info_map[ page_path ] || {};
    } // end of get_page_path_info()
    
    return [
        analyze_capture_result,
        update_tweet_info_from_user_timeline,
        update_tweet_info_from_search_timeline,
        update_tweet_retweeters_info,
        get_stored_tweet_info,
        get_stored_tweet_info_map,
        get_event_element_from_title,
        get_event_title_info_map,
        get_page_path_info,
    ];
} )();
//}


var TemplateUserTimeline = {
    DEFAULT_UNTIL_ID : '9153891586667446272', // // datetime_to_tweet_id(Date.parse( '2080-01-01T00:00:00.000Z' )) => 9153891586667446272
    
    timeline_status : null, // 'user' / 'search' / 'end' / 'error' / 'stop'
    
    init : function ( parameters ) {
        if ( ! parameters ) {
            parameters = {};
        }
        
        var self = this,
            screen_name = self.screen_name = parameters.screen_name,
            max_tweet_id = self.requested_max_tweet_id = self.max_tweet_id = parameters.max_tweet_id,
            max_timestamp_ms = self.requested_max_timestamp_ms = self.max_timestamp_ms = parameters.max_timestamp_ms,
            tweet_ids = self.tweet_ids = [];
        
        if ( ! max_tweet_id ) {
            max_tweet_id = self.max_tweet_id = get_tweet_id_from_utc_sec( max_timestamp_ms / 1000.0 );
        }
        
        if ( max_tweet_id ) {
            self.timeline_status = 'user';
        }
        else {
            if ( max_timestamp_ms ) {
                self.timeline_status = 'search';
            }
            else {
                self.timeline_status = 'error';
            }
        }
        
        return self;
    }, // end of init()
    
    fetch_tweet_info : function () {
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
            var tweet_id = self.tweet_ids.shift(),
                tweet_info,
                fetch_tweets,
                
                recursive_call = () => {
                    self.fetch_tweet_info()
                    .then( ( tweet_info ) => {
                        resolve( tweet_info );
                    } )
                    .catch( ( error ) => {
                        reject( error );
                    } );
                };
            
            if ( tweet_id ) {
                tweet_info = get_stored_tweet_info( tweet_id );
                resolve( tweet_info );
                return;
            }
            
            switch ( self.timeline_status ) {
                case 'user' :
                    fetch_tweets = self.fetch_tweets_from_user_timeline;
                    break;
                
                case 'search' :
                    fetch_tweets = self.fetch_tweets_from_search_timeline;
                    break;
                
                case 'end' :
                    resolve( null );
                    return;
                
                default :
                    reject( {
                        timeline_status : self.timeline_status,
                    } );
                    return;
            }
            
            fetch_tweets.call( self )
            .then( ( result ) => {
                recursive_call();
            } )
            .catch( ( error ) => {
                recursive_call();
            } );
        } );
    }, // end of fetch_tweet_info()
    
    fetch_tweets_from_user_timeline : function () {
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
            var finish = ( result_function ) => {
                    result_function( {
                        timeline_status : self.timeline_status,
                        max_tweet_id : self.max_tweet_id,
                        max_timestamp_ms : self.max_timestamp_ms,
                    } );
                };
            
            update_tweet_info_from_user_timeline( {
                screen_name : self.screen_name,
                max_id : self.max_tweet_id,
            } )
            .then( ( result ) => {
                var timeline_tweet_ids = result.timeline_info.timeline_tweet_ids;
                
                if ( timeline_tweet_ids.length <= 0 ) {
                    self.timeline_status = 'search';
                    finish( resolve );
                    return;
                }
                
                self.tweet_ids = self.tweet_ids.concat( timeline_tweet_ids );
                self.max_tweet_id = new Decimal( timeline_tweet_ids[ timeline_tweet_ids.length - 1 ] ).sub( 1 ).toString();
                
                finish( resolve );
            } )
            .catch( ( error ) => {
                self.timeline_status = 'error';
                finish( reject );
            } );
        } );
    }, // end of fetch_tweets_from_user_timeline()
    
    fetch_tweets_from_search_timeline : function () {
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
            var query = 'from:' + self.screen_name + ' include:retweets include:nativeretweets ',
                
                finish = ( result_function ) => {
                    result_function( {
                        timeline_status : self.timeline_status,
                        max_tweet_id : self.max_tweet_id,
                        max_timestamp_ms : self.max_timestamp_ms,
                    } );
                };
            
            if ( self.max_tweet_id ) {
                query += 'max_id:' + self.max_tweet_id;
            }
            else {
                query += 'until:' + get_gmt_datetime( self.max_timestamp_ms + 1, true );
            }
            
            update_tweet_info_from_search_timeline( query )
            .then( ( result ) => {
                var timeline_tweet_ids = result.timeline_info.timeline_tweet_ids;
                
                if ( timeline_tweet_ids.length <= 0 ) {
                    self.timeline_status = 'end';
                    finish( resolve );
                    return;
                }
                
                self.tweet_ids = self.tweet_ids.concat( timeline_tweet_ids );
                self.max_tweet_id = new Decimal( timeline_tweet_ids[ timeline_tweet_ids.length - 1 ] ).sub( 1 ).toString();
                
                finish( resolve );
            } )
            .catch( ( error ) => {
                self.timeline_status = 'error';
                finish( reject );
            } );
        } );
    }, // end of fetch_tweets_from_search_timeline()
    
}; // end of TemplateUserTimeline


var open_search_window = ( () => {
    var user_timeline_url_template = 'https://' + DOMAIN_PREFIX + 'twitter.com/#SCREEN_NAME#/with_replies?max_id=#MAX_ID#',
        search_query_template = 'from:#SCREEN_NAME# until:#GMT_DATETIME# include:retweets include:nativeretweets',
        search_url_template = 'https://' + DOMAIN_PREFIX + 'twitter.com/search?f=live&q=#SEARCH_QUERY_ENCODED#';
    
    return ( search_parameters ) => {
        search_parameters = Object.assign( {}, search_parameters );
        
        var target_info = search_parameters.target_info,
            target_timestamp_ms = target_info.timestamp_ms,
            until_timestamp_ms = target_timestamp_ms + OPTIONS.HOUR_AFTER * 3601 * 1000,
            until_gmt_datetime = get_gmt_datetime( until_timestamp_ms, true ),
            search_query = search_query_template.replace( /#SCREEN_NAME#/g, target_info.screen_name ).replace( /#GMT_DATETIME#/g, until_gmt_datetime ),
            search_url = search_parameters.search_url = search_parameters.search_timeline_url = search_url_template.replace( /#SEARCH_QUERY_ENCODED#/g, encodeURIComponent( search_query ) ),
            test_tweet_id = ( target_info.id && tweet_id_to_date( target_info.id ) ) ? target_info.id : get_tweet_id_from_utc_sec( target_timestamp_ms / 1000.0 ),
            
            //ポップアップブロック対策
            //child_window = open_child_window( 'about:blank', '_blank' ), // 空ページを開いておく
            //→ Firefox でうまく動作しない
            //  ※ Promise（fetch_user_timeline()）で、「InternalError: "Promise rejection value is a non-unwrappable cross-compartment wrapper."」が発生
            temporary_url = ( TEMPORARY_PAGE_URL || target_info.tweet_url ) + ( /\?/.test( target_info.tweet_url ) ? '&' : '?' ) + '_temporary_page=true',
            child_window = open_child_window( temporary_url, '_blank' ), // 暫定ページを開いておく
            
            open_search_page = () => {
                var reacted_tweet_info = search_parameters.reacted_tweet_info = Object.assign( {}, search_parameters.reacted_tweet_info ),
                    target_info = search_parameters.target_info = Object.assign( {}, search_parameters.target_info ),
                    change_url = () => {
                        // TODO: Firefox だと最初 'about:blank' になっていて、かつ、child_window.location.href にアクセス不可
                        // → 'about:blank' から temporary_url に遷移する（child_window.location.hrefにアクセス可能になる）のを待つ
                        try {
                            if ( child_window.location.href.indexOf( 'http' ) < 0 ) {
                                return false;
                            }
                        }
                        catch ( error ) {
                            return false;
                        }
                        open_child_window( search_parameters.search_url, {
                            existing_window : child_window,
                            search_parameters : search_parameters,
                        } );
                        return true;
                    },
                    check_url = () => {
                        if ( ! change_url() ) {
                            return;
                        }
                        clearInterval( check_timer_id );
                    },
                    check_timer_id = setInterval( () => {
                        check_url();
                    }, 100 );
                
                delete reacted_tweet_info.rt_info_map;
                delete reacted_tweet_info.like_info_map;
                delete reacted_tweet_info.tweet;
                delete target_info.notification_info;
                
                check_url();
            };
        
        log_debug( 'search_parameters:', search_parameters, 'target_info:', target_info );
        log_debug( 'until_timestamp_ms:', until_timestamp_ms, 'until_gmt_datetime:', until_gmt_datetime );
        log_debug( 'search_url:', search_url );
        log_debug( 'test_tweet_id:', test_tweet_id );
        
        if ( ( ! search_parameters.use_user_timeline ) || ( ! test_tweet_id ) ) {
            open_search_page();
            return;
        }
        
        update_tweet_info_from_user_timeline( {
            user_id : target_info.user_id,
            screen_name : target_info.screen_name,
            max_id : test_tweet_id,
        } )
        .then( ( result ) => {
            log_debug( 'update_tweet_info_from_user_timeline() result:', result );
            
            if ( result.timeline_info.timeline_tweet_ids.length <= 0 ) {
                log_debug( 'specified tweet was not found on user timeline' );
                
                search_parameters.use_user_timeline = false;
                open_search_page();
                return;
            }
            
            var until_tweet_id = get_tweet_id_from_utc_sec( until_timestamp_ms / 1000.0 ),
                max_id = new Decimal( until_tweet_id ).sub( 1 ).toString(),
                user_timeline_url = search_parameters.search_url = search_parameters.user_timeline_url = user_timeline_url_template.replace( /#SCREEN_NAME#/g, target_info.screen_name ).replace( /#MAX_ID#/g, max_id );
            
            log_debug( 'until_tweet_id:', until_tweet_id, 'max_id:', max_id );
            log_debug( 'user_timeline_url', user_timeline_url );
            
            open_search_page();
        } )
        .catch( ( result ) => {
            log_error( 'update_tweet_info_from_user_timeline() error:', result.error, result );
            
            search_parameters.use_user_timeline = false;
            open_search_page();
        } );
    };
} )(); // end of open_search_window()


var create_vicinity_link_container = ( function () {
    var $link_container_template = $( '<div><a></a></div>' ).addClass( VICINITY_LINK_CONTAINER_CLASS ),
        $link_template = $link_container_template.find( 'a:first' ).addClass( VICINITY_LINK_CLASS ).html( LINK_ICON_SVG );
    
    return function ( options ) {
        options = ( options ) ? options : {};
        
        var tweet_url = options.tweet_url,
            tweet_url_info = parse_individual_tweet_url( tweet_url ) || {},
            act_screen_name = options.act_screen_name,
            class_name = options.class_name,
            title,
            text,
            css = options.css,
            attributes = options.attributes,
            $link_container = $link_container_template.clone( true ),
            $link = $link_container.find( 'a:first' );
        
        $link.attr( {
            'href' : tweet_url,
            'data-self_tweet_id' : tweet_url_info.tweet_id,
            'data-self_screen_name' : tweet_url_info.screen_name,
        } );
        
        if ( act_screen_name ) {
            $link.attr( 'data-act_screen_name', act_screen_name );
            $link_container.addClass( ACT_CONTAINER_CLASS );
            title = OPTIONS.ACT_LINK_TITLE;
            text = OPTIONS.ACT_LINK_TEXT;
        }
        else {
            $link_container.addClass( SELF_CONTAINER_CLASS );
            title = OPTIONS.LINK_TITLE;
            text = OPTIONS.LINK_TEXT;
        }
        
        title += '\n' + '[Shift]+' + ( IS_MAC ? '[option]' : '[Alt]' ) +'+Click: Twilog';
        
        if ( class_name ) {
            $link_container.addClass( class_name );
        }
        if ( title ) {
            $link.attr( 'title', title );
        }
        if ( css ) {
            $link.css( css );
        }
        
        if ( attributes ) {
            $link.attr( attributes );
        }
        
        // TODO: 文字リンクの場合位置調整が難しい→アイコンリンク固定
        if ( true || OPTIONS.USE_LINK_ICON ) {
            $link_container.addClass( 'icon' );
            //$link.text( ' ' ); // → SVG に変更
        }
        else {
            $link_container.addClass( 'text' );
            
            if ( text ) {
                $link.text( text );
            }
        }
        
        $link.on( 'click', function ( event ) {
            event.stopPropagation();
            event.preventDefault();
            
            //$link.parents( '[data-focusable="true"]' ).first().focus();
            
            var result_twilog = ( ( event ) => {
                    if ( ( ! event.altKey ) || ( ! event.shiftKey ) ) {
                        return false;
                    }
                    
                    var target_screen_name = $link.attr( 'data-act_screen_name' ) || $link.attr( 'data-self_screen_name' ),
                        target_timestamp_ms = 1 * $link.attr( 'data-timestamp_ms' );
                    
                    if ( ( ! target_screen_name ) || ( ! target_timestamp_ms ) ) {
                        return false;
                    }
                    
                    var target_date = new Date( target_timestamp_ms );
                    
                    if ( isNaN( target_date.getTime() ) ) {
                        return false;
                    }
                    
                    var twilog_url = 'https://twilog.org/' + target_screen_name + '/date-' + format_date( target_date, 'YYYYMMDD' ).slice( 2 );
                    
                    w.open( twilog_url, '_blank' );
                    
                    return true;
                } )( event );
            
            if ( result_twilog ) {
                return;
            }
            
            var act_screen_name = $link.attr( 'data-act_screen_name' ) || '',
                event_element = $link.attr( 'data-event_element' ) || '',
                tweet_id = $link.attr( 'data-self_tweet_id' ),
                reacted_tweet_info = get_stored_tweet_info( tweet_id ),
                target_info = {
                    tweet_url : tweet_url,
                };
            
            if ( ! reacted_tweet_info ) {
                reacted_tweet_info = {
                    id : tweet_id,
                    rt_info_map : {},
                    like_info_map : {},
                    screen_name : $link.attr( 'data-self_screen_name' ),
                    timestamp_ms : 1 * $link.attr( 'data-timestamp_ms' ),
                };
                
                Object.assign( target_info, reacted_tweet_info );
                
                open_search_window( {
                    use_user_timeline : ! ( OPTIONS.USE_SEARCH_TL_BY_DEFAULT ^ ( event.shiftKey || event.altKey || event.ctrlKey ) ),
                    // TODO: 2020/01下旬頃から、ユーザータイムラインだと遡れないケースがある
                    //  https://twitter.com/10cube/status/1223098766829309954
                    //  https://memo.furyutei.work/entry/20200129/1580302153
                    // →ユーザータイムラインを使用しないようにして対応
                    //use_user_timeline : false,
                    // → "scripts/disable_graphql_profile_timeline.js" によるパッチで暫定的に対応
                    reacted_tweet_info : reacted_tweet_info,
                    target_info : target_info,
                } );
                return;
            }
            
            if ( reacted_tweet_info.reacted_id ) {
                // リツイート／いいね情報は元ツイートに格納されているので差し替え
                // TODO: リツイートをいいねされた場合等は未対応
                tweet_id = reacted_tweet_info.reacted_id;
                reacted_tweet_info = get_stored_tweet_info( tweet_id );
            }
            
            var reacted_info_map = ( is_retweeted_event_element( event_element ) ) ? reacted_tweet_info.rt_info_map : reacted_tweet_info.like_info_map,
                reacted_info = reacted_info_map.screen_name_map[ act_screen_name ] || {},
                search_parameters = {
                    use_user_timeline : ! ( OPTIONS.USE_SEARCH_TL_BY_DEFAULT ^ ( event.shiftKey || event.altKey || event.ctrlKey ) ),
                    // TODO: 2020/01下旬頃から、ユーザータイムラインだと遡れないケースがある
                    //  https://twitter.com/10cube/status/1223098766829309954
                    //  https://memo.furyutei.work/entry/20200129/1580302153
                    // →ユーザータイムラインを使用しないようにして対応
                    //use_user_timeline : false,
                    // → "scripts/disable_graphql_profile_timeline.js" によるパッチで暫定的に対応
                    act_screen_name : act_screen_name,
                    event_element : event_element,
                    reacted_tweet_info : reacted_tweet_info,
                    target_info : target_info,
                };
            
            if ( act_screen_name ) {
                Object.assign( target_info, reacted_info );
            }
            else {
                Object.assign( target_info, {
                    id : reacted_tweet_info.id,
                    screen_name : reacted_tweet_info.screen_name,
                    timestamp_ms : reacted_tweet_info.timestamp_ms,
                    user_id : reacted_tweet_info.user_id,
                    user_name :reacted_tweet_info.user_name,
                } );
            }
            
            log_debug( 'search_parameters:', search_parameters );
            
            open_search_window( search_parameters );
        } );
        
        return $link_container;
    };
} )(); // end of create_vicinity_link_container()


var create_recent_retweet_users_button = ( () => {
    var $recent_retweet_users_button_container_template = $( '<div><button class="btn"></button></div>' ).addClass( RECENT_RETWEETS_BUTTON_CLASS ).hide(),
        $recent_retweet_users_button_template = $recent_retweet_users_button_container_template.find( 'button:first' ).attr( {
            title : OPTIONS.RECENT_RETWEET_USERS_BUTTON_TITLE,
        } ).text( OPTIONS.RECENT_RETWEET_USERS_BUTTON_TEXT );
    
    return ( tweet_id ) => {
        var $recent_retweet_users_button_container = $recent_retweet_users_button_container_template.clone( true ),
            $recent_retweet_users_button = $recent_retweet_users_button_container.find( 'button:first' );
        
        $recent_retweet_users_button.attr( {
            'data-tweet-id' : tweet_id,
        } );
        
        $recent_retweet_users_button.on( 'click', function ( event ) {
            event.stopPropagation();
            event.preventDefault();
            
            //$recent_retweet_users_button.parents( '[data-focusable="true"]' ).first().focus();
            
            var $ancestor = $recent_retweet_users_button_container.parents( 'article[role="article"]:first' );
            
            if ( CURRENT_REFERENCE_TO_RETWEETERS_INFO.status == 'idle' ) {
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.url_to_return = location.href;
            }
            CURRENT_REFERENCE_TO_RETWEETERS_INFO.tweet_id = tweet_id;
            CURRENT_REFERENCE_TO_RETWEETERS_INFO.status = 'wait_dialog';
            
            if ( ( parse_individual_tweet_url() || {} ).tweet_id == tweet_id ) {
                if ( location.href.indexOf( '/' + tweet_id + '/retweets/' ) < 0 ) {
                    $ancestor.find( 'a[href$="/retweets"], a[href$="/retweets/with_comments"]' ).get( 0 ).click();
                }
            }
            else {
                $ancestor.get( 0 ).click();
            }
            
            return false;
        } );
        
        return $recent_retweet_users_button_container;
    };
} )(); // end of create_recent_retweet_users_button()


var remove_vicinity_tweet_list = () => {
    $( '.' + VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS ).removeClass( VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS );
    $( '.' + VICINITY_TWEET_LIST_PARENT_CLASS ).remove();
}; // end of remove_vicinity_tweet_list()


var create_open_vicinity_tweets_button = ( () => {
    var reset_buttons = ( $buttons, title ) => {
            if ( ! title ) {
                title = OPTIONS.REFERENCE_TO_RETWEET_OPEN_BUTTON_TITLE;
            }
            $buttons.each( function () {
                $( this ).html( OPEN_ICON_SVG ).attr( {
                    'title' : title,
                    'data-status' : 'closed',
                } );
            } );
            
            return $buttons;
        },
        
        $button_container_template = $( '<div><a></a></div>' ).addClass( OPEN_VICINITY_TWEETS_BUTTON_CONTAINER_CLASS ),
        
        $button_template = reset_buttons( $button_container_template.find( 'a:first' ).addClass( OPEN_VICINITY_TWEETS_BUTTON_CLASS ), OPTIONS.REFERENCE_TO_RETWEET_LOAD_BUTTON_TITLE ),
        
        get_max_after_retweet_minutes = () => {
            if ( ( ! OPTIONS.MAX_AFTER_RETWEET_MINUTES ) || isNaN( OPTIONS.MAX_AFTER_RETWEET_MINUTES ) ) {
                return DEFAULT_MAX_AFTER_RETWEET_MINUTES;
            }
            var max_after_retweet_minutes = parseInt( OPTIONS.MAX_AFTER_RETWEET_MINUTES, 10 );
            
            if ( ( max_after_retweet_minutes < 1 ) || ( LIMIT_MAX_AFTER_RETWEET_MINUTES < max_after_retweet_minutes ) ) {
                return DEFAULT_MAX_AFTER_RETWEET_MINUTES;
            }
            
            return max_after_retweet_minutes;
        },
        
        get_max_before_retweet_minutes = () => {
            if ( ( ( ! OPTIONS.MAX_BEFORE_RETWEET_MINUTES ) && ( OPTIONS.MAX_BEFORE_RETWEET_MINUTES !== 0 ) ) || isNaN( OPTIONS.MAX_BEFORE_RETWEET_MINUTES ) ) {
                return DEFAULT_MAX_BEFORE_RETWEET_MINUTES;
            }
            var max_before_retweet_minutes = parseInt( OPTIONS.MAX_BEFORE_RETWEET_MINUTES, 10 );
            
            if ( ( max_before_retweet_minutes < 0 ) || ( LIMIT_MAX_BEFORE_RETWEET_MINUTES < max_before_retweet_minutes ) ) {
                return DEFAULT_MAX_BEFORE_RETWEET_MINUTES;
            }
            
            return max_before_retweet_minutes;
        },
        
        $button_containers_cache = {};
    
    $( w ).on( 'resize', ( event ) => {
        // TODO: 画面横幅に応じてユーザーリストがポップアップ←→全画面切り替わるため、挿入箇所が異なってくる
        // →いったんクリアする
        remove_vicinity_tweet_list();
        
        $( '.' + OPEN_VICINITY_TWEETS_BUTTON_CONTAINER_CLASS + '.current' ).removeClass( 'current' );
    } );
    
    return ( options ) => {
        options = ( options ) ? options : {};
        
        var tweet_url = options.tweet_url,
            tweet_url_info = parse_individual_tweet_url( tweet_url ) || {},
            retweeted_tweet_id = tweet_url_info.tweet_id,
            act_screen_name = options.act_screen_name,
            button_container_key = retweeted_tweet_id + ',' + act_screen_name,
            $button_container = $button_containers_cache[ button_container_key ] || $(),
            $tweet_list_container;
        
        if ( 0 < $button_container.length ) {
            $button_container.removeClass( 'current' );
            
            return $button_container;
        }
        
        $button_containers_cache[ button_container_key ] = $button_container = $button_container_template.clone( true );
        
        var $button = $button_container.find( 'a:first' ),
            is_loaded = false,
            
            create_tweet_container = ( tweet_info, rt_info ) => {
                var $tweet = $( '<li/>' ).addClass( VICINITY_TWEET_CONTAINER_CLASS ).attr( {
                        'tabindex' : '1', // tabindex 属性がないと文字の選択ができない (Chrome  77.0.3865.120)
                        'title' : '',
                    } ),
                    $user_icon_container = $( '<div/>' ).addClass( 'user-icon' ).appendTo( $tweet ),
                    $tweet_info_container = $( '<div/>' ).addClass( 'tweet-info' ).appendTo( $tweet ),
                    $mark_container = $( '<div/>' ).addClass( 'tweet-mark' ).appendTo( $tweet ),
                    $timestamp_container = $( '<div/>' ).addClass( 'tweet-timestamp' ).appendTo( $tweet ),
                    $tweet_body_container = $( '<div/>' ).addClass( 'tweet-body' ).appendTo( $tweet ),
                    $tweet_media_container = $( '<div/>' ).addClass( 'tweet-media' ).appendTo( $tweet ),
                    $tweet_link = $( '<a/>' ).text( format_date( new Date( tweet_info.timestamp_ms ), 'YYYY/MM/DD hh:mm:ss') ).attr( {
                        'href' : '/' + tweet_info.screen_name + '/status/' + tweet_info.id,
                    } ),
                    $rt_link,
                    //tweet_parts = tweet_info.tweet.full_text.split( '' ), // サロゲートペアを含む場合は NG
                    tweet_parts = Array.from( tweet_info.tweet.full_text ),
                    tweet_entities = tweet_info.tweet.entities,
                    tweet_extended_entities = tweet_info.tweet.extended_entities,
                    card_info = tweet_info.tweet.card || {},
                    media_list = [];
                
                log_debug( 'create_tweet_container() tweet_info:', tweet_info, 'rt_info:', rt_info );
                
                if ( rt_info ) {
                    $tweet_info_container.append( $tweet_link );
                    //$mark_container.html( '&#8656;' );
                    $mark_container.html( '&#8658;' );
                    $rt_link = $tweet_link.clone( true ).text( format_date( new Date( rt_info.timestamp_ms ), 'YYYY/MM/DD hh:mm:ss') ).attr( {
                        'href' : '/' + rt_info.screen_name + '/status/' + rt_info.id,
                    } );
                    $timestamp_container.append( $rt_link );
                }
                else {
                    $timestamp_container.append( $tweet_link );
                }
                
                if ( tweet_entities ) {
                    ( tweet_entities.urls || [] ).forEach( ( url_info ) => {
                        var index;
                        
                        tweet_parts[ url_info.indices[ 0 ] ] = '<a href="' + url_info.expanded_url + '">' + url_info.display_url + '</a>';
                        
                        for ( index = url_info.indices[ 0 ] + 1; index < url_info.indices[ 1 ]; index ++ ) {
                            tweet_parts[ index ] = '';
                        }
                        
                        if ( url_info.url != card_info.url ) {
                            return;
                        }
                        
                        var image_value = ( () => {
                                try {
                                    var thumnail_urls = [],
                                        binding_values = card_info.binding_values,
                                        image_values = Object.keys( binding_values ).reduce( ( image_values, key ) => {
                                            var element = binding_values[ key ];
                                            
                                            if ( element.type == 'IMAGE' ) {
                                                image_values.push( element.image_value );
                                            }
                                            return image_values;
                                        }, [] ).sort( ( a, b ) => a.height - b.height );
                                    
                                    return image_values[ 0 ];
                                }
                                catch ( error ) {
                                    return {};
                                }
                            } )(),
                            
                            thumbnail_url = ( image_value || {} ).url;
                            // TODO: image_value が undefined になるケースあり（ただし、後ほど同一ツイートで確認するも再現しない）
                        
                        if ( ! thumbnail_url ) {
                            return;
                        }
                        
                        var $link = $( '<a><img/></a>' ).attr( {
                                'href' : url_info.expanded_url,
                            } ),
                            $image = $link.find( 'img:first' ).attr( 'src', thumbnail_url );
                        
                        try {
                            $image.attr( {
                                'width' : image_value.width,
                                'height' : image_value.height,
                            } );
                        }
                        catch ( error ) {
                        }
                        
                        $tweet_media_container.append( $link );
                    } );
                    
                    ( tweet_entities.user_mentions || [] ).forEach( ( user_info ) => {
                        var index;
                        
                        tweet_parts[ user_info.indices[ 0 ] ] = '<a href="/' + user_info.screen_name + '">@' + user_info.screen_name + '</a>';
                        
                        for ( index = user_info.indices[ 0 ] + 1; index < user_info.indices[ 1 ]; index ++ ) {
                            tweet_parts[ index ] = '';
                        }
                    } );
                    
                    ( tweet_entities.hashtags || [] ).forEach( ( hashtag_info ) => {
                        var index;
                        
                        tweet_parts[ hashtag_info.indices[ 0 ] ] = '<a href="/hashtag/' + encodeURIComponent( hashtag_info.text ) + '">#' + hashtag_info.text + '</a>';
                        
                        for ( index = hashtag_info.indices[ 0 ] + 1; index < hashtag_info.indices[ 1 ]; index ++ ) {
                            tweet_parts[ index ] = '';
                        }
                    } );
                    
                    media_list = ( tweet_extended_entities && tweet_extended_entities.media ) || tweet_entities.media;
                    // ※複数画像ある場合でもtweet_entities.media に 1 つしか入らない場合がある（例：https://twitter.com/furyutei/status/1006917155483410432）
                    
                    if ( media_list ) {
                        media_list.forEach( ( media_info ) => {
                            var index,
                                is_image = ! /video/.test( media_info.media_url_https ),
                                $link = $( '<a><img/></a>' ).attr( {
                                    'href' : ( is_image ) ? media_info.media_url_https.replace( /\.([^.]+)$/, '?format=$1&name=orig' ) : media_info.expanded_url,
                                } ),
                                $image = $link.find( 'img:first' );
                            
                            if ( is_image ) {
                                $image.attr( {
                                    'src' : media_info.media_url_https.replace( /\.([^.]+)$/, '?format=$1&name=thumb' ),
                                } );
                                
                                try {
                                    $image.attr( {
                                        'width' : media_info.sizes.thumb.w,
                                        'height' : media_info.sizes.thumb.h,
                                    } );
                                }
                                catch ( error ) {
                                }
                            }
                            else {
                                $image.attr( {
                                    'src' : media_info.media_url_https,
                                } );
                                
                                try {
                                    $image.attr( {
                                        'width' : media_info.original_info.width,
                                        'height' : media_info.original_info.height,
                                    } );
                                }
                                catch ( error ) {
                                }
                            }
                            
                            $tweet_media_container.append( $link );
                            
                            tweet_parts[ media_info.indices[ 0 ] ] = '<a href="' + media_info.expanded_url + '">' + media_info.display_url + '</a>';
                            
                            for ( index = media_info.indices[ 0 ] + 1; index < media_info.indices[ 1 ]; index ++ ) {
                                tweet_parts[ index ] = '';
                            }
                        } );
                    }
                    
                    // TODO: entities.card 等の展開は保留
                }
                
                $tweet_body_container.html( tweet_parts.join( '' ).replace( /\n/g, '<br />' ) );
                
                $tweet.find( 'a' ).attr( {
                    'target' : '_blank',
                } );
                
                return $tweet;
            },
            
            add_tweet_to_list = ( tweet_info, rt_info, $retweeted_tweet ) => {
                if ( tweet_info.reacted_id ) {
                    return; // RT は表示しない
                }
                
                var $tweet = create_tweet_container( tweet_info );
                
                if ( ( ( tweet_info.id && rt_info.id )  && ( bignum_cmp( tweet_info.id, rt_info.id ) > 0 ) ) || ( rt_info.timestamp_ms < tweet_info.timestamp_ms ) ) {
                    $retweeted_tweet.before( $tweet );
                }
                else {
                    $tweet_list_container.append( $tweet );
                }
            },
            
            get_tweet_list_parent = () => {
                var $region = $button_container.parents( 'section[role="region"]:first' ),
                    $base_container = $region.parents().eq( 2 ).addClass( VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS ),
                    $scroll_base = $base_container.children().first(),
                    $tweet_list_parent = $base_container.nextAll( '.' + VICINITY_TWEET_LIST_PARENT_CLASS ),
                    $user_cell_container = $button_container.parents( 'div[data-testid="UserCell"]:first' ),
                    $user_container = $user_cell_container.parents().eq( 1 ),
                    $scroll_area;
                
                if ( $tweet_list_parent.length <= 0 ) {
                    $tweet_list_parent = $( '<div/>' ).addClass( VICINITY_TWEET_LIST_PARENT_CLASS ).hide().attr( {
                        'title' : OPTIONS.REFERENCE_TO_RETWEET_CLOSE_BUTTON_TITLE,
                    } );
                }
                
                /*
                //if ( $tweet_list_parent.is( ':hidden' ) ) {
                //    if ( 0 < $user_container.parents( 'main[role="main"]' ).length ) {
                //        // 画面幅が一定より狭い場合には全画面→スクロールは window 基準
                //        $( w ).scrollTop( $user_container.offset().top - ( $( w ).height() / 2 ) + $user_container.height() * 1.5 );
                //    }
                //    else {
                //        // 画面幅が一定より広い場合にはポップアップ→スクロールは親要素基準
                //        //$user_container.get( 0 ).scrollIntoView( false );
                //    }
                //}
                */
                if ( 0 < $user_container.parents( 'main[role="main"]' ).length ) {
                    // 画面幅が一定より狭い場合には全画面→スクロールは window 基準
                    //$( w ).scrollTop( $user_container.offset().top - 73 );
                    ( ( $nav ) => {
                        $( w ).scrollTop( $user_container.offset().top - 73 - ( ( 0 < $nav.length ) ? $nav.height() : 0 ) ); // コメント付き／なしタブがある場合は位置をずらす
                    } )( $( 'main[role="main"] nav[role="navigation"]' ) );
                    
                    ( ( left, width ) => {
                        if ( ( left <= 0 ) || ( width <= 0 ) ) {
                            return;
                        }
                        $tweet_list_parent.css( {
                            'left' : ( left + 1 ) + 'px',
                            'width' : ( width - 2 ) + 'px',
                        } );
                    } )( $( 'main[role="main"]' ).position().left, $('div[data-testid="primaryColumn"]').width() );
                }
                else {
                    $scroll_area = $user_container.parents( 'section[role="region"]:first' ).parents().eq( 1 );
                    $scroll_area.scrollTop( $scroll_area.scrollTop() + $user_container.offset().top - $scroll_area.offset().top - 24 );
                }
                
                $tweet_list_parent.off( 'click' ).on( 'click', ( event ) => {
                    event.stopPropagation();
                    event.preventDefault();
                    
                    if ( $tweet_list_parent.is( ':hidden' ) ) {
                        $tweet_list_parent.show();
                        $base_container.addClass( VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS );
                    }
                    else {
                        $base_container.find( '.current' ).removeClass( 'current' );
                        reset_buttons( $base_container.find( '.' + OPEN_VICINITY_TWEETS_BUTTON_CLASS + '[data-status="opened"]' ) );
                        $tweet_list_parent.hide();
                        $base_container.removeClass( VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS );
                    }
                } );
                
                $tweet_list_parent.css( 'background', getComputedStyle( d.body ).backgroundColor );
                
                $tweet_list_parent.show();
                $base_container.after( $tweet_list_parent );
                
                return $tweet_list_parent;
            },
            
            set_tweet_list_event = () => {
                var $retweeted_tweet = $tweet_list_container.find( '.target' ),
                    $retweeted_tweet_body = $retweeted_tweet.find( '.tweet-body' );
                
                 $tweet_list_container.find( 'a' ).off( 'click' ).on( 'click', ( event ) => {
                    event.stopPropagation();
                } );
                
                $tweet_list_container.off( 'click' ).on( 'click', ( event ) => {
                    event.stopPropagation();
                } );
                
                $retweeted_tweet.children( '.tweet-info, .tweet-mark, .tweet-timestamp' ).off( 'click' ).on( 'click', ( event ) => {
                    event.stopPropagation();
                    event.preventDefault();
                    
                    if ( $retweeted_tweet_body.is( ':hidden' ) ) {
                        $retweeted_tweet_body.nextAll().addBack().show();
                    }
                    else {
                        $retweeted_tweet_body.nextAll().addBack().hide();
                    }
                } );
            },
            
            open_tweets = () => {
                if ( is_loaded ) {
                    onload();
                    return;
                }
                
                var retweeted_tweet_info,
                    rt_info;
                
                try {
                    retweeted_tweet_info = get_stored_tweet_info( retweeted_tweet_id );
                    rt_info = retweeted_tweet_info.rt_info_map.screen_name_map[ act_screen_name ];
                }
                catch ( error ) {
                    log_error( 'open_tweets() error', error );
                    return;
                }
                
                var $retweeted_tweet = create_tweet_container( retweeted_tweet_info, rt_info ).addClass( 'target' ).css( {
                        //'cursor' : 'pointer',
                    } ),
                    $retweeted_tweet_body = $retweeted_tweet.find( '.tweet-body' );
                
                $retweeted_tweet_body.prevAll().css( {
                    'cursor' : 'pointer',
                } );
                $retweeted_tweet_body.nextAll().addBack().hide();
                
                $tweet_list_container = $( '<ul/>' )
                    .addClass( VICINITY_TWEET_LIST_CLASS )
                    .append( $retweeted_tweet )
                    .hide();
                
                var timestamp_ms = rt_info.timestamp_ms,
                    max_timestamp_ms = timestamp_ms + 1000 * 60 * get_max_after_retweet_minutes(),
                    min_timestamp_ms = timestamp_ms - 1000 * 60 * get_max_before_retweet_minutes(),
                    user_timeline = object_extender( TemplateUserTimeline ).init( {
                        screen_name : act_screen_name,
                        max_timestamp_ms : max_timestamp_ms,
                    } ),
                    
                    recursive_call = () => {
                        user_timeline.fetch_tweet_info()
                        .then( ( tweet_info ) => {
                            if ( ! tweet_info ) {
                                onload( true );
                                return;
                            }
                            
                            if ( tweet_info.timestamp_ms < min_timestamp_ms ) {
                                onload( true );
                                return;
                            }
                            
                            add_tweet_to_list( tweet_info, rt_info, $retweeted_tweet );
                            
                            recursive_call();
                        } )
                        .catch( ( error ) => {
                            log_error( 'error:', error );
                            alert( 'could not fetch tweets' );
                            onerror();
                        } );
                    };
                
                recursive_call();
                
                $button_container.addClass( 'loading' );
                $button.html( LOADING_ICON_SVG );
                $button.attr( {
                    'title' : OPTIONS.LOADING_TEXT,
                    'data-status' : 'loading',
                } );
            },
            
            close_tweets = () => {
                var $region = $button_container.parents( 'section[role="region"]:first' ),
                    $base_container = $region.parents().eq( 2 ).addClass( VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS ),
                    $tweet_list_parent = $base_container.nextAll( '.' + VICINITY_TWEET_LIST_PARENT_CLASS );
                
                $tweet_list_parent.click();
                
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked = false;
            },
            
            onload = ( is_first_time ) => {
                var $tweet_list_parent = get_tweet_list_parent(),
                    $base_container = $tweet_list_parent.prev();
                
                $button_container.removeClass( 'loading' );
                $base_container.find( '.current' ).removeClass( 'current' );
                reset_buttons( $base_container.find( '.' + OPEN_VICINITY_TWEETS_BUTTON_CLASS + '[data-status="opened"]' ) );
                
                $button_container.addClass( 'current' );
                $button.attr( {
                    'title' : OPTIONS.REFERENCE_TO_RETWEET_CLOSE_BUTTON_TITLE,
                    'data-status' : 'opened',
                } ).html( CLOSE_ICON_SVG );
                
                $tweet_list_container.children( 'li:first' ).addClass( 'first' );
                $tweet_list_parent.empty().append( $tweet_list_container );
                set_tweet_list_event();
                $tweet_list_container.show();
                
                setTimeout( () => {
                    // 元ツイートが見える位置までスクロール
                    //$tweet_list_container.find( '.target' ).get( 0 ).scrollIntoView( false ); // TODO: うまくいかないケースあり
                    var adjusted_top = $tweet_list_parent.scrollTop() + $tweet_list_container.find( '.target' ).offset().top - $tweet_list_parent.offset().top - $tweet_list_parent.height() * 2 / 3;
                    
                    $tweet_list_parent.scrollTop( adjusted_top );
                }, 1 );
                
                is_loaded = true;
                
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked = false;
            },
            
            onerror = () => {
                $tweet_list_container.hide();
                $button_container.removeClass( 'loading' );
                reset_buttons( $button, OPTIONS.REFERENCE_TO_RETWEET_LOAD_BUTTON_TITLE );
                
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked = false;
            };
        
        $button.on( 'click', ( event ) => {
            event.stopPropagation();
            event.preventDefault();
            
            //$button_container.parents( 'div[data-testid="UserCell"]:first' ).focus();
            $button_container.parents( '[data-focusable="true"]' ).first().focus();
            
            if ( CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked ) {
                return;
            }
            
            CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked = true;
            
            switch ( $button.attr( 'data-status' ) ) {
                case 'closed' :
                    open_tweets();
                    break;
                
                case 'opened' :
                    close_tweets();
                    break;
                
                default :
                    CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked = false;
                    return;
            }
        } );
        
        $button.on( 'reset_button', ( event ) => {
            if ( $button.attr( 'data-status' ) == 'opened' ) {
                reset_buttons( $button );
            }
        } );
        
        return $button_container;
    };
} )(); // end of create_open_vicinity_tweets_button()


function add_vicinity_link_to_tweet( $tweet ) {
    //var tweet_url = $tweet.find( 'a[role="link"][href^="/"][href*="/status/"]:has(time):first' ).attr( 'href' ),
    var tweet_url = $tweet.find( 'a[role="link"][href^="/"][href*="/status/"]' ).filter( function () {return ( 0 < $( this ).find( 'time' ).length );} ).first().attr( 'href' ),
        tweet_url_info = parse_individual_tweet_url( tweet_url ),
        $tweet_time,
        $tweet_caret,
        $action_list,
        tweet_id,
        screen_name,
        timestamp_ms,
        is_individual_tweet;
    
    if ( ! tweet_url_info ) {
        return false;
    }
    
    tweet_url = tweet_url_info.tweet_url;
    tweet_id = tweet_url_info.tweet_id;
    screen_name = tweet_url_info.screen_name;
    
    $tweet_time = $tweet.find( 'a[role="link"] time[datetime]:first' );
    
    is_individual_tweet = ( $tweet_time.length <= 0 );
    
    $tweet_caret = $tweet.find( '[data-testid="tweet"] [role="button"][data-testid="caret"]:first' );
    /*
    //$action_list = $tweet.find( 'div[dir="auto"]:has(>a[role="link"][href*="/help.twitter.com/"])' );
    //if ( $action_list.length <= 0 ) {
    //    $action_list = $tweet.find( 'div[role="group"]' );
    //}
    */
    $action_list = $tweet.find( 'div[role="group"]' );
    
    if ( is_individual_tweet ) {
        // TODO: 個別ツイートの場合、日付が取得しがたい（多国語対応のため）→ツイートIDから取得しているが、2010年11月以前は未対応
        try {
            timestamp_ms = tweet_id_to_date( tweet_id ).getTime();
        }
        catch ( error ) {
            timestamp_ms = '';
        }
    }
    else {
        timestamp_ms = new Date( $tweet_time.attr( 'datetime' ) ).getTime();
    }
    
    var $link_container = create_vicinity_link_container( {
            tweet_url : tweet_url,
            attributes : {
                'data-timestamp_ms' : timestamp_ms
            }
        } ),
        $link = $link_container.find( 'a:first' ),
        $link_container_bottom = $link_container.clone( true ),
        $link_bottom = $link_container_bottom.find( 'a:first' );
    
    if ( ! timestamp_ms ) {
        //$link_container.hide();
    }
    
    if ( is_individual_tweet ) {
        // 個別ツイートへの追加
        
        // - 上部
        if ( $tweet_caret.prevAll( '.' + VICINITY_LINK_CONTAINER_CLASS ).length < 1 ) {
            $link_container.addClass( 'large' ).css( {
            } );
            $link.css( {
                'margin-right' : '32px'
            } );
            $tweet_caret.before( $link_container );
        }
        
        // - 下部
        if ( $action_list.find( '.' + VICINITY_LINK_CONTAINER_CLASS ).length < 1 ) {
            $link_container_bottom.addClass( 'middle' ).css( {
                //'float' : 'left'
            } );
            $link_bottom.css( {
                'margin-top' : '16px',
                //'margin-right' : '16px'
                'margin-right' : '8px'
            } );
            $action_list.append( $link_container_bottom );
        }
    }
    else {
        // タイムライン上ツイートへの追加
        
        // - 上部
        if ( $tweet_time.parent().nextAll( '.' + VICINITY_LINK_CONTAINER_CLASS ).length < 1 ) {
            $link_container.addClass( 'middle' ).css( {
            } );
            $link.css( {
                'margin-right' : '32px'
            } );
            $tweet_time.parent().after( $link_container );
        }
    }
    
    var $retweeter_link = get_retweeter_link( $tweet ),
        act_screen_name;
    
    if ( 0 < $retweeter_link.length ) {
        var $retweeter_link_neighbor = get_retweet_icon( $retweeter_link );
        
        if ( $retweeter_link_neighbor.nextAll( '.' + VICINITY_LINK_CONTAINER_CLASS ).length < 1 ) {
            act_screen_name = ( $retweeter_link.attr( 'href' ) || '' ).replace( /^\//, '' );
            
            if ( act_screen_name ) {
                $link_container = create_vicinity_link_container( {
                    tweet_url : tweet_url,
                    act_screen_name : act_screen_name,
                    attributes : {
                        'data-event_element' : 'user_retweeted_on_timeline',
                        'data-timestamp_ms' : timestamp_ms,
                    }
                } );
                
                $link = $link_container.find( 'a:first' );
                
                $link_container.addClass( 'middle' ).css( {
                    'position' : 'absolute',
                    'top' : '0',
                    'left' : '-4px',
                } );
                
                $link.css( {
                    'margin-right' : '32px'
                } );
                
                //$retweeter_link.parents( 'div:has(>div>svg):first' ).find( 'div:has(>svg)' ).append( $link_container );
                /*
                //$retweeter_link.parents().each( function () {
                //    var $svg = $( this ).find( 'svg' );
                //    
                //    if ( $svg.length <= 0 ) {
                //        return;
                //    }
                //    $svg.parent().append( $link_container );
                //    return false;
                //} );
                */
                $retweeter_link_neighbor.after( $link_container );
                $link_container.parent().css( {
                    'flex-basis' : '46px',
                } );
            }
        }
    }
    
    var $retweet_button_neighbor = $action_list.find( 'div[data-testid="retweet"],div[data-testid="unretweet"]' ).parent();
    
    if ( $retweet_button_neighbor.nextAll( '.' + RECENT_RETWEETS_BUTTON_CLASS ).length < 1 ) {
        var $recent_retweet_users_button_container = create_recent_retweet_users_button( tweet_id ),
            $recent_retweet_users_button = $recent_retweet_users_button_container.find( 'button:first' );
        
        if ( is_individual_tweet ) {
            $recent_retweet_users_button.css( {
                'margin-top' : '14px',
            } );
        }
        $retweet_button_neighbor.after( $recent_retweet_users_button_container );
    }
    return true;
} // end of add_vicinity_link_to_tweet()


function check_help_dialog() {
    if ( ! /^\/i\/keyboard_shortcuts/.test( new URL( location.href ).pathname ) ) {
        return false;
    }
    
    /*
    //var $modal_header_h2_list = $( '[aria-labelledby="modal-header"] h2[role="heading"][aria-level="2"]:not(#modal-header)' );
    //
    //if ( $modal_header_h2_list.length < 1 ) {
    //    return false;
    //}
    //
    //var $shortcut_parent = $modal_header_h2_list.last().parents().eq( 1 );
    */
    var $shortcut_parent = $( '[aria-labelledby="modal-header"] ul[role="list"]' ).last();
    
    if ( 0 < $shortcut_parent.find( '.' + SCRIPT_NAME + '_key_help' ).length ) {
        return false;
    }
    
    //var $shortcut_list = $shortcut_parent.children( 'div' );
    var $shortcut_list = $shortcut_parent.children( 'li[role="listitem"]' );

    if ( $shortcut_list.length < 1 ) {
        return false;
    }
    
    var key_info_list = [
            { label : OPTIONS.LINK_TITLE, key : OPTIONS.HELP_OPEN_LINK_KEYCHAR  },
            { label : OPTIONS.ACT_LINK_TITLE, key : OPTIONS.HELP_OPEN_ACT_LINK_KEYCHAR },
            { label : OPTIONS.HELP_OPEN_RERT_DIALOG_LABEL, key : OPTIONS.HELP_OPEN_RERT_DIALOG_KEYCHAR }
        ];
    
    key_info_list.forEach( function ( key_info ) {
        var $shortcut_container = $shortcut_list.last().clone( true ),
            $shortcut_label = $shortcut_container.children().first(),
            $shortcut_content_container = $shortcut_container.children().last(),
            $shortcut_key = $shortcut_content_container.children().first();
        
        $shortcut_container.addClass( SCRIPT_NAME + '_key_help' );
        
        $shortcut_container.attr( {
            'aria-label': key_info.label + ': ' + key_info.key.toUpperCase(),
        } );
        
        $shortcut_content_container.empty();
        $shortcut_content_container.append( $shortcut_key );
        
        $shortcut_label.empty();
        $shortcut_key.empty();
        
        $shortcut_label.append( key_info.label );
        $shortcut_key.append( key_info.key.toUpperCase() );
        
        $shortcut_parent.append( $shortcut_container );
    } );
} // end of check_help_dialog()


function check_user_timeline_end() {
    var to_past_link_id = SCRIPT_NAME + '-to-past-timeline',
        $to_past_link = $( '#' + to_past_link_id );
    
    if ( ! get_page_path_info().user_timeline ) {
        // ユーザータイムライン以外は無効
        $to_past_link.hide();
        return;
    }
    
    var $last_tweet = $( 'div[data-testid="primaryColumn"] section[role="region"] article[role="article"]' ).last(),
        $end_mark = $last_tweet.parents().eq( 1 ).nextAll(),
        past_link_visible = false;
    
    ( () => {
        if ( $end_mark.length <= 0 ) {
            return;
        }
        
        if ( ( $( w ).scrollTop() + $( w ).height() ) < $end_mark.offset().top ) {
            return;
        }
        
        if ( 0 < $end_mark.find( 'h2[role="heading"]' ).length ) {
            // 現在画面上にある最後のツイートの後におすすめユーザー等が表示されている場合
            return;
        }
        
        if ( 0 < $end_mark.find( 'svg' ).length ) {
            // 読み込み中アイコン表示中
            setTimeout ( () => {
                check_user_timeline_end();
            }, 100 );
            
            return;
        }
        
        /*
        //if ( $end_mark.find( '.r-1omma8c' ).length <= 0 ) {
        //    return;
        //}
        */
        
        var tweet_url_info = parse_individual_tweet_url( $last_tweet.find( 'time' ).parents( 'a[role="link"]' ).first().attr( 'href' ) );
        
        if ( ! tweet_url_info ) {
            return;
        }
        
        var tweet_id = tweet_url_info.tweet_id,
            reacted_tweet_info = get_stored_tweet_info( tweet_id );
        
        if ( ! reacted_tweet_info ) {
            return;
        }
        
        var retweeter_screen_name = get_retweeter_screen_name( $last_tweet ),
            reacted_info = ( retweeter_screen_name ) ? ( reacted_tweet_info.rt_info_map.screen_name_map[ retweeter_screen_name ] || reacted_tweet_info ) : reacted_tweet_info,
            max_id = new Decimal( reacted_info.id ).sub( 1 ).toString(),
            screen_name = reacted_info.screen_name,
            query = 'from:' + screen_name + ' max_id:' + max_id + ' include:retweets include:nativeretweets',
            search_url = '/search?src=typed_query&f=live&q=' + encodeURIComponent( query ),
            $container = $( 'header[role="banner"] nav[role="navigation"]:first' ).parents().eq( 1 );
        
        if ( $to_past_link.length <= 0 ) {
            $to_past_link = $( '<a/>' ).addClass( TO_PAST_TIMELINE_CLASS ).text( OPTIONS.GO_TO_PAST_TEXT ).attr( {
                'id' : to_past_link_id,
                'target' : '_blank',
            } ).hide();
            
            $container.append( $to_past_link );
        }
        else {
            if ( 0 < $to_past_link.next().length ) {
                $container.append( $to_past_link );
            }
        }
        
        $to_past_link.attr( {
            'href' : search_url,
        } );
        
        past_link_visible = true;
    } )();
    
    if ( past_link_visible ) {
        $to_past_link.show();
    }
    else {
        $to_past_link.hide();
    }
} // end of check_user_timeline_end()


function check_timeline_tweets() {
    // ツイートに近傍検索ボタン挿入
    //var $tweets = $( 'div[data-testid="primaryColumn"] article[role="article"]:has(div[data-testid="tweet"]):not(:has(.' + VICINITY_LINK_CONTAINER_CLASS + '))' ),
    var $tweets = $( 'div[data-testid="primaryColumn"] article[role="article"]' ).filter( function () {
            var $tweet = $( this ),
                is_individual_tweet = ( $tweet.find( 'a[role="link"] time[datetime]:first' ).length <= 0 );
            
            return ( ( 0 < $tweet.find( 'div[data-testid="tweet"]' ).length ) && ( $tweet.find( '.' + VICINITY_LINK_CONTAINER_CLASS + ':not(.' + ACT_CONTAINER_CLASS + ')' ).length <= ( is_individual_tweet ? 1 : 0 ) ) );
        } ),
        tweet_url_info = parse_individual_tweet_url() || {};
    
    $tweets = $tweets.filter( function ( index ) {
        var $tweet = $( this );
        
        return add_vicinity_link_to_tweet( $tweet );
    } );
    
    // リツイートしたユーザー一覧に近傍検索ボタン挿入
    ( () => {
        if ( ! is_tweet_retweeters_url() ) {
            return;
        }
        
        var reacted_tweet_info = get_stored_tweet_info( tweet_url_info.tweet_id ),
            //$users = ( reacted_tweet_info ) ? $( 'div[aria-labelledby="modal-header"] section[role="region"] div[data-testid="UserCell"]' ).filter( ':not(:has(.' + VICINITY_LINK_CONTAINER_CLASS + '))' ) : $(),
            //$users = ( reacted_tweet_info ) ? $( 'section[role="region"] div[data-testid="UserCell"]' ).filter( ':not(:has(.' + VICINITY_LINK_CONTAINER_CLASS + '))' ) : $(),
            $users = ( reacted_tweet_info ) ? $( 'section[role="region"] div[data-testid="UserCell"]' ).filter( function () {return ( $( this ).find( '.' + VICINITY_LINK_CONTAINER_CLASS ).length <= 0 );} ) : $(),
            background_color = getComputedStyle( d.body ).backgroundColor;
        
        log_debug( 'check_timeline_tweets():', $users.length, 'retweeters found', reacted_tweet_info );
        
        $users.each( function ( index ) {
            var $user = $( this ),
                //$profile_image_link = $user.find( 'a[role="link"]:has(img[src*="profile_images/"]):first' ),
                $profile_image_link = $user.find( 'a[role="link"]' ).filter( function () {return ( 0 < $( this ).find( 'img[src*="profile_images/"]' ).length );} ).first(),
                // 設定時例  : https://pbs.twimg.com/profile_images/<user-id>/<icon-image-name>
                // 未設定時例: https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png
                act_screen_name = ( $profile_image_link.attr( 'href' ) || '' ).replace( /^\//, '' );

            if ( ! act_screen_name ) {
                return;
            }
            
            var rt_info = reacted_tweet_info.rt_info_map.screen_name_map[ act_screen_name ],
                tweet_url = location.href.replace( /\/retweets[\/]?[^\/]*$/, '' ),
                $link_container,
                $link,
                $open_button_container,
                $open_button;
            
            if ( ! rt_info ) {
                return;
            }
            
            $link_container = create_vicinity_link_container( {
                tweet_url : tweet_url,
                act_screen_name : act_screen_name,
                attributes : {
                    'data-event_element' : 'user_retweeted_tweet',
                    'data-timestamp_ms' : 1 * rt_info.timestamp_ms,
                },
            } );
            
            $link = $link_container.find( 'a:first' ).css( {
                'padding' : '2px 4px',
                //'background-color' : is_night_mode() ? '#15202B' : '#FFFFFF',
                'background-color' : background_color,
                'border-radius' : '12px',
            } );
            
            $link_container.addClass( 'large' ).css( {
                'position' : 'absolute',
                'top' : '0',
                'right' : '140px',
                'z-index' : 100,
            } );
            
            $open_button_container = create_open_vicinity_tweets_button( {
                tweet_url : tweet_url,
                act_screen_name : act_screen_name,
            } );
            
            $open_button = $open_button_container.find( 'a:first' ).css( {
                'padding' : '2px 4px',
                'background-color' : background_color,
                'border-radius' : '12px',
            } );
            
            $open_button_container.addClass( 'large' ).css( {
                'position' : 'absolute',
                'top' : '0',
                'right' : '188px',
                'z-index' : 100,
            } );
            
            //$user.find( 'a[role="link"]:has(span>span):first' ).parent().after( $link_container );
            $user.find( 'a[role="link"]' ).filter( function () {return ( 0 < $( this ).find( 'span>span' ).length );} ).first().parent().after( $link_container );
            $link_container.before( $open_button_container );
            
            CURRENT_REFERENCE_TO_RETWEETERS_INFO.$open_button_containers.push( $open_button_container );
        } );
    } )();
    
    // リツイート数が表示されたときに[Re:RT]ボタンも表示
    if ( OPTIONS.ENABLE_RECENT_RETWEET_USERS_BUTTON ) {
        var $recent_retweet_users_button_containers = $( 'div[data-testid="primaryColumn"] article[role="article"] .' + RECENT_RETWEETS_BUTTON_CLASS + ':hidden' );
        
        $recent_retweet_users_button_containers.each( function () {
            var $recent_retweet_users_button_container = $( this ),
                $recent_retweet_users_button = $recent_retweet_users_button_container.find( 'button:first' ),
                $ancestor = $recent_retweet_users_button_container.parents( 'article[role="article"]:first' ),
                retweet_number;
            
            if ( tweet_url_info.tweet_id == $recent_retweet_users_button.attr( 'data-tweet-id' ) ) {
                retweet_number = parseInt( $ancestor.find( 'a[href$="/retweets"], a[href$="/retweets/with_comments"]' ).find( 'span>span' ).text(), 10 );
                if ( ( tweet_url_info.tweet_id == CURRENT_REFERENCE_TO_RETWEETERS_INFO.tweet_id ) && ( CURRENT_REFERENCE_TO_RETWEETERS_INFO.status == 'wait_dialog' ) ) {
                    $recent_retweet_users_button.click();
                }
            }
            else {
                retweet_number = parseInt( $ancestor.find( 'div[data-testid="retweet"] span>span, div[data-testid="unretweet"] span>span' ).text() );
            }
            
            if ( ! isNaN( retweet_number ) ) {
                $recent_retweet_users_button_container.show();
            }
        } );
    }
    // [Re:RT]押下後のダイアログ表示状態遷移判定
    switch ( CURRENT_REFERENCE_TO_RETWEETERS_INFO.status ) {
        case 'wait_dialog' :
            if ( 0 <= location.href.indexOf( '/' + CURRENT_REFERENCE_TO_RETWEETERS_INFO.tweet_id + '/retweets' ) ) {
                // TODO: 最初に「コメント付き」を開く→自動的に「コメントなし」タブを開いたほうがよいか？
                // →保留中
                /*
                //if ( 0 <= location.href.indexOf( '/' + CURRENT_REFERENCE_TO_RETWEETERS_INFO.tweet_id + '/retweets/with_comments' ) ) {
                //    ( ( $without_comments_link ) => {
                //        if ( 0 < $without_comments_link.length ) {
                //            $without_comments_link.get( 0 ).click( 0 );// 「コメントなし」タブのクリック
                //        }
                //    } )( $( 'div[data-testid="primaryColumn"] a[role="tab"][href$="/without_comments"]' ) );
                //    break;
                //}
                */
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.status = 'dialog_displayed';
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.load_button_is_locked = false;
            }
            break;
        
        case 'dialog_displayed' :
            if ( location.href.indexOf( '/' + CURRENT_REFERENCE_TO_RETWEETERS_INFO.tweet_id + '/retweets' ) < 0 ) {
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.$open_button_containers.forEach( ( $open_button_container ) => {
                    $open_button_container.find( 'a:first' ).trigger( 'reset_button' );
                } );
                
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.$open_button_containers = [];
                
                CURRENT_REFERENCE_TO_RETWEETERS_INFO.status = 'idle';
                
                if ( location.href != CURRENT_REFERENCE_TO_RETWEETERS_INFO.url_to_return ) {
                    //$( 'div[data-testid="primaryColumn"] div[role="button"][aria-label="Back"]:first' ).get( 0 ).click(); // TODO: ←によって戻ると、なぜか履歴がおかしくなる
                    log_debug( 'history.back()' );
                    history.back();
                }
            }
            break;
    }
    
    if ( ! /\/\d+\/retweets(?:\/with(?:out)?_comments)?\/?/.test( location.href ) ) {
        // 前後ツイートが main[role="main"] 下に付くケースの後始末
        remove_vicinity_tweet_list();
    }
    
    check_help_dialog();
    
    return ( 0 < $tweets.length );
} // end of check_timeline_tweets()


var search_vicinity_tweet = ( () => {
    if ( ! is_search_mode() ) {
        return () => {};
    }
    
    var marked_class = SCRIPT_NAME + '_marked',
        reacted_tweet_info = SEARCH_PARAMETERS.reacted_tweet_info,
        target_info = SEARCH_PARAMETERS.target_info,
        is_user_timeline = SEARCH_PARAMETERS.use_user_timeline,
        is_retweeted_event = is_retweeted_event_element( SEARCH_PARAMETERS.event_element ),
        
        threshold_timestamp_ms = ( () => {
            var threshold_timestamp_ms = target_info.timestamp_ms;
            
            if ( ( ! target_info.id ) && is_retweeted_event && is_user_timeline ) {
                // TODO:リツイートやいいね等は、実際にアクションを起こしてから通知されるまで遅延がある
                // →リツイート通知かつユーザータイムライン上での検索であれば、対象ツイート（reacted_tweet_info.id）を含んでいる可能性が高いため、通知時刻の一定時間前までを許容（ただし、ツイート時間以降）
                threshold_timestamp_ms = Math.max( target_info.timestamp_ms - RETWEET_SEARCH_OFFSET_SEC * 1000, reacted_tweet_info.timestamp_ms );
            }
            return threshold_timestamp_ms;
        } )(),
        
        search_status = 'initialize', // 'initialize', 'wait_ready', 'search', 'found', 'error'
        tweet_found_counter = 0,
        stop_scrolling_request = false,
        
        $primary_column = $(),
        $timeline = $(),
        $found_tweet_container = $(),
        
        search_tweet_properties = {
            is_itself : true,
            tweet_url : ( target_info.tweet_url || '' ).replace( /^https?:\/\/[^\/]+/, '' ).replace( /(\/status(?:es)?\/\d+).*$/, '$1' ),
            retweeter_screen_name : ( is_retweeted_event ) ? SEARCH_PARAMETERS.act_screen_name : '',
        },
        
        found_tweet_properties = {},
        
        scroll_to = ( () => {
            var ua = w.navigator.userAgent.toLowerCase(),
                animate_target_selector = ( ( ( ! w.chrome ) && ua.indexOf( 'webkit' ) != -1 ) || ( ua.indexOf( 'opr' ) != -1 ) || ( ua.indexOf( 'edge' ) != -1 ) ) ? 'body,html' : 'html',
                // [Javascript Chromeでページトップに戻る(scrollTop)が効かなくなってた件。 - かもメモ](http://chaika.hatenablog.com/entry/2017/09/22/090000)
                // ※ 2017/10現在 ($.fn.jquery = 3.1.1)
                //   'html' ← Firefox, Chrome, Vivaldi, IE
                //   'body' ← Safari, Opera, Edge
                animate_speed = 'fast'; //  'slow', 'normal', 'fast' またはミリ秒単位の数値
            
            return ( top_scroll_top, smooth ) => {
                if ( smooth ) {
                    $( animate_target_selector ).animate( {
                        scrollTop : top_scroll_top,
                    }, animate_speed );
                }
                else {
                    $( w ).scrollTop( top_scroll_top );
                }
            };
        } )(),
        
        is_search_result_empty = () => {
            // 検索タイムラインにて、「結果なし」「検索結果と一致するものはありません。」が存在する場合に真
            return  ( ( ! is_user_timeline ) && ( $primary_column.find( '> div > div' ).last().find( '> div > div > div > div[dir="auto"]' ).length == 2 ) );
        },
        
        [ 
            hide_primary_column,
            show_primary_column,
            hide_sidebar,
            show_sidebar,
        ] = ( () => {
            var hide_primary_column_style_id = SCRIPT_NAME + '-search_style-hide_primary_column',
                hide_sidebar_style_id = SCRIPT_NAME + '-search_style-hide_sidebar',
                
                hide_primary_column = () => {
                    //$primary_column.css( 'visibility', 'hidden' );
                    $( '#' + hide_primary_column_style_id ).remove();
                    insert_css( [
                        [
                            'div[data-testid="primaryColumn"] > div > div > div > div[dir="auto"]', // 「問題が発生しました。」
                            'div[data-testid="primaryColumn"] > div > div > div > div[role="button"]', // [再度お試しください]
                        ].join( ',' ),
                        '{visibility: hidden;}',
                    ].join( '\n' ), hide_primary_column_style_id);
                }, // end of hide_primary_column()
                
                show_primary_column = () => {
                    //$primary_column.css( 'visibility', 'visible' );
                    $( '#' + hide_primary_column_style_id ).remove();
                }, // end of show_primary_column()
                
                hide_sidebar = () => {
                    $( '#' + hide_sidebar_style_id ).remove();
                    
                    insert_css( [
                        //'div[data-testid="sidebarColumn"] {display: none;}',
                        'div[data-testid="sidebarColumn"] {visibility: hidden;}',
                    ].join( '\n' ), hide_sidebar_style_id );
                }, // end of hide_sidebar()
                
                show_sidebar = () => {
                    $( '#' + hide_sidebar_style_id ).remove();
                    /*
                    //insert_css( [
                    //    //'div[data-testid="sidebarColumn"] {display: flex;}',
                    //    'div[data-testid="sidebarColumn"] {visibility: visible;}',
                    //].join( '\n' ), hide_sidebar_style_id );
                    */
                    show_primary_column();
                }; // end of show_sidebar()
            
            return [
                hide_primary_column,
                show_primary_column,
                hide_sidebar,
                show_sidebar,
            ];
        } )(),
        
        [
            create_navigation,
            remove_navigation,
        ] = ( () => {
            var $navigation_container = $(),
                x_mark_svg_inner = '<g><path d="M13.414 12l5.793-5.793c.39-.39.39-1.023 0-1.414s-1.023-.39-1.414 0L12 10.586 6.207 4.793c-.39-.39-1.023-.39-1.414 0s-.39 1.023 0 1.414L10.586 12l-5.793 5.793c-.39.39-.39 1.023 0 1.414.195.195.45.293.707.293s.512-.098.707-.293L12 13.414l5.793 5.793c.195.195.45.293.707.293s.512-.098.707-.293c.39-.39.39-1.023 0-1.414L13.414 12z"></path></g>', // ×印
                
                create_navigation = () => {
                    var button_color = ( is_night_mode() ) ? 'pink' : 'red',
                        hover_class = 'r-zv2cs0',
                        $source_navigation = $( 'header[role="banner"] nav[role="navigation"]:first' ),
                        $source_navigation_container = $source_navigation.parent(),
                        $destination_button = $source_navigation.children( 'a[role="link"]' ).eq( 1 ).clone( true ),
                        $destination_navigation_container = $source_navigation_container.clone( true ),
                        $destination_navigation = $destination_navigation_container.children( 'nav' ).empty().attr( {
                            'aria-label' : SCRIPT_NAME + '-menu',
                        } ),
                        $destination_close_icon = $destination_button.find( 'svg' ).html( x_mark_svg_inner ).css( {
                            color : button_color,
                        } );
                    
                    $navigation_container.remove();
                    $navigation_container = $destination_navigation_container;
                    
                    $destination_button.children( 'div' ).on( {
                        'mouseenter' : function ( event ) {
                            $( this ).addClass( hover_class );
                        },
                        'mouseleave' : function ( event ) {
                            $( this ).removeClass( hover_class );
                        },
                    } );
                    
                    $destination_button.find( 'span' )
                    .text( OPTIONS.STOP_SCROLLING_BUTTON_TEXT )
                    .css( {
                        color : button_color,
                    } );
                    
                    $destination_button.attr( {
                        'href' : location.href,
                        'data-testid' : SCRIPT_NAME + '-stop-scrolling-button',
                        'aria-label' : OPTIONS.STOP_SCROLLING_BUTTON_TEXT,
                    } ).on( 'click', function ( event ) {
                        event.stopPropagation();
                        event.preventDefault();
                        
                        remove_navigation();
                        
                        stop_scrolling_request = true;
                        log_info( '[stop searching] canceled by user operation: search_status=', search_status );
                    } );
                    
                    $destination_navigation.append( $destination_button );
                    
                    $source_navigation_container.next( 'div' ).after( $navigation_container );
                    
                    return $navigation_container;
                }, // create_navigation()
                
                remove_navigation = () => {
                    log_debug( 'remove_navigation()' );
                    
                    show_sidebar();
                    
                    $navigation_container.remove();
                }; // end of remove_navigation()
                
            return [
                create_navigation,
                remove_navigation,
            ];
        } )(),
        
        [ 
            start_giveup_handler,
            stop_giveup_handler,
        ] = ( () => {
            var giveup_timerid = null,
                start_giveup_handler = () => {
                giveup_timerid = ( ( previous_last_tweet_url ) => {
                    return setInterval( () => {
                        if ( stop_scrolling_request ) {
                            stop_giveup_handler();
                            return;
                        }
                        //var current_last_tweet_url = $timeline.find( 'article[role="article"] a[role="link"]:has(time[datetime]):last' ).attr( 'href' );
                        var current_last_tweet_url = $timeline.find( 'article[role="article"] a[role="link"]' ).filter( function () {
                                return ( 0 < $( this ).find( 'time' ).length );
                            } ).last().attr( 'href' );
                        
                        if ( ( ! is_search_mode() ) || ( current_last_tweet_url == previous_last_tweet_url ) ) {
                            // 読み込まれたタイムラインの最後のツイートにいつまでも変化が無ければ諦める
                            // TODO: 検索にかからなかった場合（「結果なし」「検索結果と一致するものはありません。」）の判定が困難（多国語対応のため）
                            // → $timeline がいつまでも空のはずなので、タイムアウトでチェックする
                            stop_giveup_handler();
                            stop_cancel_handler();
                            
                            log_error( '[give up scrolling] search_status:', search_status, '=> error' );
                            search_status = 'error';
                            return;
                        }
                        previous_last_tweet_url = current_last_tweet_url;
                    }, 1000 * WAIT_BEFORE_GIVEUP_SCROLL_SEC );
                } )();
                }, // end of start_giveup_handler()
                
                stop_giveup_handler = () => {
                    log_debug( 'stop_giveup_handler()' );
                    
                    if ( giveup_timerid ) {
                        clearInterval( giveup_timerid );
                        giveup_timerid = null;
                    }
                }; // end of stop_giveup_handler()
            
            return [
                start_giveup_handler,
                stop_giveup_handler,
            ];
        } )(),
        
        [
            start_cancel_handler,
            stop_cancel_handler,
        ] = ( () => {
            var start_cancel_handler = () => {
                    create_navigation();
                }, // end of start_cancel_handler()
                
                stop_cancel_handler = () => {
                    log_debug( 'stop_cancel_handler()' );
                    
                    remove_navigation();
                }; // end of stop_cancel_handler()
            
            return [
                start_cancel_handler,
                stop_cancel_handler,
            ];
        } )(),
        
        
        search_tweet = ( () => {
            var last_tweet_id,
                last_target_id;
            
            return () => {
                var is_itself = false,
                    $found_tweet = $(),
                    
                    /*
                    //$tweet_links = $timeline.find(
                    //    //'div:not(.' + marked_class + ') > article[role="article"] a[role="link"]:has(time[datetime])'
                    //    //※チェック済みは除いていたが、画面から外れたツイートは除去されるためあまり意味がない→常に全てチェック
                    //    'article[role="article"] a[role="link"]:has(time[datetime])'
                    //).filter( function () {
                    //    return parse_individual_tweet_url( $( this ).attr( 'href' ) );
                    //} ),
                    */
                    $tweet_links = $timeline.find( 'article[role="article"] a[role="link"]' ).filter( function () {
                        //return ( 0 < $( this ).find( 'time[datetime]' ).length );
                        return ( 0 < $( this ).find( 'time' ).length );
                    } ).filter( function () {
                        return parse_individual_tweet_url( $( this ).attr( 'href' ) );
                    } ),
                    
                    $unrecognized_tweet_links = $tweet_links.filter( function () {
                        var tweet_id = parse_individual_tweet_url( $( this ).attr( 'href' ) ).tweet_id,
                            reacted_tweet_info = get_stored_tweet_info( tweet_id );
                        
                        if ( ! reacted_tweet_info ) {
                            log_debug( 'reacted_tweet_info is not found: tweet_id=', tweet_id );
                        }
                        return ( ! reacted_tweet_info );
                    } );
                
                if ( 0 < $unrecognized_tweet_links.length ) {
                    log_debug( 'unrecognized', $unrecognized_tweet_links.length,  'link(s) found:', $unrecognized_tweet_links, 'reacted_tweet_info_map:', get_stored_tweet_info_map() );
                    
                    // TODO: fetch データ取得のタイミングによっては get_stored_tweet_info() でツイート情報が取得できない場合あり
                    // →遅延させて再検索
                    /*
                    //setTimeout( () => {
                    //    search_vicinity_tweet();
                    //}, WAIT_DOM_REFRESH_MS );
                    */
                    
                    //request_observation(); // このパターンの場合、analyze_fetch_data() により更新されるはず
                    
                    return $();
                }
                
                var current_tweet_id,
                    current_target_id,
                    $current_tweet_container = $();
                
                $tweet_links.each( function () {
                    var $tweet_link = $( this ),
                        $tweet = $tweet_link.parents( 'article[role="article"]:first' ),
                        $tweet_container = $tweet.parent().addClass( marked_class ),
                        // ※ article[role="article"] は頻繁に書き換わることがあるため、比較的安定な parent() に class を設定
                        tweet_url_info = parse_individual_tweet_url( $tweet_link.attr( 'href' ) );
                    
                    if ( ! stop_scrolling_request ) {
                        scroll_to( $tweet_link.offset().top - ( $( w ).height() / 2 ) ); // 1 ツイートずつスクロールさせる
                    }
                    
                    if ( ! tweet_url_info ) {
                        return;
                    }
                    
                    $current_tweet_container = $tweet_container;
                    current_tweet_id = tweet_url_info.tweet_id;
                    
                    var current_reacted_tweet_info = get_stored_tweet_info( current_tweet_id ),
                        current_retweeter_screen_name = get_retweeter_screen_name( $tweet ),
                        current_reacted_info = ( current_retweeter_screen_name ) ? ( current_reacted_tweet_info.rt_info_map.screen_name_map[ current_retweeter_screen_name ] || current_reacted_tweet_info ) : current_reacted_tweet_info,
                        current_timestamp_ms = current_reacted_info.timestamp_ms;
                    
                    current_target_id = current_reacted_info.id;
                    
                    if ( target_info.id ) {
                        if ( current_target_id == target_info.id ) {
                            is_itself = true;
                            $found_tweet = $tweet;
                            
                            return false;
                        }
                        
                        if ( bignum_cmp( current_target_id, target_info.id ) < 0 ) {
                            is_itself = false;
                            $found_tweet = $tweet;
                            
                            return false;
                        }
                    }
                    else {
                        if ( current_tweet_id == reacted_tweet_info.id ) {
                            is_itself = true;
                            $found_tweet = $tweet;
                            
                            return false;
                        }
                        
                        if ( current_timestamp_ms <= threshold_timestamp_ms ) {
                            is_itself = false;
                            $found_tweet = $tweet;
                            
                            return false;
                        }
                        
                        if ( reacted_tweet_info.id ) {
                            if ( bignum_cmp( current_target_id, reacted_tweet_info.id ) < 0 ) {
                                is_itself = false;
                                $found_tweet = $tweet;
                                
                                return false;
                            }
                        }
                    }
                } );
                
                if ( $found_tweet.length <= 0 ) {
                    if ( stop_scrolling_request ) {
                        return $();
                    }
                    
                    // TODO: 目的のツイートがあるにもかかわらず、通り過ぎることがあった
                    // →上のループ内で 1 ツイートずつスクロールさせることで改善されることを期待
                    // 見つからなかった場合、強制スクロール
                    
                    log_debug( 'id comparison:', ( ( current_tweet_id == last_tweet_id ) && ( current_target_id == last_target_id ) ) );
                    log_debug( current_tweet_id, 'vs', last_tweet_id, ',', current_target_id, 'vs', last_target_id );
                    
                    if ( ( current_tweet_id == last_tweet_id ) && ( current_target_id == last_target_id ) ) {
                        if ( 0 < $current_tweet_container.length ) {
                            // 前回チェック時と最終ツイートが変わらなければツイートの高さ分スクロールアップ
                            scroll_to( $( w ).scrollTop() + $current_tweet_container.height() );
                        }
                    }
                    
                    last_tweet_id = current_tweet_id;
                    last_target_id = current_target_id;
                    
                    return $();
                }
                
                var $found_tweet_container = $found_tweet.parent().addClass( ( is_itself ) ? TARGET_TWEET_CLASS : VICINITY_TWEET_CLASS );
                    // ※ article[role="article"] は頻繁に書き換わることがあるため、比較的安定な parent() に class を設定
                
                found_tweet_properties = {
                    is_itself : is_itself,
                    //tweet_url : $found_tweet.find( 'a[role="link"]:has(time[datetime])' ).attr( 'href' ),
                    tweet_url : $found_tweet.find( 'a[role="link"]' ).filter( function () {return ( 0 < $( this ).find( 'time' ).length );} ).attr( 'href' ),
                    retweeter_screen_name : get_retweeter_screen_name( $found_tweet ),
                };
                
                //start_adjust_handler();
                
                log_debug( '[target tweet was found] is_self:', is_itself, 'tweet:', $found_tweet, 'contaner:', $found_tweet_container );
                
                return $found_tweet_container;
            };
        } )(), // end of search_tweet()
        
        [
            start_adjust_handler,
            stop_adjust_handler,
        ] = ( () => {
            var adjust_timerid = null,
                adjust_counter,
                adjust_acceptable_number,
                adjust_passed_number,
                
                adjust_scroll = ( $target ) => {
                    var current_scroll_top = $( w ).scrollTop(),
                        //to_scroll_top = $target.offset().top - ( $( w ).height() - $target.height() ) / 2;
                        to_scroll_top = $target.offset().top - ( $( w ).height() / 2 );
                    
                    if ( ( to_scroll_top <= 0 ) || ( Math.abs( to_scroll_top - current_scroll_top ) < 20 ) ) {
                        return true;
                    }
                    
                    scroll_to( to_scroll_top );
                    
                    return false;
                }, // end of adjust_scroll()
                
                start_adjust_handler = () => {
                    adjust_counter = MAX_ADJUST_SCROLL_NUMBER;
                    adjust_acceptable_number = ADJUST_ACCEPTABLE_NUMBER;
                    adjust_passed_number = 0;
                    
                    adjust_timerid = setInterval( () => {
                        // ※タイムラインが表示しきれておらず目的ツイートを真ん中にもってこれなかった場合等のために時間をずらして再度スクロール
                        
                        if ( stop_scrolling_request || ( search_status == 'error' ) ) {
                            stop_adjust_handler();
                            return;
                        }
                        
                        adjust_counter --;
                        
                        try {
                            if ( adjust_scroll( $found_tweet_container ) ) {
                                adjust_passed_number ++;
                            }
                            else {
                                adjust_passed_number = 0;
                            }
                        }
                        catch ( error ) {
                            log_error( 'adjust handler:', error, $found_tweet_container, $found_tweet_container.offset() );
                            stop_adjust_handler();
                            return;
                        }
                        
                        log_debug( 'adjust_passed_number:', adjust_passed_number );
                        
                        if ( ( adjust_acceptable_number <= adjust_passed_number ) || ( adjust_counter <= 0 ) ) {
                            stop_adjust_handler();
                        }
                    }, ADJUST_CHECK_INTERVAL_MS );
                },
                
                stop_adjust_handler = () => {
                    log_debug( 'stop_adjust_handler()' );
                    
                    if ( adjust_timerid ) {
                        clearInterval( adjust_timerid );
                        adjust_timerid = null;
                    }
                    stop_cancel_handler();
                };
            
            return [
                start_adjust_handler,
                stop_adjust_handler,
            ];
        } )(),
        
        update_highlight_tweets = () => {
            // タイムライン上のツイートはスクロールに応じて挿入・削除が繰り返されるため、一度見つけたツイートも任意のタイミングで削除されうる
            // →表示されている中で一致するツイートを見つけて、再度 class を設定することで対処
            
            /*
            //if ( 0 < $found_tweet_container.parents( 'section[role="region"]:first' ).length ) {
            //    return $found_tweet_container;
            //}
            //
            //var $url_matched_tweets = $timeline.find( 'article[role="article"]:has(a[role="link"][href="' + found_tweet_properties.tweet_url + '"] time[datetime])' );
            //
            //$url_matched_tweets.each( function () {
            //    var $tweet = $( this );
            //    
            //    if ( get_retweeter_screen_name( $tweet ) != found_tweet_properties.retweeter_screen_name ) {
            //        return;
            //    }
            //    
            //    $found_tweet_container = $tweet.parent().addClass( ( found_tweet_properties.is_itself ) ? TARGET_TWEET_CLASS : VICINITY_TWEET_CLASS );
            //    return false;
            //} );
            //
            //return $found_tweet_container;
            */
            
            //$timeline = $( 'div[data-testid="primaryColumn"] section[role="region"]' ); // ページ遷移を行うと $timeline も書き換わる
            
            var $highlight_tweets = $timeline.find( 'article[role="article"] a[role="link"]' ).filter( function () {
                    return ( 0 < $( this ).find( 'time' ).length );
                } ).filter( function () {
                    var $tweet_link = $( this ),
                        $tweet,
                        retweeter_screen_name,
                        target_retweeter_screen_name,
                        is_itself;
                    
                    switch ( $tweet_link.attr( 'href' ) ) {
                        case found_tweet_properties.tweet_url :
                            target_retweeter_screen_name = found_tweet_properties.retweeter_screen_name;
                            is_itself = found_tweet_properties.is_itself;
                            break;
                        
                        case search_tweet_properties.tweet_url :
                            target_retweeter_screen_name = search_tweet_properties.retweeter_screen_name;
                            is_itself = true;
                            break;
                        
                        default :
                            return false;
                    }
                    
                    $tweet = $tweet_link.parents( 'article[role="article"]' ).first();
                    retweeter_screen_name = get_retweeter_screen_name( $tweet );
                    
                    if ( retweeter_screen_name != target_retweeter_screen_name ) {
                        return false;
                    }
                    $tweet.parent().addClass( is_itself ? TARGET_TWEET_CLASS : VICINITY_TWEET_CLASS );
                    
                    return true;
                } );
            
            return $highlight_tweets;
        }; // end of update_highlight_tweets()
    
    return () => {
        if ( ! is_search_mode() ) {
            return;
        }
        
        var last_search_status = search_status;
        
        $primary_column = $( 'div[data-testid="primaryColumn"]' );
        $timeline = $primary_column.find( 'section[role="region"]' ); // ページ遷移を行うと $timeline も書き換わる
        
        switch ( search_status ) {
            case 'error' :
                break;
            
            case 'initialize' :
                hide_sidebar();
                
                //$primary_column = $( 'div[data-testid="primaryColumn"]' );
                if ( $primary_column.length <= 0 ) {
                    break;
                }
                
                start_giveup_handler();
                
                //$timeline = $primary_column.find( 'section[role="region"]' );
                
                if ( 0 < $timeline.length ) {
                    show_primary_column();
                    start_cancel_handler();
                    search_status = 'search';
                }
                else {
                    /*
                    //if ( 0 < $primary_column.find( '> div > div > div > div[role="button"] > svg' ) ) {
                    //    hide_primary_column();
                    //}
                    //※一瞬「問題が発生しました」と出て[再度お試しください]ボタンが表示されている場合に隠したかったが、既に表示されている状態だとあまり意味がない
                    */
                    if ( is_search_result_empty() ) {
                        stop_giveup_handler();
                        show_primary_column();
                        search_status = 'error';
                        break;
                    }
                    else {
                        hide_primary_column();
                    }
                    search_status = 'wait_ready';
                }
                break;
            
            case 'wait_ready' :
                //$timeline = $primary_column.find( 'section[role="region"]' );
                
                if ( 0 < $timeline.length ) {
                    show_primary_column();
                    start_cancel_handler();
                    search_status = 'search';
                }
                else {
                    /*
                    //if ( 0 < $primary_column.find( '> div > div > div > div[role="button"] > svg' ) ) {
                    //    hide_primary_column();
                    //}
                    //※一瞬「問題が発生しました」と出て[再度お試しください]ボタンが表示されている場合に隠したかったが、既に表示されている状態だとあまり意味がない
                    */
                    if ( is_search_result_empty() ) {
                        stop_giveup_handler();
                        show_primary_column();
                        search_status = 'error';
                        break;
                    }
                    else {
                        hide_primary_column();
                    }
                }
                break;
            
            case 'search' :
                $found_tweet_container = search_tweet();
                
                if ( 0 < $found_tweet_container.length ) {
                    ( ( $found_tweet_container ) => {
                        scroll_to( $found_tweet_container.offset().top - ( $( w ).height() / 2 ) );
                        // 見つけた時点では offset().top の値が小さく画面に入っていない場合があるため、一定時間後に再度スクロール指示
                        setTimeout( () => {
                            scroll_to( $found_tweet_container.offset().top - ( $( w ).height() / 2 ) );
                        }, ADJUST_CHECK_INTERVAL_MS );
                    } )( $found_tweet_container );
                    
                    // 目的ツイートが一度タイムラインに現れた後、カード表示などの関係でスクロールアウトしてしまうケースあり
                    // →やむを得ず、連続して現れることを確認してから処理を進めるようにする
                    tweet_found_counter ++;
                    if ( MIN_TWEET_FOUND_NUMBER <= tweet_found_counter ) {
                        start_adjust_handler();
                        stop_giveup_handler();
                        //stop_cancel_handler(); // ここでは止めない（スクロール位置調整中にも止めたいため）
                        search_status = 'found';
                    }
                }
                else {
                    tweet_found_counter = 0;
                }
                log_debug( '* tweet_found_counter:', tweet_found_counter );
                break;
            
            case 'found' :
                /*
                //$found_tweet_container = update_find_tweet();
                //
                //if ( $found_tweet_container.length <= 0 ) {
                //    search_status = 'error';
                //}
                */
                var $highlight_tweets = update_highlight_tweets();
                
                break;
        }
        
        if ( search_status != last_search_status ) {
            log_debug( 'search_status: ', last_search_status, '=>', search_status );
        }
    };
} )(); // end of search_vicinity_tweet()


function check_notification_timeline() {
    if ( ! /^https?:\/\/(?:mobile\.)?twitter\.com\/i\/timeline/.test( location.href ) ) {
        return;
    }
    
    //var $tweets = $( 'div[data-testid="primaryColumn"] article[role="article"]:has(div[data-testid="tweet"])' ),
    var $tweets = $( 'div[data-testid="primaryColumn"] article[role="article"]' ).filter( function () {return ( 0 < $( this ).find( 'div[data-testid="tweet"]' ).length );} ),
        $users = $( 'div[data-testId="primaryColumn"] div[data-testid="UserCell"]' );
    
    $users.each( function () {
        var $user = $( this ),
            $profile_image_link = $user.find( 'a[role="link"]:has(img[src*="profile_images/"]):first' ),
            // 設定時例  : https://pbs.twimg.com/profile_images/<user-id>/<icon-image-name>
            // 未設定時例: https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png
            act_screen_name = ( $profile_image_link.attr( 'href' ) || '' ).replace( /^\//, '' ),
            background_color = getComputedStyle( d.body ).backgroundColor;
        
        if ( ! act_screen_name ) {
            return;
        }
        
        $tweets.each( function () {
            var $tweet = $( this ),
                //tweet_url = $tweet.find( 'a[role="link"][href^="/"][href*="/status/"]:has(time):first' ).attr( 'href' ),
                tweet_url = $tweet.find( 'a[role="link"][href^="/"][href*="/status/"]' ).filter( function () {return ( 0 < $( this ).find( 'time' ).length );} ).first().attr( 'href' ),
                tweet_url_info = parse_individual_tweet_url( tweet_url );
            
            if ( ! tweet_url_info ) {
                return;
            }
            
            var tweet_id = tweet_url_info.tweet_id,
                screen_name = tweet_url_info.screen_name,
                reacted_tweet_info = get_stored_tweet_info( tweet_id ),
                rt_info = reacted_tweet_info.rt_info_map.screen_name_map[ act_screen_name ],
                like_info = reacted_tweet_info.like_info_map.screen_name_map[ act_screen_name ],
                is_valid = ( () => {
                    if ( rt_info || like_info ) {
                        return true;
                    }
                    
                    return false;
                    
                    // TODO: リツイートをいいねされた場合等のチェック(保留中)
                    /*
                    //var retweeter_screen_name = get_retweeter_screen_name( $tweet );
                    //
                    //if ( ! retweeter_screen_name ) {
                    //    return false;
                    //}
                    //
                    //rt_info = reacted_tweet_info.rt_info_map.screen_name_map[ retweeter_screen_name ];
                    //
                    //if ( ( ! rt_info ) || ( ! rt_info.id ) ) {
                    //    rt_info = null;
                    //    return false;
                    //}
                    //
                    //tweet_id = rt_info.id;
                    //screen_name = rt_info.screen_name;
                    //
                    //tweet_url = new URL( '/' + screen_name + '/status/' + tweet_id, d.baseURI ).href;
                    //
                    //reacted_tweet_info = get_stored_tweet_info( tweet_id );
                    //rt_info = reacted_tweet_info.rt_info_map.screen_name_map[ act_screen_name ];
                    //like_info = reacted_tweet_info.like_info_map.screen_name_map[ act_screen_name ];
                    //
                    //return ( rt_info || like_info );
                    */
                } )();
            
            if ( ! is_valid ) {
                return;
            }
            
            var timestamp_ms = new Date( $tweet.find( 'a[role="link"] time[datetime]:first' ).attr( 'datetime' ) ).getTime(),
                $link_container = $user.find( '.' + VICINITY_LINK_CONTAINER_CLASS ),
                $link;
            
            if ( $link_container.length <= 0 ) {
                $link_container = create_vicinity_link_container( {
                    tweet_url : tweet_url,
                    act_screen_name : act_screen_name,
                } );
                
                $link = $link_container.find( 'a:first' ).css( {
                    'padding' : '2px 4px',
                    //'background-color' : is_night_mode() ? '#15202B' : '#FFFFFF',
                    'background-color' : background_color,
                    'border-radius' : '12px',
                } );
                
                $link_container.addClass( 'large' ).css( {
                    'position' : 'absolute',
                    'top' : '0',
                    'right' : '140px',
                    'z-index' : 100,
                } );
                
                //$profile_image_link.after( $link_container );
                //$user.find( 'a[role="link"]:has(span>span):first' ).parent().after( $link_container );
                $user.find( 'a[role="link"]' ).filter( function () {return ( 0 < $( this ).find( 'span>span' ).length );} ).first().parent().after( $link_container );
            }
            else {
                $link = $link_container.find( 'a:first' );
            }
            
            // 一番最初の(最近反応した)ツイートの情報へ更新
            $link.attr( {
                'href' : tweet_url,
                'data-self_tweet_id' : tweet_id,
                'data-self_screen_name' : screen_name,
                'data-timestamp_ms' : timestamp_ms,
            } );
            
            // /2/notifications/all.json で取得された title が document.title のものと一致するかによってイベント種別を判別
            if ( ( rt_info || {} ).event_title && d.title.match( rt_info.event_title ) ) {
                $link.attr( 'data-event_element', rt_info.event_element );
            }
            else if ( ( like_info || {} ).event_title && d.title.match( like_info.event_title ) ) {
                $link.attr( 'data-event_element', like_info.event_element );
            }
            else {
                $link.attr( 'data-event_element', get_event_element_from_title( d.title ) );
            }
            
            return false;
        } );
    } );
    
} // end of check_notification_timeline()


function check_error_page() {
    var result = false;
    
    if ( ! is_error_page() ) {
        return result;
    }
    
    result = true; // エラーページの場合はtrueを返す（呼び出し元にてそれ以降の処理は行わない）
    
    var tweet_url = location.href,
        tweet_url_info = parse_individual_tweet_url( tweet_url ),
        $vicinity_link_containers = $( 'div[data-testid="primaryColumn"] .' + VICINITY_LINK_CONTAINER_CLASS ),
        timestamp_ms;
    
    if ( ! tweet_url_info || ( 0 < $vicinity_link_containers.length ) ) {
        return result;
    }
    
    // TODO: 個別ツイートの場合、日付が取得できない→ツイートIDから取得しているが、2010年11月以前は未対応
    try {
        timestamp_ms = tweet_id_to_date( tweet_url_info.tweet_id ).getTime();
    }
    catch ( error ) {
    }
    
    if ( ! timestamp_ms ) {
        return result;
    }
    
    var $link_container = create_vicinity_link_container( {
            tweet_url : tweet_url,
            class_name : [ 'large' ],
            attributes : {
                'data-timestamp_ms' : timestamp_ms,
            }
        } ),
        //$parent = $( 'div[data-testid="primaryColumn"] h1[role="heading"][data-testid="error-detail"]:first' );
        $search_link = $( 'div[data-testid="primaryColumn"] [data-testid="error-detail"] a[role="link"][href^="/search"]' ),
        $parent =$search_link.parents( '[dir="auto"]:first' );
    
    if ( $parent.length < 1 ) {
        $parent = $search_link.parent();
    }
    
    $parent.append( $link_container );
    
    return result;

} // end of check_error_page()


function analyze_fetch_data( message ) {
    switch ( message.message_id ) {
        case 'FETCH_REQUEST_DATA' :
            try {
                analyze_client_event( message.url, message.data.body );
            }
            catch ( error ) {
                log_error( 'analyze_client_event()', error );
            }
            break;
        
        case 'FETCH_RESPONSE_DATA' :
            try {
                analyze_capture_result( message.url, message.data.json );
            }
            catch ( error ) {
                log_error( 'analyze_capture_result()', error );
            }
            break;
    }
    
    request_observation();
} // end of analyze_fetch_data()


function start_key_observer() {
    var is_key_acceptable = () => {
            var $active_element = $( d.activeElement );
            
            if ( (
                    ( ( $active_element.hasClass( 'tweet-box' ) ) || ( $active_element.attr( 'role' ) == 'textbox' ) || ( $active_element.attr( 'name' ) == 'tweet' ) ) &&
                    ( $active_element.attr( 'contenteditable' ) == 'true' )
                ) ||
                ( $active_element.prop( 'tagName' ) == 'TEXTAREA' ) ||
                ( ( $active_element.prop( 'tagName' ) == 'INPUT' ) && ( 0 <= [ 'TEXT', 'PASSWORD' ].indexOf( $active_element.attr( 'type' ).toUpperCase() ) ) )
            ) {
                return false;
            }
            return true;
        }, // end of is_key_acceptable()
        
        get_current_retweeter = () => {
            var $region = $( '[aria-labelledby="modal-header"], main[role="main"]' ).find( 'section[role="region"]' ),
                $current_retweeter = $region.find( 'div[data-testid="UserCell"][data-focusvisible-polyfill="true"]' );
            
            return $current_retweeter;
        },
        
        get_first_retweeter = () => {
            var $region = $( '[aria-labelledby="modal-header"], main[role="main"]' ).find( 'section[role="region"]' ),
                $first_retweeter = $region.find( 'div[data-testid="UserCell"]' ).filter( function () {
                    return ( 0 < $( this ).find( 'a[data-self_tweet_id]' ).length );
                } ).first();
            
            return $first_retweeter;
        },
        
        search_and_click_button_on_stream_item = ( event, button_selector ) => {
            var $region,
                $target_element,
                $button;
            
            if ( is_tweet_retweeters_url() ) {
                $target_element = get_current_retweeter();
                if ( $target_element.length <= 0 ) {
                    $target_element = get_first_retweeter();
                    $target_element.focus();
                }
            }
            else {
                $region = $( 'main[role="main"] [data-testid="primaryColumn"] section[role="region"]' );
                $target_element = $region.find( 'article[role="article"][data-focusvisible-polyfill="true"]' );
                
                if ( $target_element.length <= 0 ) {
                    //$target_element = $region.find( 'article[role="article"]:has(div[data-testid="tweet"])' );
                    $target_element = $region.find( 'article[role="article"]' ).filter( function () {
                        return ( 0 < $( this ).find( 'div[data-testid="tweet"]' ).length );
                    } );
                }
            }
           
            $button = $target_element.find( button_selector ).filter( ':visible' ).first();
            
            if ( 0 < $button.length ) {
                $button.click();
                
                event.stopPropagation();
                event.preventDefault();
            }
            
            return false;
        }; // end of search_and_click_button_on_stream_item()
    
    $( d.body ).on( 'keydown.main', function ( event ) {
        if ( event.shiftKey || event.altKey || event.ctrlKey ) {
            return;
        }
        
        if ( ! is_key_acceptable() ) {
            return;
        }
        
        var key_code = event.keyCode;
        
        switch ( key_code ) {
            case OPTIONS.OPEN_LINK_KEYCODE :
                return search_and_click_button_on_stream_item( event, 'div.' + SELF_CONTAINER_CLASS + ' a' );
            
            case OPTIONS.OPEN_ACT_LINK_KEYCODE :
                return search_and_click_button_on_stream_item( event, 'div.' + ACT_CONTAINER_CLASS + ' a' );
            
            case OPTIONS.TOGGLE_RERT_DIALOG_KEYCODE :
                return search_and_click_button_on_stream_item( event, [
                    '.' + RECENT_RETWEETS_BUTTON_CLASS + ' button',
                    '.' + OPEN_VICINITY_TWEETS_BUTTON_CONTAINER_CLASS + ' a',
                ].join( ',' ) );
        }
    } );
    
    var move_timer_id = null;
    
    $( d.body ).on( 'keypress.main', function ( event ) {
        if ( ! is_tweet_retweeters_url() ) {
            return;
        }
        
        if ( ! is_key_acceptable() ) {
            return;
        }
        
        var key_code = event.keyCode;
        
        if ( ( key_code != 106 ) && ( key_code != 107 ) ) {
            return;
        }
        // 106=[j], 107=[k] のみ、オリジナルの処理を上書き
        
        event.stopPropagation();
        event.preventDefault();
        
        var $current_retweeter = get_current_retweeter(),
            $target_retweeter,
            $scroll_area;
        
        //$current_retweeter.removeAttr( 'data-focusvisible-polyfill' ).removeClass( 'r-1uaug3w' ).blur();
        $current_retweeter.blur();
        
        if ( 0 < $current_retweeter.length ) {
            $target_retweeter = $current_retweeter.parents().eq( 1 )[ ( key_code == 106 ) ? 'next' : 'prev' ]().find( 'div[data-testid="UserCell"]' );
            
            if ( $target_retweeter.length <= 0 ) {
                $target_retweeter = $current_retweeter;
            }
        }
        else {
            $target_retweeter = get_first_retweeter();
        }
        
        if ( $target_retweeter.length <= 0 ) {
            return;
        }
        
        //$target_retweeter.attr( 'data-focusvisible-polyfill', true ).addClass( 'r-1uaug3w' ).focus();
        if ( 0 < $target_retweeter.parents( 'main[role="main"]' ).length ) {
            // 画面幅が一定より狭い場合には全画面→スクロールは window 基準
            //$( w ).scrollTop( $target_retweeter.offset().top - 73 );
            ( ( $nav ) => {
                $( w ).scrollTop( $target_retweeter.offset().top - 73 - ( ( 0 < $nav.length ) ? $nav.height() : 0 ) ); // コメント付き／なしタブがある場合は位置をずらす
            } )( $( 'main[role="main"] nav[role="navigation"]' ) );
        }
        else {
            $scroll_area = $target_retweeter.parents( 'section[role="region"]:first' ).parents().eq( 1 );
            $scroll_area.scrollTop( $scroll_area.scrollTop() + $target_retweeter.offset().top - $scroll_area.offset().top - 24 );
        }
        $target_retweeter.focus();
        
        var $tweet_list_parent = $( '.' + VICINITY_TWEET_LIST_PARENT_CLASS );
        
        if ( ( $tweet_list_parent.length <= 0 ) || $tweet_list_parent.is( ':hidden' ) ) {
            return;
        }
        
        // 前後ツイート用コンテナが表示されている場合のみ [j]/[k] で自動でツイート読み込み
        $target_retweeter.find( '.' + OPEN_VICINITY_TWEETS_BUTTON_CLASS ).click();
    } );
    
} // end of start_key_observer()


function start_tweet_observer() {
    var tweet_container = d.body,
        request_observation_container = get_request_observation_container().get( 0 ),
        
        is_primary_column_ready = () => {
            if ( $( 'div[data-testid="primaryColumn"]' ).length <= 0 ) {
                return false;
            }
            is_primary_column_ready = () => true;
            
            return true;
        },
        
        on_change = ( records ) => {
            var result;
            
            if ( ! is_primary_column_ready() ) {
                return;
            }
            
            performance.mark( 'm1' );
            
            // 表示モード更新
            update_display_mode();
            
            performance.mark( 'm2' );
            
            // エラーページ確認
            result = check_error_page();
            
            performance.mark( 'm3' );
            
            if ( result ) {
                return;
            }
            performance.mark( 'm4' );
            
            // タイムライン上のツイート確認
            check_timeline_tweets();
            
            performance.mark( 'm5' );
            
            // 通知タイムライン確認
            check_notification_timeline();
            
            performance.mark( 'm6' );
            
            // タイムライン上で近傍ツイート検索
            search_vicinity_tweet();
            
            performance.mark( 'm7' );
        },
        
        observer = new MutationObserver( ( records ) => {
            try {
                stop_observe();
                performance.mark( 'ma1' );
                on_change( records );
                performance.mark( 'ma2' );
            }
            catch ( error ) {
                log_error( 'observer', error );
            }
            finally {
                start_observe();
            }
        } ),
        start_observe = () => observer.observe( tweet_container, { childList : true, subtree : true } ),
        stop_observe = () => observer.disconnect(),
            
        request_observer = new MutationObserver( ( records ) => {
            try {
                stop_request_observer();
                performance.mark( 'mb1' );
                on_change( records );
                performance.mark( 'mb2' );
            }
            catch ( error ) {
                log_error( 'request_observer', error );
            }
            finally {
                start_request_observer();
            }
        } ),
        start_request_observer = () => request_observer.observe( request_observation_container, { childList : true, subtree : false } ),
        stop_request_observer = () => request_observer.disconnect();
    
    start_observe();
    start_request_observer();
    
    $( w ).on( 'scroll', function ( event ) {
        check_user_timeline_end();
    } );
    
} // end of start_tweet_observer()


function start_fetch_observer() {
    // コンテンツ側より postMessage() で送信されてくるメッセージを監視
    window.addEventListener( 'message', function ( event ) {
        if ( event.origin != location.origin ) {
            return;
        }
        
        var message = event.data;
        
        if ( ( ! message ) || ( message.namespace != SCRIPT_NAME ) ) {
            return;
        }
        
        analyze_fetch_data( message );
    } );
    
    /*
    // 2020.08.09: 呼び出しタイミングを早くするため、load_options.js に移動
    //// コンテンツ側に window.XMLHttpRequest / window.fetch を監視するよう指示
    //if ( IS_FIREFOX ) {
    //    // 2020.08.06: Firefox でインラインスクリプトが実行できなくなったため、外部スクリプトとして呼び出し
    //    window.inject_script_sync( 'scripts/fetch_wrapper_caller.js' );
    //}
    //else {
    //    window.inject_code( [
    //        'make_fetch_wrapper(', // make_fetch_wrapper() は scripts/fetch_wrapper.js 内にて定義
    //        JSON.stringify( {
    //            SCRIPT_NAME : SCRIPT_NAME,
    //            API_USER_TIMELINE_TEMPLATE : API_USER_TIMELINE_TEMPLATE,
    //            OBSERVATION_WRAPPER_ID : OBSERVATION_WRAPPER_ID,
    //            OBSERVE_DOM_FETCH_DATA : OPTIONS.OBSERVE_DOM_FETCH_DATA,
    //        } ),
    //        ');',
    //    ].join( '' ) );
    //}
    */
} // end of start_fetch_observer()


function insert_css( css_rule_text, css_style_id ) {
    var parent = d.querySelector( 'head' ) || d.body || d.documentElement,
        css_style = d.createElement( 'style' ),
        css_rule = d.createTextNode( css_rule_text );
    
    css_style.type = 'text/css';
    css_style.className = SCRIPT_NAME + '-css-rule';
    if ( css_style_id ) {
        css_style.id = css_style_id;
    }
    
    if ( css_style.styleSheet ) {
        css_style.styleSheet.cssText = css_rule.nodeValue;
    }
    else {
        css_style.appendChild( css_rule );
    }
    
    parent.appendChild( css_style );
} // end of insert_css()


function set_user_css() {
    var night_mode_selector = 'body[data-nightmode="true"]',
        vicinity_link_container_selector = 'div.' + VICINITY_LINK_CONTAINER_CLASS,
        vicinity_link_container_self_selector = 'div.' + SELF_CONTAINER_CLASS,
        vicinity_link_container_act_selector = 'div.' + ACT_CONTAINER_CLASS,
        vicinity_link_selector = 'div > a.' + VICINITY_LINK_CLASS,
        vicinity_link_self_selector = vicinity_link_container_self_selector + ' > a.' + VICINITY_LINK_CLASS,
        vicinity_link_act_selector = vicinity_link_container_act_selector + ' > a.' + VICINITY_LINK_CLASS,
        recent_retweets_button_selector = 'div.' + RECENT_RETWEETS_BUTTON_CLASS + ' button.btn',
        open_vicinity_tweets_button_container_selector = 'div.' + OPEN_VICINITY_TWEETS_BUTTON_CONTAINER_CLASS,
        open_vicinity_tweets_button_selector = open_vicinity_tweets_button_container_selector + ' .' + OPEN_VICINITY_TWEETS_BUTTON_CLASS,
        vicinity_tweet_list_parent_selector = 'div.' + VICINITY_TWEET_LIST_PARENT_CLASS,
        vicinity_tweet_list_selector = 'ul.' + VICINITY_TWEET_LIST_CLASS,
        vicinity_tweet_container_selector = 'li.' + VICINITY_TWEET_CONTAINER_CLASS,
        target_tweet_selector = 'div.' + TARGET_TWEET_CLASS + ' > article',
        vicinity_tweet_selector = 'div.' + VICINITY_TWEET_CLASS + ' > article',
        to_past_link_selector = 'a.' + TO_PAST_TIMELINE_CLASS,
        
        css_rule_lines = [
            vicinity_link_selector + ' {' + [
                'display: inline-block',
                'width: 12px;',
                'height: 12px;',
                'margin: 0 0 0 8px',
                'padding: 0 0 0 0',
                'text-decoration: none',
                'font-size: 12px',
                'white-space: nowrap',
            ].join( '; ' ) + ';}',
            
            vicinity_link_container_selector + ' {display: inline-block;}',
            
            vicinity_link_container_selector + '.icon a {' + [
                //'background-image: url(' + LINK_ICON_URL + ' )',
                //'background-repeat: no-repeat',
                //'background-position: 0 0',
                //'background-size: 24px 12px',
                'color : ' + OPTIONS.LINK_ICON_COLOR,
            ].join( '; ' ) + ';}',
            
            vicinity_link_container_selector + '.icon a:hover {' + [
                //'background-position : -12px 0',
                'color : ' + OPTIONS.LINK_ICON_COLOR_HOVER,
            ].join( '; ' ) + ';}',
            
            night_mode_selector + ' ' + vicinity_link_container_selector + '.icon a {color: ' + OPTIONS.LINK_ICON_COLOR_NIGHTMODE + ';}',
            night_mode_selector + ' ' + vicinity_link_container_selector + '.icon a:hover {color: ' + OPTIONS.LINK_ICON_COLOR_HOVER_NIGHTMODE + ';}',
            
            vicinity_link_container_selector + '.icon a svg {width: 100%; height: auto;}',
            
            /*
            //vicinity_link_container_selector + '.text a {opacity: 0.8;}',
            //vicinity_link_container_selector + '.text a:hover {opacity: 1.0;}',
            //vicinity_link_container_selector + '.text a {padding: 2px 4px; opacity: 0.8; color: #004262; background-color: #ffffee;}',
            //night_mode_selector + ' ' + vicinity_link_container_selector + '.text a {color: #ffffee; background-color: #004262;}',
            */
            
            vicinity_link_container_selector + '.middle a {}',
            //vicinity_link_container_selector + '.middle.icon a {transform: scale(1.5, 1.5);}',
            vicinity_link_container_selector + '.middle.icon a {width: 18px; height: 18px;}',
            vicinity_link_container_selector + '.middle.text a {}',
            
            vicinity_link_container_selector + '.large a {}',
            //vicinity_link_container_selector + '.large.icon a {transform: scale(2, 2);}',
            vicinity_link_container_selector + '.large.icon a {width: 24px; height: 24px;}',
            vicinity_link_container_selector + '.larget.text a {}',
            
            recent_retweets_button_selector + ' {font-size: 12px; font-weight: normal; padding: 2px 3px; text-decoration: none; cursor: pointer; display: inline-block;}',
            recent_retweets_button_selector + ' {margin-left: 8px; margin-right: 24px; background-image: linear-gradient(rgb(255, 255, 255), rgb(245, 248, 250)); background-color: rgb(245, 248, 250); color: rgb(102, 117, 127); cursor: pointer; display: inline-block; position: relative; border-width: 1px; border-style: solid; border-color: rgb(230, 236, 240); border-radius: 4px;}',
            recent_retweets_button_selector + ':hover {color: rgb(20, 23, 26); background-color: rgb(230, 236, 240); background-image: linear-gradient(rgb(255, 255, 255), rgb(230, 236, 240)); text-decoration: none; border-color: rgb(230, 236, 240);}',
            night_mode_selector + ' ' + recent_retweets_button_selector + ' {background-color: #182430; background-image: none; border: 1px solid #38444d; border-radius: 4px; color: #8899a6; display: inline-block;}',
            night_mode_selector + ' ' + recent_retweets_button_selector + ':hover {color: #fff; text-decoration: none; background-color: #10171e; background-image: none; border-color: #10171e;}',
            
            open_vicinity_tweets_button_container_selector + ' {display: inline-block;}',
            open_vicinity_tweets_button_selector + ' {display: inline-block; color: ' + OPTIONS.LINK_ICON_COLOR + ';}',
            open_vicinity_tweets_button_selector + ':hover {color: ' + OPTIONS.LINK_ICON_COLOR_HOVER + ';}',
            night_mode_selector + ' ' + open_vicinity_tweets_button_selector + ' {color: ' + OPTIONS.LINK_ICON_COLOR_NIGHTMODE + ';}',
            night_mode_selector + ' ' + open_vicinity_tweets_button_selector + ':hover {color: ' + OPTIONS.LINK_ICON_COLOR_HOVER_NIGHTMODE + ';}',
            open_vicinity_tweets_button_selector  + ' svg {width: 100%; height: auto;}',
            open_vicinity_tweets_button_container_selector + '.middle a {width: 18px; height: 18px;}',
            open_vicinity_tweets_button_container_selector + '.large a {width: 24px; height: 24px;}',
            open_vicinity_tweets_button_container_selector + '.loading a svg {animation: now_loading 2.0s linear infinite;}',
            '@keyframes now_loading {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}',
            open_vicinity_tweets_button_container_selector + '.current a {color: #ff0000!important;}',
            
            'div[data-testid="UserCell"][data-focusvisible-polyfill="true"] {border: solid 1px #4d90fe;}',
            
            '.' + VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS + ' {max-height: calc(50% - 53px - 2*8px);}',
            'main[role="main"] .' + VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS + ' {max-height: initial;}',
            '.' + VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS + ' div > div > section > div > div > div > div:last-child {}',
            //'main[role="main"] .' + VICINITY_TWEET_LIST_BASE_CONTAINER_CLASS + ' div > div > section > div > div > div > div:last-child {height: 55vh;}',
            
            vicinity_tweet_list_parent_selector + ' {position: absolute; left: 0; bottom: 0; max-height: 50%; height: 100%; max-width: 100%; width: 100%; z-index:1000; overflow: auto; border-top: solid 1px #ccd6dd; padding: 8px 0; cursor: pointer;}',
            'main[role="main"] ' + vicinity_tweet_list_parent_selector + ' {position: fixed;}',
            night_mode_selector + ' ' + vicinity_tweet_list_parent_selector + ' {border-top: solid 1px #3d5466;}',
            night_mode_selector + ' ' + 'main[role="main"] ' + vicinity_tweet_list_parent_selector + ' {}',
            
            vicinity_tweet_list_selector + ' {list-style-type: none; padding: 0 16px;}',
            
            vicinity_tweet_container_selector + '{display: grid; grid-template-columns: 0px 1fr 40px 1fr; grid-template-areas:' + [ 
               '"icon info  mark  timestamp"',
               '"icon body  body  body     "',
               '"icon media media media    "',
            ].join( '\n' ) + '; cursor: auto;}',
            vicinity_tweet_container_selector + ' {color: #000000; background: #fcfcfc; padding: 4px 0; border: solid 1px #eeeeee; border-top: none;}',
            vicinity_tweet_container_selector + '.first {border-top: solid 1px #eeeeee;}',
            vicinity_tweet_container_selector + '.target {background: #eeeeee;}',
            vicinity_tweet_container_selector + ' a {color: #1da1f2; text-decoration: none;}',
            vicinity_tweet_container_selector + ' a:hover {text-decoration: underline;}',
            vicinity_tweet_container_selector + ' .user-icon {grid-area: icon;}',
            vicinity_tweet_container_selector + ' .tweet-info {grid-area: info; font-size: 90%; text-align: left; margin-left: 8px;}',
            vicinity_tweet_container_selector + ' .tweet-mark {grid-area: mark; font-size: 100%; text-align: center; color: #1da1f2; user-select: none;}',
            vicinity_tweet_container_selector + ' .tweet-timestamp {grid-area: timestamp; font-size: 90%; text-align: right; margin-right: 8px;}',
            vicinity_tweet_container_selector + ' .tweet-body {grid-area: body; margin: 0 12px 0 4px; overflow: auto;}',
            vicinity_tweet_container_selector + ' .tweet-media {grid-area: media; display: grid; grid-template-columns: 25% 25% 25% 25%;}',
            vicinity_tweet_container_selector + ' .tweet-media a {display: inline-block; margin: 2px 4px;}',
            vicinity_tweet_container_selector + ' .tweet-media a img {width: 100%; height: auto;}',
            night_mode_selector + ' ' + vicinity_tweet_container_selector + ' {color: #ffffff; background: #1f1f1f; border: solid 1px #444444; border-top: none;}',
            night_mode_selector + ' ' + vicinity_tweet_container_selector + '.first {border-top: solid 1px #444444;}',
            night_mode_selector + ' ' + vicinity_tweet_container_selector + '.target {background: #444444;}',
            
            target_tweet_selector + ' {background-color: ' + OPTIONS.TARGET_TWEET_COLOR + ';}',
            vicinity_tweet_selector + ' {background-color: ' + OPTIONS.VICINITY_TWEET_COLOR + ';}',
            night_mode_selector + ' ' + target_tweet_selector + ' {background-color: ' + OPTIONS.TARGET_TWEET_COLOR_NIGHTMODE + ';}',
            night_mode_selector + ' ' + vicinity_tweet_selector + ' {background-color: ' + OPTIONS.VICINITY_TWEET_COLOR_NIGHTMODE + ';}',
            
            to_past_link_selector + ' {display: inline-block; width: 100%; margin: 8px 0 0 8px; text-decoration: none; font-weight: bolder; font-size: 16px; text-align: right; color: #006699;}',
            night_mode_selector + ' ' + to_past_link_selector + ' {color: #ccffff;}',
        ];
    
    $( 'style.' + SCRIPT_NAME + '-css-rule' ).remove();
    
    insert_css( css_rule_lines.join( '\n' ) );

} // end of set_user_css()


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
    
    ID_AFTER = Decimal.mul( ID_INC_PER_SEC, OPTIONS.HOUR_AFTER * 3600 );
    ID_AFTER_LEGACY = Decimal.mul( ID_INC_PER_SEC_LEGACY, OPTIONS.HOUR_AFTER * 3600 );
    ID_THRESHOLD = new Decimal( ID_THRESHOLD );
    
    log_debug( 'ID_INC_PER_SEC =', ID_INC_PER_SEC.toString() );
    log_debug( 'ID_AFTER =', ID_AFTER.toString() );
    log_debug( 'ID_THRESHOLD =', ID_THRESHOLD.toString() );
    
    set_user_css();
    
    start_fetch_observer();
    start_tweet_observer();
    start_key_observer();
    
    if ( DEBUG_PERFORMANCE ) {
        setTimeout( () => {
            var entries = [
                { name : 'tweet-onchange', from : 'ma1', to : 'ma2' },
                { name : 'fetch_tweet-onchange', from : 'mb1', to : 'mb2' },
                
                { name : 'update_display_mode()', from : 'm1', to : 'm2' },
                { name : 'check_error_page()', from : 'm2', to : 'm3' },
                { name : 'check_timeline_tweets()', from : '45', to : 'm5' },
                { name : 'check_notification_timeline()', from : 'm5', to : 'm6' },
                { name : 'search_vicinity_tweet()', from : 'm6', to : 'm7' },
            ];
            
            entries.forEach( ( entry ) => {
                try {
                    performance.measure( entry.name, entry.from, entry.to );
                    log_info( entry.name, performance.getEntriesByName( entry.name )[ 0 ].duration );
                }
                catch ( error ) {
                }
            } );
        }, 60*1000 );
    }
    
    log_debug( 'All set.' );
} // end of initialize()


function main() {
    // ユーザーオプション読み込み
    w.twDisplayVicinity_chrome_init( function ( user_options ) {
        initialize( user_options );
    } );
} // end of main()

//}

main(); // エントリポイント

} )( window, document );
