// 【TweetDeck 用・Twitter メディアダウンローダ メイン処理】
( function ( w, d ) {

'use strict';

w.chrome = ( ( typeof browser != 'undefined' ) && browser.runtime ) ? browser : chrome;


// ■ Firefox で XMLHttpRequest や fetch が予期しない動作をしたり、開発者ツールのネットワークに通信内容が表示されないことへの対策
// 参考: [Firefox のアドオン(content_scripts)でXMLHttpRequestやfetchを使う場合の注意 - 風柳メモ](https://memo.furyutei.work/entry/20180718/1531914142)
const XMLHttpRequest = ( typeof content != 'undefined' && typeof content.XMLHttpRequest == 'function' ) ? content.XMLHttpRequest  : w.XMLHttpRequest;
const fetch = ( typeof content != 'undefined' && typeof content.fetch == 'function' ) ? content.fetch  : w.fetch;


// ■ パラメータ {
var OPTIONS = {
    USE_SEARCH_TL_BY_DEFAULT : false, // true: デフォルトで検索タイムラインを使用
    ENABLED_ON_TWEETDECK : true, // true: TweetDeck 上で動作
    OPERATION : true, // true: 動作中、false: 停止中
    
    HOUR_AFTER : 3, // 対象ツイートより後の期間(時間)
    
    USE_LINK_ICON : true, // 近傍リンクの種類（true: アイコンを使用 ／ false: 文字を使用(未対応)
    //TODO: 文字リンクはレイアウトが難しいため、現在未対応
    
    LINK_ICON_COLOR : '#aab8c2',
    LINK_ICON_COLOR_HOVER : '#ff9613',
    LINK_ICON_COLOR_NIGHTMODE : '#aab8c2',
    LINK_ICON_COLOR_HOVER_NIGHTMODE : '#ff9613',
    
    ENABLE_RECENT_RETWEET_USERS_BUTTON : true, // true: [Re:RT]（最近リツイートしたユーザーを表示するボタン）を有効に
    
    MAX_USER_NUMBER : 30, // 取得ユーザー数(API制限により、100ユーザまで) (ENABLE_RECENT_RETWEET_USERS_BUTTON が true の場合に使用)
    MAX_AFTER_RETWEET_MINUTES : 10, // リツイート後のツイート取得期間(分)
    MAX_BEFORE_RETWEET_MINUTES : 10, // リツイート前のツイート取得時間(分)
    // TODO: 元々のの「リツイートしたユーザー」ダイアログを利用しているため、未使用
    
    /*
    //OPEN_LINK_KEYCODE : 70, // 近傍ツイート検索キーコード([f]:70)
    //HELP_OPEN_LINK_KEYCHAR : 'f', // 近傍ツイート検索キー表示
    //
    //OPEN_ACT_LINK_KEYCODE : 65, // アクションの近傍ツイート検索キーコード([a]:65)
    //HELP_OPEN_ACT_LINK_KEYCHAR : 'a', // アクションの近傍ツイート検索キー
    //
    //※ [f][a]はTweetDeckでは元のキー割り当てと被る
    */
    
    OPEN_LINK_KEYCODE : 81, // 近傍ツイート検索キーコード([q]:81)
    HELP_OPEN_LINK_KEYCHAR : 'q', // 近傍ツイート検索キー表示
    
    OPEN_ACT_LINK_KEYCODE : 87, // アクションの近傍ツイート検索キーコード([w]:87)
    HELP_OPEN_ACT_LINK_KEYCHAR : 'w', // アクションの近傍ツイート検索キー
};

// }


// ■ 共通変数 {
var SCRIPT_NAME = 'twDisplayVicinity',
    IS_CHROME_EXTENSION = !! ( w.is_chrome_extension ),
    DEBUG = false;

if ( ! w.is_web_extension ) {
    // TODO: ユーザースクリプトとしての動作は未対応（拡張機能のみ対応）
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
    } )();

if ( IS_TOUCHED ) {
    console.error( SCRIPT_NAME + ': Already loaded.' );
    return;
}

var LANGUAGE = ( () => {
        // TODO: TweetDeck の場合、html[lang]は "en-US" 固定
        try{
            return ( w.navigator.browserLanguage || w.navigator.language || w.navigator.userLanguage ).substr( 0, 2 );
        }
        catch ( error ) {
            return 'en';
        }
    } )(),
    
    USERAGENT =  w.navigator.userAgent.toLowerCase(),
    PLATFORM = w.navigator.platform.toLowerCase(),
    IS_FIREFOX = ( 0 <= USERAGENT.indexOf( 'firefox' ) ),
    IS_MAC = ( 0 <= PLATFORM.indexOf( 'mac' ) ),
    IS_EDGE = ( 0 <= w.navigator.userAgent.toLowerCase().indexOf( 'edge' ) );

switch ( LANGUAGE ) {
    case 'ja' :
        OPTIONS.LINK_TEXT = '近傍';
        OPTIONS.LINK_TITLE = '近傍ツイート検索';
        OPTIONS.ACT_LINK_TEXT = '近傍';
        OPTIONS.ACT_LINK_TITLE = 'アクションの近傍ツイート検索';
        break;
    default :
        OPTIONS.LINK_TEXT = 'Vicinity';
        OPTIONS.LINK_TITLE = 'Search vicinity tweets';
        OPTIONS.ACT_LINK_TEXT = 'Vicinity';
        OPTIONS.ACT_LINK_TITLE = 'Search vicinity tweets around action';
        break;
}

var VICINITY_LINK_CONTAINER_CLASS = SCRIPT_NAME + '_vicinity_link_container',
    SELF_CONTAINER_CLASS = SCRIPT_NAME + '_vicinity_link_container_self',
    ACT_CONTAINER_CLASS = SCRIPT_NAME + '_vicinity_link_container_act',
    VICINITY_LINK_CLASS = SCRIPT_NAME + '_vicinity_link',
    TOUCHED_CLASS = SCRIPT_NAME + '-touched',
    
    ID_INC_PER_MSEC = Decimal.pow( 2, 22 ), // ミリ秒毎のID増分
    ID_INC_PER_SEC = ID_INC_PER_MSEC.mul( 1000 ), // 秒毎のID増分
    
    TWEPOCH_OFFSET_MSEC = 1288834974657,
    TWEPOCH_OFFSET_SEC = Math.ceil( TWEPOCH_OFFSET_MSEC / 1000 ), // 1288834974.657 sec (2011.11.04 01:42:54(UTC)) (via http://www.slideshare.net/pfi/id-15755280)
    ID_THRESHOLD = '300000000000000', // 2010.11.04 22時(UTC)頃に、IDが 30000000000以下から300000000000000以上に切り替え
    
    LINK_ICON_SVG = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 -343.6)"><path transform="translate(0 343.6)" d="m0 10v4h3.8633a3.154 2.162 0 0 1 3.1367-1.9414 3.154 2.162 0 0 1 3.1348 1.9414h13.865v-4h-3.8594a3.154 2.162 0 0 1-3.1406 1.9766 3.154 2.162 0 0 1-3.1406-1.9766z" fill="currentColor"/><g transform="matrix(.48001 0 0 .42911 1.3839 211.29)" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="3"><path d="m11.7 351.77h11l-11 11z"/><path d="m11.7 351.77h-11l11 11z"/></g><rect x="6.5596" y="357.32" width=".88075" height="6.3802" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.255" style="paint-order:stroke fill markers"/><g transform="matrix(.48001 0 0 -.42911 11.384 499.94)" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="3"><path d="m11.7 351.77h11l-11 11z"/><path d="m11.7 351.77h-11l11 11z"/></g><rect transform="scale(1,-1)" x="16.56" y="-353.92" width=".88075" height="6.3802" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.255" style="paint-order:stroke fill markers"/></g></svg>',
    
    DOMAIN_PREFIX = location.hostname.match( /^(.+\.)?twitter\.com$/ )[ 1 ] || '',
    
    TEMPORARY_PAGE_URL = ( () => {
        // ポップアップブロック対策に一時的に読み込むページのURLを取得
        // ※なるべく軽いページが望ましい
        // ※非同期で設定しているが、ユーザーがアクションを起こすまでには読み込まれているだろうことを期待
        var test_url = new URL( '/favicon.ico?_temporary_page=true', d.baseURI ).href;
        
        fetch( test_url ).then( ( response ) => {
            TEMPORARY_PAGE_URL = test_url;
        } );
        return null;
    } )();

