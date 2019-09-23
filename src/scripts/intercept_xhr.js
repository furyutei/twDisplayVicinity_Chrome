// ■ XMLHttpRequest の responseText を URL に応じて置換
//   ※参考: [javascript - How can I modify the XMLHttpRequest responsetext received by another function? - Stack Overflow](https://stackoverflow.com/questions/26447335/how-can-i-modify-the-xmlhttprequest-responsetext-received-by-another-function#answer-43144531)

( ( original_prototype_open ) => {
'use strict';

var configs = [ {
    reg_url : /^/,
    url_filter : null,
    response_filter : null,
} ];

window.XMLHttpRequest.prototype.open = function ( method, url, async, user, password ) {
    var xhr = this,
        called_url = url,
        replaced_url = url,
        config = configs.slice().reverse().filter( config => config.reg_url.test( url || '' ) )[ 0 ],
        url_filter = config.url_filter,
        response_filter = config.response_filter;
    
    if ( typeof url_filter == 'function' ) {
        arguments[ 1 ] = replaced_url = url_filter( url || '' );
        
        if ( typeof response_filter != 'function' ) {
            response_filter = ( original_responseText, replaced_url, called_url, original_responseURL ) => original_responseText;
        }
    }
    xhr._called_url = called_url;
    xhr._replaced_url = replaced_url;
    
    if ( async !== false ) {
        if ( typeof response_filter == 'function' ) {
            xhr.addEventListener( 'readystatechange', function ( event ) {
                if ( xhr.readyState != 4 ) {
                    return;
                }
                var original_responseURL = event.target.responseURL,
                    original_responseText = event.target.responseText,
                    // ※ Object.defineProperty() コール前に保存（defineProperty() コール時点で元の responseText にはアクセス不可となることに注意）
                    filterd_responseText = response_filter( original_responseText, replaced_url, called_url, original_responseURL );
                
                Object.defineProperty( xhr, 'responseURL', {writable: true} );
                xhr.responseURL = called_url;
                xhr._original_responseURL = original_responseURL;
                
                Object.defineProperty( xhr, 'responseText', {writable: true} );
                xhr.responseText = filterd_responseText;
                xhr._original_responseText = original_responseText;
            } );
        }
    }
    
    return original_prototype_open.apply( xhr, arguments );
};

window.intercept_xhr_response = ( reg_url, url_filter, response_filter ) => {
    configs.push( {
        reg_url : reg_url,
        url_filter : url_filter,
        response_filter : response_filter,
    } );
};

} )( window.XMLHttpRequest.prototype.open );
