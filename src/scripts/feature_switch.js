( () => {
'use strict';

//console.log( '*** START PATCH ***', window.__INITIAL_STATE__.featureSwitch.config );
//console.log( JSON.stringify( window.__INITIAL_STATE__, null, 4 ) );
//delete window.__INITIAL_STATE__.featureSwitch.config.responsive_web_graphql_profile_timeline_8331;
Object.keys( window.__INITIAL_STATE__.featureSwitch.config ).forEach( key => {
    if ( key.indexOf( 'responsive_web_graphql_profile_timeline' ) < 0 ) return;
    //console.log( '- hit key name: ', key );
    delete window.__INITIAL_STATE__.featureSwitch.config[ key ];
} );

} )();