// }


// ■ 関数 {
function to_array( array_like_object ) {
    return Array.prototype.slice.call( array_like_object );
} // end of to_array()


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


// Twitter のツイートID は 64 ビットで、以下のような構成をとっている
//   [63:63]( 1) 0(固定)
//   [62:22](41) timestamp: 現在の Unix Time(ms) から、1288834974657(ms) (2010/11/04 01:42:54 UTC) を引いたもの
//   [21:12](10) machine id: 生成器に割り当てられたID。datacenter id + worker id
//   [11: 0](12) 生成器ごとに採番するsequence番号
//
// 参考:[Twitterのsnowflakeについて](https://www.slideshare.net/moaikids/20130901-snowflake)
//      [ツイートID生成とツイッターリアルタイム検索システムの話](https://www.slideshare.net/pfi/id-15755280)
function tweet_id_to_date( tweet_id ) {
    var bignum_tweet_id = new Decimal( tweet_id );
    
    if ( bignum_tweet_id.cmp( '300000000000000' ) < 0 ) {
        // ツイートID仕様の切替(2010/11/04 22時 UTC頃)以前のものは未サポート
        return null;
    }
    return new Date( parseInt( bignum_tweet_id.div( Decimal.pow( 2, 22 ) ).floor().add( 1288834974657 ), 10 ) );
} // end of tweet_id_to_date()


