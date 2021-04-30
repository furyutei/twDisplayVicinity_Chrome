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
