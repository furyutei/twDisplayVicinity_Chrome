( () => {
const
    DEBUG = false;

if ( ! /^https:\/\/(?:mobile\.)?twitter\.com\/([^\/]+)\/with_replies.*?[?&](?:max_id|max_position)=(\d*)/.test( location.href ) ) {
    return;
}

if ( DEBUG ) {
    document.documentElement.dataset.twdvDebug = DEBUG;
}

const
    observer = new MutationObserver( ( records ) => {
        records.forEach( record => {
            if ( Array.from( record.addedNodes ).filter( node => ( node.tagName == 'SCRIPT' ) && /window\.__SCRIPTS_LOADED__/.test( node.textContent ) ).length <= 0 ) {
                return;
            }
            
            observer.disconnect();
            
            // ■ https://api.twitter.com/graphql/ を使用させないようにパッチ
            
            if ( 0 <= window.navigator.userAgent.toLowerCase().indexOf( 'firefox' ) ) {
                // 2020.08.06: Firefox でインラインスクリプトが実行できなくなったため、外部スクリプトとして呼び出し
                // 2021.04.30: Firefox 88.0 (64 ビット) ではインラインスクリプトが実行できるようになっている模様
                window.inject_script_sync( 'scripts/feature_switch.js' );
                return;
            }
            
            window.inject_code_sync( `
                ( () => {
                    'use strict';
                    
                    const
                        DEBUG = document.documentElement.dataset.twdvDebug,
                        featureSwitch = window.__INITIAL_STATE__?.featureSwitch;
                    
                    if ( DEBUG ) {
                        console.debug( '*** START PATCH ***', featureSwitch );
                        console.debug( 'window.__INITIAL_STATE__ = ', JSON.stringify( window.__INITIAL_STATE__, null, 4 ) );
                    }
                    if ( ! featureSwitch ) {
                        console.error( '[twDisplayVicinity] featureSwitch not found' );
                        return;
                    }
                    
                    try {
                        if ( DEBUG ) console.debug( 'featureSwitch.defaultConfig.responsive_web_graphql_profile_timeline.value:', featureSwitch.defaultConfig.responsive_web_graphql_profile_timeline.value, '=>', false );
                        featureSwitch.defaultConfig.responsive_web_graphql_profile_timeline.value = false;
                    }
                    catch ( error ) {
                        console.error( '[twDisplayVicinity]', error );
                    }
                    
                    try {
                        if ( DEBUG ) console.debug( 'featureSwitch.user.config.responsive_web_graphql_profile_timeline.value:', featureSwitch.user.config.responsive_web_graphql_profile_timeline.value, '=>', false );
                        featureSwitch.user.config.responsive_web_graphql_profile_timeline.value = false;
                    }
                    catch ( error ) {
                        console.error( '[twDisplayVicinity]', error );
                    }
                } )();
            ` );
        } );
    } );

observer.observe( document, { childList: true, subtree: true } );
} )();