function get_gmt_datetime( time, is_msec ) {
    var date = new Date( ( is_msec ) ? time : 1000 * time );
    
    return format_date( date, 'YYYY-MM-DD_hh:mm:ss_GMT', true );
} // end of get_gmt_datetime()


function get_tweet_id_from_utc_sec( utc_sec ) {
    if ( utc_sec < TWEPOCH_OFFSET_SEC ) {
        return null;
    }
    var twepoc_sec = Decimal.sub( utc_sec, TWEPOCH_OFFSET_SEC );
    
    return Decimal.mul( ID_INC_PER_SEC, twepoc_sec ).toString();
} // end of get_tweet_id_from_utc_sec()


var fetch_api_json = ( () => {
    var api_authorization_bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        // TODO: 継続して使えるかどうか不明→変更された場合の対応を要検討
        // ※ https://abs.twimg.com/responsive-web/web/main.<version>.js (例：https://abs.twimg.com/responsive-web/web/main.007c24006b6719434.js) 内で定義されている値
        // ※ これを使用しても、一定時間内のリクエスト回数に制限有り→参考；[TwitterのAPI制限 [2019/05/31現在] - Qiita](https://qiita.com/mpyw/items/32d44a063389236c0a65)
        
        get_api_csrf_token = () => {
            var csrf_token;
            
            try {
                csrf_token = document.cookie.match( /ct0=(.*?)(?:;|$)/ )[ 1 ];
            }
            catch ( error ) {
            }
            
            return csrf_token;
        }, // end of get_api_csrf_token()
        
        create_api_header = () => {
            return {
                'authorization' : 'Bearer ' + api_authorization_bearer,
                'x-csrf-token' : get_api_csrf_token(),
                'x-twitter-active-user' : 'yes',
                'x-twitter-auth-type' : 'OAuth2Session',
                'x-twitter-client-language' : LANGUAGE,
            };
        },
        
        fetch_json = ( url, options ) => {
            log_debug( 'fetch_json()', url, options );
            
            if ( ( ! DOMAIN_PREFIX ) || ( IS_FIREFOX ) ) {
                return fetch( url, options ).then( response => response.json() );
            }
            
            /*
            // tweetdeck.twitter.com 等から api.twitter.com を呼ぶと、
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
                    // → manifest.json に『"incognito" : "split"』が必要
                } );
            } );
        }, // end of fetch_json()
        
        fetch_api_json = ( api_url ) => {
            return fetch_json( api_url, {
                method : 'GET',
                headers : create_api_header(),
                mode: 'cors',
                credentials: 'include',
            } );
        }; // end of fetch_api_json()
    
    return fetch_api_json;
} )(); // end of fetch_api_json()


var fetch_user_timeline = ( () => {
    var api_user_timeline_template = 'https://api.twitter.com/1.1/statuses/user_timeline.json?include_my_retweet=1&include_rts=1&cards_platform=Web-13&include_entities=1&include_user_entities=1&include_cards=1&send_error_codes=1&tweet_mode=extended&include_ext_alt_text=true&include_reply_count=true',
        limit_user_timeline_tweet_number = 40, // statuses/user_timeline の最大取得ツイート数
        default_user_timeline_tweet_number = 20; // statuses/user_timeline のデフォルト取得ツイート数
    
    
    return ( parameters ) => {
        if ( ! parameters ) {
            parameters = {};
        }
        
        var user_id = parameters.user_id,
            screen_name = parameters.screen_name,
            max_id = parameters.max_id,
            count = parameters.count;
        
        if ( ( ! user_id ) && ( ! screen_name ) ) {
            return new Promise( ( resolve, reject ) => {
                reject( {
                    error : 'parameter error',
                    parameters : parameters,
                } );
            } );
        }
        
        if ( isNaN( count ) || ( count < 0 ) || ( limit_user_timeline_tweet_number < count ) ) {
            count = default_user_timeline_tweet_number;
        }
        
        var api_url = api_user_timeline_template;
        
        if ( user_id ) {
            api_url += '&user_id=' + encodeURIComponent( user_id );
        }
        else {
            api_url += '&screen_name=' + encodeURIComponent( screen_name );
        }
        
        api_url += '&count=' + count;
        
        if ( /^\d+$/.test( max_id || '' ) ) {
            api_url += '&max_id=' + max_id;
        }
        
        return fetch_api_json( api_url )
            .then( ( json ) => {
                var tweets = json;
                
                if ( ! Array.isArray( tweets ) ) {
                    return {
                        json : json,
                        error : ( json && json.error ) || 'result JSON structure error',
                    };
                }
                
                return {
                    json : json,
                    tweets : tweets,
                };
            } );
    };
} )(); // end of fetch_user_timeline()


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
                child_window.location.replace( url );
            }
        }
        else {
            child_window = w.open( url, name );
        }
        
        return child_window;
    };
} )(); // end of open_child_window()


function is_night_mode() {
    var $html = $( 'html' );
    
    return $html.hasClasses( [ 'dark', 'night_mode' ], true ); // TweetDeck 用判定
} // end of is_night_mode()


function update_display_mode() {
    $( d.body ).attr( 'data-nightmode', is_night_mode() );
} // end of update_display_mode()


var add_vicinity_links_to_tweet = ( () => {
    var tweet_info_map = {},
        reaction_info_map = {},
        
        update_tweet_info = ( tweet_id, values ) => {
            if ( ! tweet_id ) {
                return {};
            }
            
            if ( ! values ) {
                values = {};
            }
            
            values.id = tweet_id;
            
            var tweet_info = tweet_info_map[ tweet_id ] = tweet_info_map[ tweet_id ] || {};
            
            Object.assign( tweet_info, values );
            
            return tweet_info;
        }, // end of update_tweet_info()
        
        update_reaction_info = ( $tweet ) => {
            var data_tweet_id = $tweet.attr( 'data-tweet-id' ) || '',
                reaction_key = $tweet.attr( 'data-key' ) || '';
            
            if ( data_tweet_id == reaction_key ) {
                return {};
            }
            
            /*
            //var existing_reaction_info = get_stored_reaction_info( reaction_key );
            //
            //if ( existing_reaction_info ) {
            //    return;
            //}
            // ※ DM (archive[data-key^="conversation"]) の場合、同 data-key で上書きされる場合がある
            */
            
            var retweet_id = ( reaction_key.match( /^(\d+)$/ ) || [ 0, '' ] )[ 1 ],
                is_retweet = ( !! ( retweet_id ) ) || /^retweet/.test( reaction_key ),
                is_like = /^favorite/.test( reaction_key ),
                is_dm = /^conversation/.test( reaction_key ),
                
                reaction_name = ( () => {
                    if ( is_retweet ) {
                        return 'retweet';
                    }
                    if ( is_like ) {
                        return 'like';
                    }
                    if ( is_dm ) {
                        return 'dm';
                    }
                    return 'other';
                } )();
            
            if ( reaction_name == 'other' ) {
                return {};
            }
            
            var $user_link,
                $time;
            
            if ( is_dm ) {
                $user_link = $tweet.find( 'header a[rel="user"]:first' );
                $time = $tweet.find( 'header time:first' );
            }
            else {
                $user_link = $tweet.find( [
                    '.activity-header .nbfc a[rel="user"]:first',
                    '.tweet .tweet-context .nbfc a[rel="user"]:first',
                ].join( ',' ) );
                $time = $tweet.find( '.activity-header time' );
            }
            
            var reacter_screen_name = ( $user_link.attr( 'href' ) || '/' ).match( /\/([^\/]*)$/ )[ 1 ],
                reacted_timestamp_ms = ( () => {
                    var reacted_timestamp_ms = $time.attr( 'data-time' ) || '',
                        reacted_date;
                    
                    if ( reacted_timestamp_ms ) {
                        reacted_timestamp_ms = 1 * reacted_timestamp_ms;
                    }
                    else {
                        if ( retweet_id ) {
                            reacted_date = tweet_id_to_date( retweet_id );
                            
                            if ( reacted_date ) {
                                reacted_timestamp_ms = reacted_date.getTime();
                            }
                        }
                    }
                    return reacted_timestamp_ms;
                } )(),
                
                reaction_info = reaction_info_map[ reaction_key ] = {
                    key : reaction_key,
                    reaction_name : reaction_name,
                    id : retweet_id,
                    reacted_id : data_tweet_id,
                    screen_name : reacter_screen_name,
                    timestamp_ms : reacted_timestamp_ms,
                };
            
            if ( ( ! data_tweet_id ) || ( ( ! is_retweet ) && ( ! is_like ) ) ) {
                return reaction_info;
            }
            
            var reacted_tweet_info = update_tweet_info( data_tweet_id ),
                reaction_tweet_info = ( retweet_id ) ? update_tweet_info( retweet_id, reaction_info ) : {};
            
            return reaction_info;
        }, // end of update_reaction_info()
        
        get_tweet_id_info = ( $tweet ) => {
            var tweet_id = $tweet.attr( 'data-tweet-id' ),
                $header,
                screen_name,
                timestamp_ms,
                
                parse_time_string = ( () => {
                    var reg_time = /^(\d+):(\d+)(am|pm)[^\d]+(.+)$/i;
                    
                    return ( source_time_string ) => {
                        source_time_string = source_time_string.trim();
                        
                        var reg_result = source_time_string.match( reg_time );
                        
                        if ( ! reg_result ) {
                            return null;
                        }
                        
                        var hour = 1 * reg_result[ 1 ],
                            minute = 1 * reg_result[ 2 ],
                            suffix = reg_result[ 3 ].toLowerCase(),
                            date = reg_result[ 4 ];
                        
                        if ( hour == 12 ) {
                            hour = 0;
                        }
                        if ( suffix == 'pm' ) {
                            hour = hour + 12;
                        }
                        
                        var time_string = date + ' ' + hour + ':' + minute,
                            timestamp_ms = Date.parse( time_string );
                        
                        if ( isNaN( timestamp_ms ) ) {
                            return null;
                        }
                        return timestamp_ms;
                    };
                } )();
            
            if ( 0 < $tweet.find( '.tweet-detail' ).length ) {
                screen_name = $tweet.find( '.account-summary a.account-link:first' ).attr( 'data-user-name' );
                timestamp_ms = parse_time_string( $tweet.find( '.margin-tl a[rel="url"]:first' ).text() );
                if ( ! timestamp_ms ) {
                    try {
                        timestamp_ms = tweet_id_to_date( tweet_id ).getTime();
                    }
                    catch ( error ) {
                        timestamp_ms = new Date().getTime();
                    }
                }
            }
            else {
                $header = $tweet.find( 'header' );
                screen_name = ( $header.find( 'a[rel="user"]:first' ).attr( 'href' ) || '/' ).match( /\/([^\/]*)$/ )[ 1 ];
                timestamp_ms = 1 * $header.find( 'time:first' ).attr( 'data-time' );
            }
            
            var tweet_id_info = {
                tweet_id : tweet_id,
                screen_name : screen_name,
                timestamp_ms : timestamp_ms,
            };
            
            return tweet_id_info;
        }, // end of get_tweet_id_info()
        
        update_stored_tweet_info = ( $tweet ) => {
            var reaction_info = update_reaction_info( $tweet ),
                tweet_id_info = get_tweet_id_info( $tweet ),
                tweet_id = tweet_id_info.tweet_id;
            
            if ( ! tweet_id ) {
                return {
                    tweet_info : null,
                    reaction_info : reaction_info,
                };
            }
            
            var existing_tweet_info = get_stored_tweet_info( tweet_id );
            
            if ( existing_tweet_info && existing_tweet_info.screen_name ) {
                return {
                    tweet_info : existing_tweet_info,
                    reaction_info : reaction_info,
                };
            }
            
            var tweet_info = update_tweet_info( tweet_id, {
                    screen_name : tweet_id_info.screen_name,
                    timestamp_ms : tweet_id_info.timestamp_ms,
                } );
            
            return {
                tweet_info : tweet_info,
                reaction_info : reaction_info,
            };
        }, // end of update_stored_tweet_info()
        
        get_stored_tweet_info = ( tweet_id ) => {
            return tweet_info_map[ tweet_id ];
        }, // end of get_stored_tweet_info()
        
        get_stored_reaction_info = ( key ) => {
            return reaction_info_map[ key ];
        }, // end of get_stored_reaction_info()
        
        open_search_window = ( () => {
            var user_timeline_url_template = 'https://twitter.com/#SCREEN_NAME#/with_replies?max_id=#MAX_ID#',
                search_query_template = 'from:#SCREEN_NAME# until:#GMT_DATETIME# include:retweets include:nativeretweets',
                search_url_template = 'https://twitter.com/search?f=live&q=#SEARCH_QUERY_ENCODED#';
            
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
                    child_window = open_child_window( ( TEMPORARY_PAGE_URL || target_info.tweet_url ) + ( /\?/.test( target_info.tweet_url ) ? '&' : '?' ) + '_temporary_page=true', '_blank' ), // 暫定ページを開いておく
                    
                    open_search_page = () => {
                        open_child_window( search_parameters.search_url, {
                            existing_window : child_window,
                            search_parameters : search_parameters,
                        } );
                    };
                
                log_debug( 'search_parameters:', search_parameters, 'target_info:', target_info );
                log_debug( 'until_timestamp_ms:', until_timestamp_ms, 'until_gmt_datetime:', until_gmt_datetime );
                log_debug( 'search_url:', search_url );
                log_debug( 'test_tweet_id:', test_tweet_id );
                
                if ( ( ! search_parameters.use_user_timeline ) || ( ! test_tweet_id ) ) {
                    open_search_page();
                    return;
                }
                
                fetch_user_timeline( {
                    screen_name : target_info.screen_name,
                    max_id : test_tweet_id,
                } )
                .then( ( result ) => {
                    if ( result.error ) {
                        log_error( 'fetch_user_timeline() error:', result.error, result );
                        
                        search_parameters.use_user_timeline = false;
                        open_search_page();
                        return;
                    }
                    
                    if ( result.tweets.length <= 0 ) {
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
                    return;
                } )
                .catch( ( error ) => {
                    log_error( 'fetch_user_timeline() error:', error );
                    search_parameters.use_user_timeline = false;
                    open_search_page();
                } );
            };
        } )(), // end of open_search_window()
        
        create_vicinity_link_container = ( () => {
            var $link_container_template = $( '<div><a></a></div>' ).addClass( VICINITY_LINK_CONTAINER_CLASS ),
                $link_template = $link_container_template.find( 'a:first' ).addClass( VICINITY_LINK_CLASS ).html( LINK_ICON_SVG );
            
            return ( options ) => {
                options = ( options ) ? options : {};
                
                var tweet_id = options.tweet_id || '',
                    reaction_key = options.reaction_key || '',
                    class_name = options.class_name,
                    title,
                    text,
                    css = options.css,
                    attributes = options.attributes,
                    $link_container = $link_container_template.clone( true ),
                    $link = $link_container.find( 'a:first' );
                
                $link.attr( {
                    'data-tweet_id' : tweet_id,
                    'data-reaction_key' : reaction_key,
                } );
                
                if ( reaction_key ) {
                    $link_container.addClass( ACT_CONTAINER_CLASS );
                    title = OPTIONS.ACT_LINK_TITLE;
                    text = OPTIONS.ACT_LINK_TEXT;
                }
                else {
                    $link_container.addClass( SELF_CONTAINER_CLASS );
                    title = OPTIONS.LINK_TITLE;
                    text = OPTIONS.LINK_TEXT;
                }
                
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
                    
                    var reacted_tweet_info = get_stored_tweet_info( tweet_id ),
                        reaction_info = get_stored_reaction_info( reaction_key ),
                        target_info = {},
                        act_screen_name = '',
                        event_element = '',
                        search_parameters = {
                            use_user_timeline : ! ( OPTIONS.USE_SEARCH_TL_BY_DEFAULT ^ ( event.shiftKey || event.altKey || event.ctrlKey ) ),
                        };
                    
                    if ( reaction_info ) {
                        act_screen_name = reaction_info.screen_name;
                        
                        switch ( reaction_info.reaction_name ) {
                            case 'retweet' :
                                event_element = 'user_retweeted';
                                break;
                            
                            case 'like' :
                                event_element = 'user_liked';
                                break;
                            
                            case 'dm' :
                                event_element = 'user_directmessage';
                                break;
                        }
                    }
                    
                    Object.assign( search_parameters, {
                        act_screen_name : act_screen_name,
                        event_element : event_element,
                    } );
                    
                    if ( ! reacted_tweet_info ) {
                        reacted_tweet_info = {
                            id : '',
                            screen_name : reaction_info.screen_name,
                            timestamp_ms : reaction_info.timestamp_ms,
                        };
                        
                        Object.assign( target_info, reaction_info );
                        
                        Object.assign( search_parameters, {
                            reacted_tweet_info : reacted_tweet_info,
                            target_info : target_info,
                        } );
                        
                        open_search_window( search_parameters );
                        return;
                    }
                    
                    var screen_name = reacted_tweet_info.screen_name,
                        tweet_url = 'https://twitter.com/' + screen_name + '/status/' + tweet_id;
                    
                    target_info.tweet_url = tweet_url;
                    
                    if ( reaction_info ) {
                        Object.assign( target_info, reaction_info );
                    }
                    else {
                        Object.assign( target_info, reacted_tweet_info );
                    }
                    
                    Object.assign( search_parameters, {
                        reacted_tweet_info : reacted_tweet_info,
                        target_info : target_info,
                    } );
                    
                    
                    log_debug( 'search_parameters:', search_parameters );
                    
                    open_search_window( search_parameters );
                } );
                
                return $link_container;
            };
        } )(), // end of create_vicinity_link_container()
        
        add_vicinity_links_to_tweet = ( $tweet ) => {
            update_stored_tweet_info( $tweet );
            
            var tweet_id = $tweet.attr( 'data-tweet-id' ),
                reaction_key = $tweet.attr( 'data-key' ),
                is_tweet_detail = ( 0 < $tweet.find( '.tweet-detail' ).length );
            
            $tweet.addClass( TOUCHED_CLASS );
            
            ( () => {
                // ツイート近傍リンク挿入
                var tweet_info = get_stored_tweet_info( tweet_id );
                
                if ( ! tweet_info ) {
                    return;
                }
                
                var screen_name = tweet_info.screen_name,
                    timestamp_ms = tweet_info.timestamp_ms,
                    
                    tweet_url = 'https://twitter.com/' + screen_name + '/status/' + tweet_id,
                    
                    $link_container = create_vicinity_link_container( {
                        tweet_id : tweet_id,
                    } ),
                    $link = $link_container.find( 'a:first' ),
                    $header,
                    $time;
                                    
                if ( is_tweet_detail ) {
                    $link_container.addClass( 'large' ).css( {
                        'position' : 'absolute',
                        'top' : '8px',
                        'right' : '24px',
                    } );
                    $link.css( {
                        'background-color' : ( is_night_mode() ) ? '#15202b' : '#ffffff',
                        'border-radius' : '12px',
                        'padding' : '4px',
                    } );
                    $header = $tweet.find( '.tweet-detail .account-summary' );
                    $header.append( $link_container );
                }
                else {
                    $link_container.addClass( 'middle' ).css( {
                        'float' : 'right',
                    } );
                    $time = $tweet.find( 'header time:first' );
                    $time.after( $link_container );
                }
            } ) ();
            
            ( () => {
                // ユーザーアクション（リツイート／いいね）の近傍リンク挿入
                var reaction_info = get_stored_reaction_info( reaction_key );
                
                if ( ( ! reaction_info ) || ( ! reaction_info.timestamp_ms ) ) {
                    return;
                }
                
                var reaction_name = reaction_info.reaction_name;
                
                switch ( reaction_name ) {
                    case 'retweet' :
                    case 'like' :
                    case 'dm' :
                        break;
                    
                    default :
                        return;
                }
                
                var reaction_timestamp_ms = reaction_info.timestamp_ms;
                
                if ( ( ! reaction_info.id ) && ( ! reaction_timestamp_ms ) ) {
                    return;
                }
                
                var $link_container = create_vicinity_link_container( {
                        tweet_id : tweet_id,
                        reaction_key : reaction_key,
                    } ),
                    $link = $link_container.find( 'a:first' ),
                    $header;
                
                if ( is_tweet_detail ) {
                    // 個別表示の場合はユーザーアクションは表示されない
                }
                else {
                    $link_container.addClass( 'middle' );
                    
                    if ( reaction_name == 'dm' ) {
                        $link_container.css( {
                            'margin' : '8px 0 0 2px',
                        } );
                        $header = $tweet.find( 'header.tweet-header .account-link .tweet-img:first' );
                    }
                    else {
                        $link_container.css( {
                            'margin-right' : '4px',
                        } );
                        $header = $tweet.find( '.activity-header .nbfc:first, .tweet .tweet-context .nbfc:first' );
                    }
                    $header.append( $link_container );
                }
            } )();
            
        }; // end of add_vicinity_links_to_tweet()
    
    return add_vicinity_links_to_tweet;
} )(); // end of add_vicinity_links_to_tweet()


