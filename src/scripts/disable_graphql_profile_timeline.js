( () => {

if ( ! /^https:\/\/(?:mobile\.)?twitter\.com\/([^\/]+)\/with_replies.*?[?&](?:max_id|max_position)=(\d*)/.test( location.href ) ) {
    return;
}

let observer = new MutationObserver( ( records ) => {
        records.forEach( record => {
            if ( Array.from( record.addedNodes ).filter( node => ( node.tagName == 'SCRIPT' ) && /window\.__SCRIPTS_LOADED__/.test( node.textContent ) ).length <= 0 ) {
                return;
            }
            
            observer.disconnect();
            
            // https://api.twitter.com/graphql/ を使用させないようにパッチ
            if ( 0 <= window.navigator.userAgent.toLowerCase().indexOf( 'firefox' ) ) {
                // 2020.08.06: Firefox でインラインスクリプトが実行できなくなったため、外部スクリプトとして呼び出し
                window.inject_script_sync( 'scripts/feature_switch.js' );
            }
            else {
                window.inject_code_sync( [
                    //"console.log( '*** START PATCH ***', window.__INITIAL_STATE__.featureSwitch.config );",
                    //"console.log( JSON.stringify( window.__INITIAL_STATE__, null, 4 ) );",
                    //"delete window.__INITIAL_STATE__.featureSwitch.config.responsive_web_graphql_profile_timeline_8331;",
                    "Object.keys( window?.__INITIAL_STATE__?.featureSwitch?.config || {} ).forEach( key => {",
                    "   if ( key.indexOf( 'responsive_web_graphql_profile_timeline' ) < 0 ) return;",
                    //"   console.log( '- hit key name: ', key );"
                    "   delete window.__INITIAL_STATE__.featureSwitch.config[ key ];",
                    "} );",
                ].join( '\n' ) );
            }
        } );
    } );

observer.observe( document, { childList: true, subtree: true } );
} )();
