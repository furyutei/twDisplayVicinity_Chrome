// window.XMLHttpRequest / window.fetch にパッチをあてて、Twitter クライアントの Web API コールの結果を取得・置換し、拡張機能側に送信

// TODO: [Chrome 拡張機能では、HTTP Response Body を取得する汎用的な方法が用意されていない](https://stackoverflow.com/questions/10393638/chrome-extensions-other-ways-to-read-response-bodies-than-chrome-devtools-netw)
// ※ chrome.webRequest.onCompleted では Response Headers は取得できても Body は取得できない
// ※ chrome.devtools.network.onRequestFinished では、開発者ツールを開いていないと取得できない
// → コンテンツに script を埋め込み、XMLHttpRequest / fetch にパッチをあてて取得

window.make_fetch_wrapper = ( params ) => {
    if ( ! params ) {
        params = {};
    }
    
    var required_promises = [],
        
        {
            convert_tweet_id_to_cursor,
            convert_cursor_to_tweet_id,
        } = ( () => {
            const
                num_to_dec64_char_map = Array( 64 ).fill().map( ( _, i ) => {
                    if ( 0 <= i && i <= 25 ) return String.fromCharCode( 'A'.charCodeAt( 0 ) + i );
                    if ( 26 <= i && i <= 51 ) return String.fromCharCode( 'a'.charCodeAt( 0 ) + ( i - 26 ) );
                    if ( 52 <= i && i <= 61 ) return '' + ( i - 52 );
                    if ( i == 62 ) return '+';
                    return '/';
                } ),
                
                dec64_char_to_num_map = num_to_dec64_char_map.reduce( ( map, dec64_char, i ) => {
                    map[ dec64_char ] = i;
                    return map;
                }, {} ),
                
                to_binary = ( () => {
                    let to_binary;
                    
                    if ( typeof Decimal.prototype.toBinary == 'function' ) {
                        // MikeMcl/decimal.js の場合、toString(2) では変換できない
                        return ( decimal_object ) => {
                            return decimal_object.toBinary().replace( /^0b/, '' );
                        };
                    }
                    else {
                        return ( decimal_object ) => {
                            return decimal_object.toString( 2 );
                        };
                    }
                } )(),
                
                convert_sort_index_to_cursor = ( sort_index, is_previous = false ) => {
                    let sort_index_bin = ( '0'.repeat( 64 ) + to_binary( new Decimal( sort_index ).add( is_previous ? -1 : 1 ) ) ).slice( -64 ),
                        cursor = [
                        /*  0 */ sort_index_bin.substr( 5, 4 ) + '00',
                        /*  1 */ sort_index_bin.substr( 14, 2 ) + sort_index_bin.substr( 1, 4 ),
                        /*  2 */ '1' + sort_index_bin.substr( 9, 5 ),
                        /*  3 */ sort_index_bin.substr( 17, 6 ),
                        /*  4 */ sort_index_bin.substr( 26, 4 ) + '1' + sort_index_bin.substr( 16, 1 ),
                        /*  5 */ sort_index_bin.substr( 35, 2 ) + '1' + sort_index_bin.substr( 23, 3 ),
                        /*  6 */ '1' + sort_index_bin.substr( 30, 5 ),
                        /*  7 */ sort_index_bin.substr( 38, 6 ),
                        /*  8 */ sort_index_bin.substr( 47, 4 ) + '1' + sort_index_bin.substr( 37, 1 ),
                        /*  9 */ sort_index_bin.substr( 56, 2 ) + '1' + sort_index_bin.substr( 44, 3 ),
                        /* 10 */ '1' + sort_index_bin.substr( 51, 5 ),
                        /* 11 */ sort_index_bin.substr( 59, 5 ) + '0',
                        /* 12 */ '01101' + sort_index_bin.substr( 58, 1 ),
                        ].map( ( sexted_bin, index ) => num_to_dec64_char_map[ parseInt( sexted_bin, 2 ) ] ).reverse().join( '' );
                    
                    return ( is_previous ? 'HC' : 'HB' ) +  cursor + 'AAA==';
                },
                
                convert_cursor_to_sort_index = ( cursor ) => {
                    if ( ( ! cursor ) || ( ! cursor.match( /^H([BC])([A-Za-z0-9+/]{13})AAA==/ ) ) ) {
                        return new Decimal( '9153891586667446272' );
                    }
                    let is_previous = ( RegExp.$1 == 'C' ),
                        dec64_chars = RegExp.$2,
                        cursor_bin = [ ... dec64_chars ].map( dec64_char => ( '000000' + Number( dec64_char_to_num_map[ dec64_char ] ).toString( 2 ) ).slice( -6 ) ).reverse().join( '' ),
                        sort_index_bin = [
                            cursor_bin.substr( 8, 4 ),
                            cursor_bin.substr( 0, 4 ),
                            cursor_bin.substr( 13, 5 ),
                            cursor_bin.substr( 6, 2 ),
                            cursor_bin.substr( 29, 1 ),
                            cursor_bin.substr( 18, 6 ),
                            cursor_bin.substr( 33, 3 ),
                            cursor_bin.substr( 24, 4 ),
                            cursor_bin.substr( 37, 5 ),
                            cursor_bin.substr( 30, 2 ),
                            cursor_bin.substr( 53, 1 ),
                            cursor_bin.substr( 42, 6 ),
                            cursor_bin.substr( 57, 3 ),
                            cursor_bin.substr( 48, 4 ),
                            cursor_bin.substr( 61, 5 ),
                            cursor_bin.substr( 54, 2 ),
                            cursor_bin.substr( 77, 1 ),
                            cursor_bin.substr( 66, 5 ),
                        ].join( '' );
                    
                    return new Decimal( '0b' + sort_index_bin ).add( is_previous ? 1 : -1 );
                },
                
                convert_tweet_id_to_cursor = ( tweet_id, is_previous = false ) => convert_sort_index_to_cursor( tweet_id, is_previous ),
                
                convert_cursor_to_tweet_id = ( cursor ) => convert_cursor_to_sort_index( cursor );
            
            return {
                convert_tweet_id_to_cursor,
                convert_cursor_to_tweet_id,
            };
        } )();
    
    var container_dom_id = params.OBSERVATION_WRAPPER_ID,
        request_dom_id = params.SCRIPT_NAME + '_fetch-wrapper-request',
        result_dom_id = params.SCRIPT_NAME + '_fetch-wrapper-result',
        
        message_id_map = {
            [ request_dom_id ] : 'FETCH_REQUEST_DATA',
            [ result_dom_id ] : 'FETCH_RESPONSE_DATA',
        },
        
        reg_api_url = /^(https:\/\/api\.twitter\.com\/|https:\/\/(?:mobile\.)?twitter\.com\/i\/api\/)/,
        // 2020.10.14: APIエンドポイントが https://twitter.com/i/api/2/* になるものが出てきた模様
        // 例）https://api.twitter.com/2/timeline/profile/<user-id>.json → https://twitter.com/i/api/2/timeline/profile/<user-id>.json
        
        request_reg_url_list = [
            reg_api_url,
        ],
        
        result_reg_url_list = [
            reg_api_url,
        ],
        
        write_data = ( () => {
            var fetch_wrapper_container = document.querySelector( '#' + container_dom_id );
            
            return ( data, data_dom_id, reg_url_list ) => {
                var url = data.url;
                if ( ! reg_url_list.some( reg_url_filter => reg_url_filter.test( url ) ) ) {
                    return;
                }
                
                window.postMessage( {
                    namespace : params.SCRIPT_NAME,
                    message_id : message_id_map[ data_dom_id ],
                    url : url,
                    data : data,
                }, location.origin );
                
                if ( ! params.OBSERVE_DOM_FETCH_DATA ) {
                    return;
                }
                
                // TODO: クリック等のイベント発生から通知（/1.1/jot/client_event.json への送信）までが比較的遅い
                // → クリックによるページ遷移後に通知されることもある（DOMツリー変化→通知発生の順だとうまく判定ができない場合がある）
                // → 通知時に DOM 要素も挿入することで、MutationObserver に検知させる
                var data_container = fetch_wrapper_container.querySelector( '#' + data_dom_id );
                
                if ( data_container ) {
                    data_container.remove();
                }
                data_container = document.createElement( 'input' );
                data_container.id = data_dom_id;
                data_container.type = 'hidden';
                //data_container.value = JSON.stringify( data );
                data_container.setAttribute( 'date-api-url', data.url );
                data_container.style.display = 'none';
                fetch_wrapper_container.appendChild( data_container );
            };
        } )(),
        
        write_request_data = ( request ) => {
            write_data( request, request_dom_id, request_reg_url_list );
        },
        
        write_result_data = ( result ) => {
            write_data( result, result_dom_id, result_reg_url_list );
        },
        
        [ url_filter_map, response_json_filter_map ] = ( () => {
            var api_user_timeline_template = params.API_USER_TIMELINE_TEMPLATE + '&user_id=#USER_ID#',
                reg_api2_user_timeline_params = {
                    user_id : /\/profile\/(\d+)\.json/,
                    count : /[?&]count=(\d+)/,
                    cursor : /[?&]cursor=([^&]+)/,
                },
                reg_location_url_max_id = /[?&](?:max_id|max_position)=(\d*)/,
                reg_number = /^(\d+)$/,
                is_with_replies_timeline = () => /^\/([^\/]+)\/with_replies/.test( location.pathname ),
                
                global_tweet_info_map = {},
                
                url_filter_map = {
                    'default' : null,
                    
                    /*
                    //'user_timeline_url_2_to_1.1' : ( source_url ) => {
                    //    var user_id = ( source_url.match( reg_api2_user_timeline_params.user_id ) || [ 0, '' ] )[ 1 ];
                    //    
                    //    if ( ! user_id ) {
                    //        return source_url;
                    //    }
                    //    
                    //    var count = ( source_url.match( reg_api2_user_timeline_params.count ) || [ 0, '20' ] )[ 1 ],
                    //        cursor = decodeURIComponent( ( source_url.match( reg_api2_user_timeline_params.cursor ) || [ 0, '' ] )[ 1 ] ),
                    //        location_url_max_id = ( location.href.match( reg_location_url_max_id ) || [ 0, '' ] )[ 1 ],
                    //        max_id = reg_number.test( cursor ) ? cursor : location_url_max_id,
                    //        replaced_url = api_user_timeline_template.replace( /#USER_ID#/g, user_id ).replace( /#COUNT#/g, count ) + ( max_id ? '&max_id=' + max_id : '' );
                    //    
                    //    //console.log( 'url_filter(): source_url=', source_url, 'location.href=', location.href );
                    //    //console.log( 'user_id=', user_id, 'count=', count, 'cursor=', cursor, 'location_url_max_id=', location_url_max_id, 'max_id=', max_id );
                    //    //console.log( 'replaced_url=', replaced_url );
                    //    
                    //    return replaced_url;
                    //},
                    */
                    
                    'convert_user_timeline_url' : ( source_url ) => {
                        if ( ! is_with_replies_timeline() ) {
                            // TODO: /with_replies から他の URL に遷移した際に誤動作する
                            // →初期化時だけではなく、その都度判定することで防止
                            return source_url;
                        }
                        var user_id = ( source_url.match( reg_api2_user_timeline_params.user_id ) || [ 0, '' ] )[ 1 ];
                        
                        if ( ! user_id ) {
                            return source_url;
                        }
                        
                        var location_url_max_id = ( location.href.match( reg_location_url_max_id ) || [ 0, '' ] )[ 1 ],
                            replaced_url = source_url;
                        
                        //console.log( 'url_filter(): source_url=', source_url, 'location.href=', location.href );
                        //console.log( 'location_url_max_id=', location_url_max_id );
                        
                        if ( location_url_max_id ) {
                            var original_cursor = decodeURIComponent( ( source_url.match( reg_api2_user_timeline_params.cursor ) || [ 0, '' ] )[ 1 ] ),
                                original_cursor_max_id = convert_cursor_to_tweet_id( original_cursor ),
                                is_replace_required = ( new Decimal( location_url_max_id ).cmp( original_cursor_max_id ) < 0 ),
                                replaced_cursor = is_replace_required ? convert_tweet_id_to_cursor( location_url_max_id ) : original_cursor,
                                request_max_id = ( is_replace_required ) ? location_url_max_id : original_cursor_max_id,
                                api_user_timeline_url = api_user_timeline_template.replace( /#USER_ID#/g, user_id ).replace( /#COUNT#/g, 200 ) + ( request_max_id ? '&max_id=' + request_max_id : '' );
                            
                            try {
                                // TODO: API2の /2/timeline/profile/<id>.json ではツイートの実体が入ってこないケースがある（会話ツリー途中のツイートなど）
                                // →並行して API1.1 で取得し、global_tweet_info_map に情報を保存しておく
                                var fetch_promise = fetch( api_user_timeline_url, {
                                        method: 'GET',
                                        headers: {
                                            'authorization' : 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                                            'x-csrf-token' : document.cookie.match( /ct0=(.*?)(?:;|$)/ )[ 1 ],
                                            'x-twitter-active-user' : 'yes',
                                            'x-twitter-auth-type' : 'OAuth2Session',
                                            'x-twitter-client-language' : 'en',
                                        },
                                        mode: 'cors',
                                        credentials : 'include',
                                    } )
                                    .then( response => {
                                        if ( ! response.ok ) {
                                            throw new Error( 'Network response was not ok' );
                                        }
                                        return response.json()
                                    } )
                                    .then( result => {
                                        //console.log( 'fetch() result', result );
                                        if ( Array.isArray( result ) ) {
                                            result.map( tweet_info => {
                                                var retweeted_tweet_info = tweet_info.retweeted_status;
                                                
                                                if ( retweeted_tweet_info ) {
                                                    tweet_info.retweeted_status_id_str = retweeted_tweet_info.id_str;
                                                    try {
                                                        retweeted_tweet_info.user_id_str = retweeted_tweet_info.user.id_str;
                                                    }
                                                    catch ( error ) {
                                                    }
                                                    global_tweet_info_map[ retweeted_tweet_info.id_str ] = retweeted_tweet_info;
                                                }
                                                
                                                try {
                                                    tweet_info.user_id_str = tweet_info.user.id_str;
                                                }
                                                catch ( error ) {
                                                }
                                                global_tweet_info_map[ tweet_info.id_str ] = tweet_info;
                                            } );
                                        }
                                        //console.log( 'global_tweet_info_map:', global_tweet_info_map );
                                    } )
                                    .catch( error => {
                                        console.error( 'fetch() error', error, api_user_timeline_url );
                                    } );
                                
                                required_promises.push( fetch_promise );
                            }
                            catch ( error ) {
                                console.error( 'fetch() failure', error, api_user_timeline_url );
                            }
                            
                            //console.log( 'original_cursor=', original_cursor );
                            //console.log( 'convert_cursor_to_tweet_id( original_cursor )', original_cursor_max_id.toString() );
                            //console.log( 'convert_tweet_id_to_cursor( location_url_max_id )', convert_tweet_id_to_cursor( location_url_max_id ) );
                            //console.log( 'replaced_cursor=', replaced_cursor );
                            
                            replaced_url = source_url.replace( reg_api2_user_timeline_params.cursor, '' ) + '&cursor=' + encodeURIComponent( replaced_cursor );
                        }
                        
                        //console.log( 'replaced_url=', replaced_url );
                        
                        return replaced_url;
                    },
                },
                
                response_json_filter_map = {
                    'default' : null,
                    
                    /*
                    //'user_timeline_response_1.1_to_2' : ( source_json, source_url ) => {
                    //    //console.log( 'response_json_filter(): source_url=', source_url, 'source_json=', source_json );
                    //    
                    //    // /2/timeline/profile と /1.1/statuses/user_timeline とでは応答(JSON)の構造が異なるため、変換を行う
                    //    var user_id = ( source_url.match( reg_api2_user_timeline_params.user_id ) || [ 0, '' ] )[ 1 ];
                    //    
                    //    if ( ! user_id ) {
                    //        console.error( 'response_json_filter(): user_id not found. source_url=', source_url );
                    //        
                    //        return source_json;
                    //    }
                    //    
                    //    var max_id = ( location.href.match( reg_location_url_max_id ) || [ 0, 0 ] )[ 1 ] || '9153891586667446272',
                    //        // datetime_to_tweet_id(Date.parse( '2080-01-01T00:00:00.000Z' )) => 9153891586667446272
                    //        // 参考：Tweet ID の最大値は 2^63-1 = 0x7fffffffffffffff = 9223372036854775807 => tweet_id_to_date( '9223372036854775807' ).toISOString() => "2080-07-10T17:30:30.208Z"
                    //        until_id = Decimal.add( max_id, 1 ).toString(),
                    //        min_id_obj = new Decimal( max_id ),
                    //        since_id,
                    //        
                    //        replaced_json = {
                    //            globalObjects : {
                    //                broadcasts : {},
                    //                cards : {},
                    //                media: {},
                    //                moments : {},
                    //                places : {},
                    //                tweets : {},
                    //                users : {},
                    //            },
                    //            timeline : {
                    //                id : 'ProfileAll-' + user_id,
                    //                instructions : [
                    //                    {
                    //                        addEntries : {
                    //                            entries : [],
                    //                        }
                    //                    },
                    //                ],
                    //                responseObjects : {
                    //                    feedbackActions : {},
                    //                },
                    //            },
                    //        },
                    //        src_tweets = source_json,
                    //        dst_tweets = replaced_json.globalObjects.tweets,
                    //        dst_users = replaced_json.globalObjects.users,
                    //        dst_entries = replaced_json.timeline.instructions[ 0 ].addEntries.entries;
                    //    
                    //    src_tweets.forEach( ( src_tweet ) => {
                    //        var tweet_id = src_tweet.id_str,
                    //            src_user = src_tweet.user,
                    //            user_id = src_user.id_str,
                    //            retweeted_status = src_tweet.retweeted_status,
                    //            quoted_status = src_tweet.quoted_status;
                    //        
                    //        dst_tweets[ tweet_id ] = src_tweet;
                    //        src_tweet.user_id_str = user_id;
                    //        dst_users[ user_id ] = src_user;
                    //        delete src_tweet.user;
                    //        
                    //        if ( retweeted_status ) {
                    //            src_tweet.retweeted_status_id_str = retweeted_status.id_str;
                    //            dst_tweets[ retweeted_status.id_str ] = retweeted_status;
                    //            retweeted_status.user_id_str = retweeted_status.user.id_str;
                    //            dst_users[ retweeted_status.user.id_str ] = retweeted_status.user;
                    //            delete retweeted_status.user;
                    //        }
                    //        
                    //        if ( quoted_status ) {
                    //            src_tweet.quoted_status_id_str = quoted_status.id_str;
                    //            dst_tweets[ quoted_status.id_str ] = quoted_status;
                    //            quoted_status.user_id_str = quoted_status.user.id_str;
                    //            dst_users[ quoted_status.user.id_str ] = quoted_status.user;
                    //            delete quoted_status.user;
                    //        }
                    //        
                    //        dst_entries.push( {
                    //            content : {
                    //                item : {
                    //                    content : {
                    //                        tweet : {
                    //                            displayType : 'Tweet',
                    //                            id : tweet_id,
                    //                        }
                    //                    }
                    //                }
                    //            },
                    //            entryId : 'tweet-' + tweet_id,
                    //            sortIndex : tweet_id,
                    //            
                    //        } );
                    //        
                    //        if ( min_id_obj.cmp( tweet_id ) > 0 ) {
                    //            min_id_obj = new Decimal( tweet_id );
                    //        }
                    //    } );
                    //    
                    //    since_id = min_id_obj.sub( 1 ).toString();
                    //    
                    //    dst_entries.push( {
                    //        content : {
                    //            operation : {
                    //                cursor : {
                    //                    cursorType : 'Top',
                    //                    value : until_id, // TODO: cursor 値が適当でも大丈夫か不明
                    //                }
                    //            }
                    //        },
                    //        entryId : 'cursor-top-' + until_id,
                    //        sortIndex : until_id,
                    //    } );
                    //    
                    //    dst_entries.push( {
                    //        content : {
                    //            operation : {
                    //                cursor : {
                    //                    cursorType : 'Bottom',
                    //                    stopOnEmptyResponse : true,
                    //                    value : since_id, // TODO: cursor 値が適当でも大丈夫か不明
                    //                }
                    //            }
                    //        },
                    //        entryId : 'cursor-bottom-' + since_id,
                    //        sortIndex : since_id,
                    //    } );
                    //    
                    //    //console.log( 'response_json_filter(): source_url=', source_url, 'replaced_json=', replaced_json );
                    //    
                    //    return replaced_json;
                    //},
                    */
                    
                    'convert_user_timeline_response' : ( source_json, source_url ) => {
                        //console.log( 'convert_user_timeline_response(): source_url=', source_url, 'source_json=', source_json );
                        
                        if ( ! is_with_replies_timeline() ) {
                            // TODO: /with_replies から他の URL に遷移した際に誤動作する
                            // →初期化時だけではなく、その都度判定することで防止
                            return source_json;
                        }
                        
                        var user_id = ( source_url.match( reg_api2_user_timeline_params.user_id ) || [ 0, '' ] )[ 1 ];
                        
                        if ( ! user_id ) {
                            console.error( 'response_json_filter(): user_id not found. source_url=', source_url );
                            return source_json;
                        }
                        
                        var replaced_json = source_json,
                            tweets = ( replaced_json.globalObjects || {} ).tweets || {},
                            users = ( replaced_json.globalObjects || {} ).users || {},
                            ext_entries = [];
                        
                        try {
                            replaced_json.timeline.instructions = replaced_json.timeline.instructions
                                .filter( instruction => {
                                    // TODO: 固定されたツイート(pinEntry)があると検索時に邪魔になってしまう
                                    // → 固定されたツイート(pinEntry)を通常のツイートに変換して退避し、addEntries 以外は取り除く
                                    if ( 'pinEntry' in instruction ) {
                                        let pin_entry = instruction.pinEntry.entry;
                                        
                                        try {
                                            delete pin_entry.content.item.clientEventInfo;
                                            delete pin_entry.content.item.content.tweet.socialContext;
                                            pin_entry.sortIndex = pin_entry.content.item.content.tweet.id;
                                        }
                                        catch ( error ) {
                                        }
                                        
                                        ext_entries.push( pin_entry );
                                        
                                        return false;
                                    }
                                    return 'addEntries' in instruction;
                                } )
                                .map( instruction => {
                                    // TODO: 会話（ツリー）形式が含まれているとIDが前後するために検索しにくい
                                    // →ツイートID降順に展開
                                    var entries = instruction.addEntries.entries.concat( ext_entries ),
                                        cursor_top_sort_index = new Decimal( '9153891586667446272' ),
                                        cursor_bottom_sort_index = new Decimal( '0' ),
                                        cursor_top_entries = entries.filter( entry => /^cursor-top-/.test( entry.entryId || '' ) ).map( entry => {
                                            cursor_top_sort_index = new Decimal( entry.sortIndex );
                                            
                                            // TODO: 新しいツイートが読み込まれて上部に追加される
                                            // →読み込み防止のため、cursor-top に未来の日時を指定
                                            // datetime_to_tweet_id(Date.parse( '2080-01-01T00:00:00.000Z' )) => 9153891586667446272
                                            entry.content.operation.cursor.value = 'HCb+///7wfmTif4AAA==';
                                            entry.entryId = 'cursor-top-9153891586667446272';
                                            entry.sortIndex = '9153891586667446272';
                                            return entry;
                                        } ),
                                        cursor_bottom_entries = entries.filter( entry => /^cursor-bottom-/.test( entry.entryId || '' ) ).map( entry => {
                                            cursor_bottom_sort_index = new Decimal( entry.sortIndex );
                                            return entry;
                                        } ),
                                        sort_index_map = {},
                                        tweet_entries = entries.filter( entry => /^tweet-/.test( entry.entryId || '' ) ).filter( entry => {
                                            var sort_index = entry.sortIndex;
                                            
                                            if ( sort_index_map[ sort_index ] ) {
                                                return false;
                                            }
                                            sort_index_map[ sort_index ] = true;
                                            
                                            // 固定されたツイートの場合は範囲が外れることもあるため、確認
                                            if ( cursor_top_sort_index.cmp( sort_index ) < 0 ) {
                                                return false;
                                            }
                                            
                                            if ( cursor_bottom_sort_index.cmp( sort_index ) > 0 ) {
                                                return false;
                                            }
                                            return true;
                                        } ),
                                        home_conversation_tweet_entries = entries.filter( entry => /^(homeConversation)-/.test( entry.entryId || '' ) ).reduce( ( tweet_entries, entry ) => {
                                            entry.content.timelineModule.items.filter( item => {
                                                var tweet = item.item.content.tweet,
                                                    tweet_id = tweet.id;
                                                
                                                if ( sort_index_map[ tweet_id ] ) {
                                                    return false;
                                                }
                                                sort_index_map[ tweet_id ] = true;
                                                
                                                if ( ( tweets[ tweet_id ] || {} ).user_id_str != user_id ) {
                                                    return false;
                                                }
                                                if ( cursor_top_sort_index.cmp( tweet_id ) < 0 ) {
                                                    return false;
                                                }
                                                
                                                if ( cursor_bottom_sort_index.cmp( tweet_id ) > 0 ) {
                                                    return false;
                                                }
                                                
                                                return true;
                                            } ).map( item => {
                                                var tweet = item.item.content.tweet;
                                                
                                                tweet_entries.push( {
                                                    content : {
                                                        item : item.item,
                                                    },
                                                    entryId : 'tweet-' + tweet.id,
                                                    sortIndex : tweet.id,
                                                } );
                                            } );
                                            
                                            return tweet_entries;
                                        }, [] ),
                                        excluded_conversation_tweet_ids = entries.filter( entry => /^(homeConversation)-/.test( entry.entryId || '' ) ).reduce( ( tweet_ids, entry ) => {
                                            try {
                                                return tweet_ids.concat( entry.content.timelineModule.metadata.conversationMetadata.allTweetIds.filter( tweet_id => {
                                                    if ( sort_index_map[ tweet_id ] ) {
                                                        return false;
                                                    }
                                                    if ( cursor_top_sort_index.cmp( tweet_id ) < 0 ) {
                                                        return false;
                                                    }
                                                    
                                                    if ( cursor_bottom_sort_index.cmp( tweet_id ) > 0 ) {
                                                        return false;
                                                    }
                                                    return true;
                                                } ) );
                                            }
                                            catch ( error ) {
                                                console.error( error );
                                                return tweet_ids;
                                            }
                                        }, [] ),
                                        excluded_conversation_tweet_entries = excluded_conversation_tweet_ids.reduce( ( tweet_entries, tweet_id ) => {
                                            if ( ( ! tweets[ tweet_id ] ) && ( ! global_tweet_info_map[ tweet_id ] ) ) {
                                                return tweet_entries;
                                            }
                                            
                                            if ( ! tweets[ tweet_id ] ) {
                                                var tweet_info = tweets[ tweet_id ] = global_tweet_info_map[ tweet_id ];
                                                
                                                if ( ! users[ tweet_info.user_id_str ] ) {
                                                    users[ tweet_info.user_id_str ] = tweet_info.user;
                                                }
                                            }
                                            
                                            tweet_entries.push( {
                                                content : {
                                                    item : {
                                                        content : {
                                                            tweet : {
                                                                displayType : 'Tweet',
                                                                id : tweet_id,
                                                                minSpacing: 0,
                                                            }
                                                        }
                                                    }
                                                },
                                                entryId : 'tweet-' + tweet_id,
                                                sortIndex : tweet_id,
                                            } );
                                            
                                            return tweet_entries;
                                        }, [] );
                                    
                                    if ( excluded_conversation_tweet_entries.length < excluded_conversation_tweet_ids.length ) {
                                        console.debug( '(*) There are tweets in the conversation that are not included.', excluded_conversation_tweet_ids, 'vs', excluded_conversation_tweet_entries );
                                        // 覚書：会話の中で、本人のツイート以外でかつRT対象にもなっていないものが含まれているケースだと思われる
                                    }
                                    
                                    tweet_entries = tweet_entries.concat( home_conversation_tweet_entries );
                                    tweet_entries = tweet_entries.concat( excluded_conversation_tweet_entries );
                                    
                                    tweet_entries.sort( ( a, b ) => {
                                        if ( a.sortIndex == b.sortIndex ) {
                                            return 0;
                                        }
                                        if ( new Decimal( a.sortIndex ).cmp( b.sortIndex ) < 0 ) {
                                            return 1;
                                        }
                                        return -1;
                                    } );
                                    
                                    instruction.addEntries.original_entries = instruction.addEntries.entries;
                                    instruction.addEntries.entries = [].concat( tweet_entries, cursor_top_entries, cursor_bottom_entries );
                                    
                                    return instruction;
                                } );
                        }
                        catch ( error ) {
                            //console.error( error );
                        }
                        
                        replaced_json = JSON.parse( JSON.stringify( replaced_json ) );
                        //console.log( 'response_json_filter(): source_url=', source_url, 'replaced_json=', replaced_json );
                        
                        return replaced_json;
                    },
                };
            
            return [ url_filter_map, response_json_filter_map ];
        } )(),
        
        default_filter_url_config = {
            name : 'default',
            reg_url : /^/,
            url_filter : url_filter_map[ 'default' ],
            response_json_filter : response_json_filter_map[ 'default' ],
        },
        
        filter_location_configs = [
            {
                name : 'user_timeline_for_searching',
                reg_location_url : /^https:\/\/(?:mobile\.)?twitter\.com\/([^\/]+)\/with_replies.*?[?&](?:max_id|max_position)=(\d*)/,
                filter_url_configs : [
                    {
                        name : 'use_api1.1_instead_of_2',
                        reg_url : /(^https:\/\/api\.twitter\.com|\/api)\/2\/timeline\/profile\/\d+\.json/,
                        url_filter : url_filter_map[ 'convert_user_timeline_url' ],
                        response_json_filter : response_json_filter_map[ 'convert_user_timeline_response' ],
                    },
                ],
            },
            {
                name : 'default',
                reg_location_url : /^/,
                filter_url_configs : [],
            },
        ],
        
        get_filter_url_config = ( called_url, location_url ) => {
            var filter_url_config;
                
            
            if ( ! location_url ) {
                location_url = location.href;
            }
            
            try {
                filter_url_config = filter_location_configs.filter( config => config.reg_location_url.test( location_url ) )[ 0 ].filter_url_configs.filter( config => config.reg_url.test( called_url ) )[ 0 ];
            }
            catch ( error ) {
            }
            
            if ( ! filter_url_config ) {
                filter_url_config = default_filter_url_config;
            }
            
            return filter_url_config;
        };
    
    // ◆ window.XMLHttpRequest へのパッチ
    // 参考: [javascript - How can I modify the XMLHttpRequest responsetext received by another function? - Stack Overflow](https://stackoverflow.com/questions/26447335/how-can-i-modify-the-xmlhttprequest-responsetext-received-by-another-function)
    ( ( original_XMLHttpRequest ) => {
        if ( typeof intercept_xhr_response != 'function' ) {
            console.error( 'intercept_xhr_response() (in "scripts/intercept_xhr.js") is required.');
            return;
        }
        
        filter_location_configs.forEach( ( filter_location_config ) => {
            if ( ! filter_location_config.reg_location_url.test( location.href ) ) {
                return;
            }
            
            //console.log( 'filter_location_config:', filter_location_config );
            
            filter_location_config.filter_url_configs.forEach( ( filter_url_config ) => {
                var reg_url = filter_url_config.reg_url,
                    url_filter = filter_url_config.url_filter,
                    response_json_filter = filter_url_config.response_json_filter,
                    response_filter = ( original_responseText, replaced_url, called_url ) => {
                        var filtered_responseText;
                        
                        try {
                            filtered_responseText = JSON.stringify( response_json_filter( JSON.parse( original_responseText ), called_url ) );
                        }
                        catch ( error ) {
                            filtered_responseText = original_responseText; // JSON 以外のデータはそのまま返す
                        }
                        
                        //console.log( 'filtered_responseText', filtered_responseText, '<= original_responseText', original_responseText );
                        return filtered_responseText;
                    };
                
                intercept_xhr_response( reg_url, url_filter, response_filter );
                //console.log( 'intercept_xhr_response(', reg_url, url_filter, response_filter, ')' );
            } );
        } );
        
        var original_prototype_send = original_XMLHttpRequest.prototype.send;
        
        original_XMLHttpRequest.prototype.send = function ( body ) {
            var xhr = this,
                called_url = xhr._called_url,
                replaced_url = xhr._replaced_url,
                user_onreadystatechange = xhr.onreadystatechange;
            
            // リクエストデータを拡張機能に送信
            write_request_data( {
                url : called_url,
                body : body,
            } );
            //console.log( 'xhr.send(): body=', body, 'xhr=', xhr );
            
            xhr.onreadystatechange = function () {
                var response_json;
                
                if ( xhr.readyState === 4 ) {
                    try {
                        response_json = JSON.parse( xhr.responseText );
                        
                        // レスポンスデータを拡張機能に送信
                        write_result_data( {
                            url : called_url,
                            json : response_json,
                        } );
                        //console.log( 'xhr.onreadystatechange(): response_json', response_json, 'xhr=', xhr );
                    }
                    catch ( error ) {
                        // 応答が JSON ではない場合は無視
                    }
                }
                
                if ( typeof user_onreadystatechange == 'function' ) {
                    return user_onreadystatechange.apply( xhr, arguments );
                }
            };
            
            var saved_arguments = arguments,
                waiting_promises = required_promises.slice(),
                send_request = () => {
                    //console.log( 'Promise.all() result: waiting_promises=', waiting_promises );
                    original_prototype_send.apply( xhr, saved_arguments );
                };
            
            required_promises = [];
            
            if ( waiting_promises.length <= 0 ) {
                send_request();
                return;
            }
            
            // ツイート情報取得待ちの状態のときは応答が返るまで send するのを待つ
            Promise.all( waiting_promises )
            .then( send_request )
            .catch( error => {
                console.error( 'Promise.all() error:', error );
                send_request();
            } );
        };
    } )( window.XMLHttpRequest );
    
    // ◆ window.fetch へのパッチ
    /*
    //( ( original_fetch ) => {
    //    window.fetch = ( url, options ) => {
    //        var fetch_promise,
    //            called_url = url,
    //            body = ( options || {} ).body,
    //            filter_url_config;
    //        
    //        try {
    //            filter_url_config = get_filter_url_config( url );
    //            
    //            if ( filter_url_config.name != 'default' ) {
    //                url = filter_url_config.url_filter( url );
    //            }
    //        }
    //        catch ( error ) {
    //            console.error( 'fetch()', error, '=> check get_filter_url_config()' );
    //        }
    //        
    //        // リクエストデータを拡張機能に送信
    //        write_request_data( {
    //            url : called_url,
    //            body : body,
    //        } );
    //        
    //        fetch_promise = original_fetch( url, options );
    //        
    //        return fetch_promise.then( ( response ) => {
    //            var original_json_function = response.json;
    //            
    //            response.json = function () {
    //                var json_promise = original_json_function.apply( response, arguments );
    //                
    //                if ( filter_url_config.name == 'default' ) {
    //                    return json_promise;
    //                }
    //                
    //                return json_promise.then( ( original_json ) => {
    //                    var replaced_json;
    //                    
    //                    try {
    //                        replaced_json = filter_url_config.response_json_filter( original_json, called_url );
    //                        
    //                        // レスポンスデータを拡張機能に送信
    //                        write_result_data( {
    //                            url : called_url,
    //                            json : replaced_json,
    //                        } );
    //                        
    //                        return replaced_json;
    //                    }
    //                    catch ( error ) {
    //                        return original_json; // JSON 以外のデータはそのまま返す
    //                    }
    //                } );
    //            };
    //            
    //            return response;
    //        } );
    //    };
    //} )( window.fetch );
    */
};