function check_timeline_tweets( node ) {
    if ( ( ! node ) || ( node.nodeType != 1 ) ) {
        return false;
    }
    
    var $node = $( node ),
        $tweets = $( 'article[data-tweet-id]' ).filter( function () {
            var $tweet = $( this );
            
            return ( ( ! $tweet.hasClass( TOUCHED_CLASS ) ) && ( $tweet.find( '.' + VICINITY_LINK_CONTAINER_CLASS ).length <= 0 ) );
        } );
    
    $tweets = $tweets.filter( function ( index ) {
        var $tweet = $( this );
        
        return add_vicinity_links_to_tweet( $tweet );
    } );
    
    return ( 0 < $tweets.length );
} // end of check_timeline_tweets()


function check_help_dialog() {
    var $help_dialog = $( '.js-modals-container .overlay .keyboard-shortcut-list-modal' ).filter( function () {
            return ( ! $( this ).hasClass( TOUCHED_CLASS ) );
        } );
    
    if ( $help_dialog.length <= 0 ) {
        return;
    }
    
    var key_info_list = [
            { label : OPTIONS.LINK_TITLE, key : OPTIONS.HELP_OPEN_LINK_KEYCHAR  },
            { label : OPTIONS.ACT_LINK_TITLE, key : OPTIONS.HELP_OPEN_ACT_LINK_KEYCHAR },
        ];
    
    key_info_list.forEach( ( key_info ) => {
        var $keyboard_shortcut_list = $help_dialog.find( 'dl.keyboard-shortcut-list:first' ),
            $dd = $( '<dd><kbd/></dd>' ).addClass( 'keyboard-shortcut-definition' ),
            $kbd = $dd.find( 'kbd:first' ).addClass( 'text-like-keyboard-key' );
        
        $kbd.append( key_info.key.toUpperCase() );
        $dd.append( ' ' + key_info.label );
        
        $keyboard_shortcut_list.append( $dd );
    } );
    
    $help_dialog.addClass( TOUCHED_CLASS );
} // end of check_help_dialog()


