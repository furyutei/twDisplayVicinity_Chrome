( function ( w, d ) {

'use strict';

w.chrome = ( ( typeof browser != 'undefined' ) && browser.runtime ) ? browser : chrome;

if ( chrome.runtime.lastError ) {
    console.log( '* chrome.runtime.lastError.message:', chrome.runtime.lastError.message );
}


// 外部スクリプトを content_scripts 内に挿入
inject_script_all( [
    'scripts/intercept_xhr.js',
    'scripts/decimal.min.js',
    'scripts/jquery.min.js',
] );


// Firefox(バージョン58以降)では、アドオンの content_scripts 内で XMLHttpRequest や fetch にページ（コンテンツ）上から実行されたのと同じ動作を期待するためには
// window.XMLHttpRequest や window.fetch の代わりに content.XMLHttpRequest や content.fetch を使う必要あり
// 参考：[Firefox のアドオン(content_scripts)でXMLHttpRequestやfetchを使う場合の注意 - 風柳メモ](https://memo.furyutei.work/entry/20180718/1531914142)
if ( ( typeof content != 'undefined' ) && ( typeof content.XMLHttpRequest == 'function' ) ) {
    jQuery.ajaxSetup( {
        xhr : function () {
            try {
                return new content.XMLHttpRequest();
            } catch ( e ) {}
        }
    } );
}


function get_bool( value ) {
    if ( value === undefined ) {
        return null;
    }
    if ( ( value === '0' ) || ( value === 0 ) || ( value === false ) || ( value === 'false' ) ) {
        return false;
    }
    if ( ( value === '1' ) || ( value === 1 ) || ( value === true ) || ( value === 'true' ) ) {
        return true;
    }
    return null;
}  // end of get_bool()


function get_int( value ) {
    if ( isNaN( value ) ) {
        return null;
    }
    return parseInt( value, 10 );
} // end of get_int()


function get_text( value ) {
    if ( value === undefined ) {
        return null;
    }
    return String( value );
} // end of get_text()


function get_init_function( message_type, option_name_to_function_map, namespace ) {
    var option_names = [];
    
    for ( var option_name in option_name_to_function_map ) {
        if ( option_name_to_function_map.hasOwnProperty( option_name ) ) {
            option_names.push( option_name );
        }
    }
    
    function analyze_response( response ) {
        var options = {};
        
        if ( ! response ) {
            response = {};
        }
        
        for ( var option_name in option_name_to_function_map ) {
            if ( ! ( response.hasOwnProperty( option_name ) ) ) {
                options[ option_name ] = null;
                continue;
            }
            options[ option_name ] =  option_name_to_function_map[ option_name ]( response[ option_name ] );
        }
        return options;
    }
    
    function init( callback ) {
        // https://developer.chrome.com/extensions/runtime#method-sendMessage
        chrome.runtime.sendMessage( {
            type : message_type
        ,   names : option_names
        ,   namespace :  ( namespace ) ? namespace : ''
        }, function ( response ) {
            var options = analyze_response( response );
            
            // 外部スクリプトの挿入完了を待つ
            external_script_injection_ready( ( injected_scripts ) => {
                callback( options );
            } );
        } );
    }
    
    return init;
} // end of get_init_function()


// ■ content_scripts の情報を background に渡す
chrome.runtime.sendMessage( {
    type : 'NOTIFICATION_ONLOAD',
    info : {
        url : location.href,
    }
}, function ( response ) {
    /*
    //window.addEventListener( 'beforeunload', function ( event ) {
    //    // TODO: メッセージが送信できないケース有り ("Uncaught TypeError: Cannot read property 'sendMessage' of undefined")
    //    chrome.runtime.sendMessage( {
    //        type : 'NOTIFICATION_ONUNLOAD',
    //        info : {
    //            url : location.href,
    //            event : 'onbeforeunload',
    //        }
    //    }, function ( response ) {
    //    } );
    //} );
    */
} );


// ■ background からのメッセージ受付
chrome.runtime.onMessage.addListener( function ( message, sender, sendResponse ) {
    switch ( message.type )  {
        case 'RELOAD_REQUEST' :
            sendResponse( {
                result : 'OK'
            } );
            
            setTimeout( () => {
                location.reload();
            }, 100 );
            break;
    }
    return true;
} );


var twDisplayVicinity_chrome_init = ( function() {
    var option_name_to_function_map = {
            OPERATION : get_bool
        ,   ENABLED_ON_TWEETDECK : get_bool
        ,   USE_SEARCH_TL_BY_DEFAULT : get_bool
        ,   HIDE_NEWER_TWEETS : get_bool
        ,   USE_LINK_ICON : get_bool
        ,   IGNORE_SINCE : get_bool
        ,   ENABLE_RECENT_RETWEET_USERS_BUTTON : get_bool
        ,   CACHE_OAUTH2_ACCESS_TOKEN : get_bool
        
        ,   HOUR_BEFORE : get_int
        ,   HOUR_AFTER : get_int
        ,   DAY_BEFORE : get_int
        ,   DAY_AFTER : get_int
        ,   MAX_USER_NUMBER : get_int
        ,   MAX_AFTER_RETWEET_MINUTES : get_int
        ,   MAX_BEFORE_RETWEET_MINUTES : get_int
        
        ,   TARGET_TWEET_COLOR : get_text
        ,   TARGET_TWEET_COLOR_NIGHTMODE : get_text
        ,   VICINITY_TWEET_COLOR : get_text
        ,   VICINITY_TWEET_COLOR_NIGHTMODE : get_text
        ,   LINK_COLOR : get_text
        ,   ACT_LINK_COLOR : get_text
        ,   LINK_TEXT : get_text
        ,   LINK_TITLE : get_text
        ,   ACT_LINK_TEXT : get_text
        ,   ACT_LINK_TITLE : get_text
        ,   GO_TO_PAST_TEXT : get_text
        };
        
    return get_init_function( 'GET_OPTIONS', option_name_to_function_map );
} )(); // end of twDisplayVicinity_chrome_init()


w.is_web_extension = true;
w.twDisplayVicinity_chrome_init = twDisplayVicinity_chrome_init;

} )( window, document );

// ■ end of file
