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
            window.inject_code_sync( [
                //"console.log( '*** START PATCH ***', window.__INITIAL_STATE__.featureSwitch.config );",
                //"delete window.__INITIAL_STATE__.featureSwitch.config.responsive_web_graphql_profile_timeline_8331;",
                "Object.keys( window.__INITIAL_STATE__.featureSwitch.config ).forEach( key => {",
                "   if ( key.indexOf( 'responsive_web_graphql_profile_timeline' ) < 0 ) return;",
                //"   console.log( key );",
                "   delete window.__INITIAL_STATE__.featureSwitch.config[ key ];",
                "} );",
            ].join( '\n' ) );
        } );
    } );

observer.observe( document, { childList: true, subtree: true } );
} )();