function start_key_observer() {
    var is_key_acceptable = () => {
            var $active_element = $( d.activeElement );
            
            if ( (
                    ( ( $active_element.hasClass( 'tweet-box' ) ) || ( $active_element.attr( 'role' ) == 'textbox' ) || ( $active_element.attr( 'name' ) == 'tweet' ) ) &&
                    ( $active_element.attr( 'contenteditable' ) == 'true' )
                ) ||
                ( $active_element.prop( 'tagName' ) == 'TEXTAREA' ) ||
                ( ( $active_element.prop( 'tagName' ) == 'INPUT' ) && ( $active_element.attr( 'type' ).toUpperCase() == 'TEXT' ) )
            ) {
                return false;
            }
            return true;
        }, // end of is_key_acceptable()
        
        search_and_click_button_on_stream_item = ( event, button_selector ) => {
            var $target_element = $( 'article.is-selected-tweet' ).first(),
                $button = $target_element.find( button_selector ).filter( ':visible' ).first();
            
            if ( 0 < $button.length ) {
                $button.click();
                
                event.stopPropagation();
                event.preventDefault();
            }
            
            return false;
        }; // end of search_and_click_button_on_stream_item()
    
    $( d.body )
    .on( 'keydown.main', function ( event ) {
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
        }
    } );
} // end of start_key_observer()


