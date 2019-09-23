( ( w, d ) => {
'use strict';

w.chrome = ( ( typeof browser != 'undefined' ) && browser.runtime ) ? browser : chrome;

Object.assign( w, ( () => {
    var injected_scripts = [],
        callback_functions = [],
        load_completion_counter = 0,
        
        do_callback = () => {
            if ( load_completion_counter < injected_scripts.length ) {
                return;
            }
            callback_functions.forEach( ( callback ) => {
                callback( injected_scripts );
            } );
            callback_functions = [];
        },
        
        inject_script = ( js_path ) => {
            var script = d.createElement( 'script' ),
                script_nonce = d.querySelector( 'script[nonce]' ),
                nonce = ( script_nonce ) ? script_nonce.getAttribute( 'nonce' ) : '';
            
            script.async = true;
            script.src = chrome.extension.getURL( js_path );
            if ( nonce ) {
                script.setAttribute( 'nonce', nonce );
            }
            script.addEventListener( 'load', function ( event ) {
                script.remove();
                load_completion_counter ++;
                do_callback();
            } );
            
            injected_scripts.push( js_path );
            
            d.documentElement.appendChild( script );
        }, // end of inject_script()
        
        inject_script_all = ( ( scripts ) => {
            scripts.forEach( ( script ) => {
                inject_script( script );
            } );
        } ),
        
        external_script_injection_ready = ( callback ) => {
            callback_functions.push( callback );
            do_callback();
        };
    
    return {
        inject_script : inject_script,
        inject_script_all : inject_script_all,
        external_script_injection_ready : external_script_injection_ready,
    };
} )() );

} )( window, document );
