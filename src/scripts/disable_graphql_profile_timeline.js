( () => {
const
    DEBUG = true;

if ( ! /^https:\/\/(?:mobile\.)?twitter\.com\/([^\/]+)\/with_replies.*?[?&](?:max_id|max_position)=(\d*)/.test( location.href ) ) {
    return;
}

if ( DEBUG ) {
    document.documentElement.dataset.twdvDebug = DEBUG;
}

// [2021.06.29] 0.3.2.25 にて /api/graphql/*/UserTweetsAndReplies にとりあえず対応したのでパッチは実施しないように変更
//window.inject_script_sync( 'scripts/feature_switch.js' );
} )();