function start_mutation_observer() {
    new MutationObserver( function ( records ) {
        log_debug( '*** MutationObserver ***', records );
        
        update_display_mode();
        
        check_timeline_tweets( d.body );
        
        check_help_dialog();
    } ).observe( d.body, { childList : true, subtree : true } );
} // end of start_mutation_observer()


function insert_vicinity_links() {
    check_timeline_tweets( d.body );
} // end of insert_vicinity_links()


function set_user_css() {
    var night_mode_selector = 'body[data-nightmode="true"]',
        vicinity_link_container_selector = 'div.' + VICINITY_LINK_CONTAINER_CLASS,
        vicinity_link_container_self_selector = 'div.' + SELF_CONTAINER_CLASS,
        vicinity_link_container_act_selector = 'div.' + ACT_CONTAINER_CLASS,
        vicinity_link_selector = 'div > a.' + VICINITY_LINK_CLASS,
        vicinity_link_self_selector = vicinity_link_container_self_selector + ' > a.' + VICINITY_LINK_CLASS,
        vicinity_link_act_selector = vicinity_link_container_act_selector + ' > a.' + VICINITY_LINK_CLASS,
        
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
                'color : ' + OPTIONS.LINK_ICON_COLOR,
            ].join( '; ' ) + ';}',
            
            vicinity_link_container_selector + '.icon a:hover {' + [
                'color : ' + OPTIONS.LINK_ICON_COLOR_HOVER,
            ].join( '; ' ) + ';}',
            
            night_mode_selector + ' ' + vicinity_link_container_selector + '.icon a {color: ' + OPTIONS.LINK_ICON_COLOR_NIGHTMODE + ';}',
            night_mode_selector + ' ' + vicinity_link_container_selector + '.icon a:hover {color: ' + OPTIONS.LINK_ICON_COLOR_HOVER_NIGHTMODE + ';}',
            
            vicinity_link_container_selector + '.icon a svg {width: 100%; height: auto;}',
            
            vicinity_link_container_selector + '.middle a {}',
            vicinity_link_container_selector + '.middle.icon a {width: 16px; height: 16px;}',
            vicinity_link_container_selector + '.middle.text a {}',
            
            vicinity_link_container_selector + '.large a {}',
            vicinity_link_container_selector + '.large.icon a {width: 20px; height: 20px;}',
            vicinity_link_container_selector + '.larget.text a {}',
        ];
    
    $( 'style.' + SCRIPT_NAME + '-css-rule' ).remove();
    
    insert_css( css_rule_lines.join( '\n' ) );

} // end of set_user_css()


function initialize( user_options ) {
    if ( user_options ) {
        Object.keys( user_options ).forEach( function ( name ) {
            if ( user_options[ name ] === null ) {
                return;
            }
            OPTIONS[ name ] = user_options[ name ];
        } );
    }
    
    if ( ( ! OPTIONS.OPERATION ) || ( ! OPTIONS.ENABLED_ON_TWEETDECK ) ) {
        return;
    }
    
    ID_THRESHOLD = new Decimal( ID_THRESHOLD );
    
    log_debug( 'ID_INC_PER_SEC =', ID_INC_PER_SEC.toString() );
    log_debug( 'ID_THRESHOLD =', ID_THRESHOLD.toString() );
    
    set_user_css();
    insert_vicinity_links();
    start_mutation_observer();
    start_key_observer();
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
