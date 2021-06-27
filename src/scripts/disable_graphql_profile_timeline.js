( () => {
const
    DEBUG = false;

if ( ! /^https:\/\/(?:mobile\.)?twitter\.com\/([^\/]+)\/with_replies.*?[?&](?:max_id|max_position)=(\d*)/.test( location.href ) ) {
    return;
}

if ( DEBUG ) {
    document.documentElement.dataset.twdvDebug = DEBUG;
}

window.inject_script_sync( 'scripts/feature_switch.js' );
} )();
