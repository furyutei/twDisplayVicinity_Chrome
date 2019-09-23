( function ( w, d ) {

'use strict';

w.chrome = ( ( typeof browser != 'undefined' ) && browser.runtime ) ? browser : chrome;


var DEBUG = false,
    CONTENT_TAB_INFOS = {};


function log_debug() {
    if ( ! DEBUG ) {
        return;
    }
    console.log.apply( console, arguments );
} // end of log_debug()


function log_error() {
    console.error.apply( console, arguments );
} // end of log_error()


w.log_debug = log_debug;
w.log_error = log_error;


var reload_tabs = ( () => {
    var reg_host = /([^.]+\.)?twitter\.com/,
        
        reload_tab = ( tab_info ) => {
            log_debug( 'reload_tab():', tab_info );
            var tab_id = tab_info.tab_id;
            
            /*
            // TODO: 既に別のページに遷移していてもリロードをかけてしまう
            //chrome.tabs.reload( tab_id, () => {
            //    if ( chrome.runtime.lastError ) {
            //        delete CONTENT_TAB_INFOS[ tab_id ];
            //        log_debug( 'tab does not exist: tab_id=', tab_id, '=> removed:', tab_info, '=> remained:', CONTENT_TAB_INFOS );
            //    }
            //} );
            */
            chrome.tabs.sendMessage( tab_id, {
                type : 'RELOAD_REQUEST',
            }, {
            }, ( response ) => {
                log_debug( 'response', response );
                if ( chrome.runtime.lastError || ( ! response ) ) {
                    // タブが存在しないか、応答が無ければ chrome.runtime.lastError 発生→タブ情報を削除
                    // ※chrome.runtime.lastErrorをチェックしないときは Console に "Unchecked runtime.lastError: No tab with id: xxxx." 表示
                    delete CONTENT_TAB_INFOS[ tab_id ];
                    log_debug( 'tab or content_script does not exist: tab_id=', tab_id, '=> removed:', tab_info, '=> remained:', CONTENT_TAB_INFOS );
                }
            } );
        };
    
    return () => {
        log_debug( 'reload_tabs():', CONTENT_TAB_INFOS );
        Object.values( CONTENT_TAB_INFOS ).forEach( ( tab_info ) => {
            log_debug( tab_info );
            
            try {
                if ( ! reg_host.test( new URL( tab_info.url ).host ) ) {
                    return;
                }
            }
            catch ( error ) {
                return;
            }
            
            reload_tab( tab_info );
        } );
    };
} )();

w.reload_tabs = reload_tabs;


// メッセージ待ち受け
// https://developer.chrome.com/extensions/runtime#event-onMessage
chrome.runtime.onMessage.addListener( function ( message, sender, sendResponse ) {
    var type = message.type,
        response = null,
        tab_id = sender.tab && sender.tab.id;
    
    if ( ( sender.id != chrome.runtime.id ) || ( ! sender.tab ) || ( ! sender.tab.id ) ) {
        sendResponse( response );
        return;
    }
    
    switch ( type ) {
        case 'GET_OPTIONS' :
            ( ( names, namespace ) => {
                response = {};
                
                if ( typeof name_list == 'string' ) {
                    names = [ names ];
                }
                
                Array.apply( null, names ).forEach( function( name ) {
                    name = String( name );
                    response[ name ] = localStorage[ ( ( namespace ) ? ( String( namespace ) + '_' ) : '' ) + name ];
                } );
            } )( message.names, message.namespace );
            break;
        
        case 'RELOAD_TABS':
            reload_tabs();
            break;
        
        case 'NOTIFICATION_ONLOAD' :
            log_debug( 'NOTIFICATION_ONLOAD: tab_id', tab_id, message );
            if ( tab_id ) {
                CONTENT_TAB_INFOS[ tab_id ] = Object.assign( message.info, {
                    tab_id : tab_id,
                } );
            }
            log_debug( '=> CONTENT_TAB_INFOS', CONTENT_TAB_INFOS );
            break;
        
        case 'NOTIFICATION_ONUNLOAD' :
            log_debug( 'NOTIFICATION_ONUNLOAD: tab_id', tab_id, message );
            if ( tab_id ) {
                delete CONTENT_TAB_INFOS[ tab_id ];
            }
            log_debug( '=> CONTENT_TAB_INFOS', CONTENT_TAB_INFOS );
            break;
        
        case 'FETCH_JSON' :
            log_debug( 'FETCH_JSON', message );
            
            fetch( message.url, message.options )
            .then( response => response.json() )
            .then( ( json ) => {
                log_debug( 'FETCH_JSON => json', json );
                
                sendResponse( {
                    json : json,
                } );
            } )
            .catch( ( error ) => {
                log_error( 'FETCH_JSON => error', error );
                
                sendResponse( {
                    error : error,
                } );
            } );
            return true;
        
        default:
            break;
    }
    
    sendResponse( response );
    
    return true;
} );


// WebRequest

// HTTP Request ヘッダの取得＆書換
// ※有効にする場合は、 manifest.json に
//   "permissions": [ "webRequest", "webRequestBlocking", "*://*.twitter.com/*" ]
//   を追加すること。
//   またあわせて、"background" の "persistent" は true にすること
//   （false のままだと、manifest.json 読み込み時に、"The 'webRequest' API cannot be used with event pages." エラーが出る）
// ※ [Cookie 変更時には、'extraHeaders' が必要（Chrome>=72）](https://twitter.com/furyutei/status/1102718008919646209)

var reg_oauth2_token_url = /^https:\/\/api\.twitter\.com\/oauth2\/token/,
    reg_legacy_mark_url = /[?&]__twdv=legacy(?:&|$)/;

chrome.webRequest.onBeforeSendHeaders.addListener(
    function ( details ) {
        var requestHeaders,
            url = details.url;
        
        if ( reg_oauth2_token_url.test( url ) ) {
            // ※ OAuth2 の token 取得時(api.twitter.com/oauth2/token)に Cookie を送信しないようにする
            requestHeaders = details.requestHeaders.filter( function ( element, index, array ) {
                return ( element.name.toLowerCase() != 'cookie' );
            } );
        }
        else if ( reg_legacy_mark_url.test( url ) ) {
            // ※ "__twdv=legacy" が付いている場合、旧 Twitter の HTML / API をコールするために User-Agent を変更
            requestHeaders = details.requestHeaders.map( function ( element ) {
                if ( element.name.toLowerCase() == 'user-agent' ) {
                    //element.value = 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko';
                    element.value = 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) Waterfox/56.2';
                    // 参考：[ZusorCode/GoodTwitter](https://github.com/ZusorCode/GoodTwitter)
                }
                return element;
            } );
        }
        
        return ( ( requestHeaders !== undefined ) ? { requestHeaders : requestHeaders } : {} );
    },
    { urls : [ '*://*.twitter.com/*' ] },
    [ 'blocking', 'requestHeaders', 'extraHeaders' ]
);

} )( window, document );

// ■ end of file
