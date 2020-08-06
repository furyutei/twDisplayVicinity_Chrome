( () => {
'use strict';

var SCRIPT_NAME = 'twDisplayVicinity_React';

window.make_fetch_wrapper( { // make_fetch_wrapper() は scripts/fetch_wrapper.js 内にて定義
    SCRIPT_NAME : SCRIPT_NAME,
    API_USER_TIMELINE_TEMPLATE : 'https://api.twitter.com/1.1/statuses/user_timeline.json?count=#COUNT#&include_my_retweet=1&include_rts=1&cards_platform=Web-13&include_entities=1&include_user_entities=1&include_cards=1&send_error_codes=1&tweet_mode=extended&include_ext_alt_text=true&include_reply_count=true',
    OBSERVATION_WRAPPER_ID : SCRIPT_NAME + '-observation_wrapper',
    OBSERVE_DOM_FETCH_DATA : false,
} );

} )();
