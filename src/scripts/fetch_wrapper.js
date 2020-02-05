// window.XMLHttpRequest / window.fetch にパッチをあてて、Twitter クライアントの Web API コールの結果を取得・置換し、拡張機能側に送信

// TODO: [Chrome 拡張機能では、HTTP Response Body を取得する汎用的な方法が用意されていない](https://stackoverflow.com/questions/10393638/chrome-extensions-other-ways-to-read-response-bodies-than-chrome-devtools-netw)
// ※ chrome.webRequest.onCompleted では Response Headers は取得できても Body は取得できない
// ※ chrome.devtools.network.onRequestFinished では、開発者ツールを開いていないと取得できない
// → コンテンツに script を埋め込み、XMLHttpRequest / fetch にパッチをあてて取得

window.make_fetch_wrapper = ( params ) => {
    if ( ! params ) {
        params = {};
    }
    
    var container_dom_id = params.OBSERVATION_WRAPPER_ID,
        request_dom_id = params.SCRIPT_NAME + '_fetch-wrapper-request',
        result_dom_id = params.SCRIPT_NAME + '_fetch-wrapper-result',
        
        message_id_map = {
            [ request_dom_id ] : 'FETCH_REQUEST_DATA',
            [ result_dom_id ] : 'FETCH_RESPONSE_DATA',
        },
        
        reg_api_url = /^https:\/\/api\.twitter\.com\//,
        
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
                
                url_filter_map = {
                    'default' : null,
                    
                    'user_timeline_url_2_to_1.1' : ( source_url ) => {
                        var user_id = ( source_url.match( reg_api2_user_timeline_params.user_id ) || [ 0, '' ] )[ 1 ];
                        
                        if ( ! user_id ) {
                            return source_url;
                        }
                        
                        var count = ( source_url.match( reg_api2_user_timeline_params.count ) || [ 0, '20' ] )[ 1 ],
                            cursor = decodeURIComponent( ( source_url.match( reg_api2_user_timeline_params.cursor ) || [ 0, '' ] )[ 1 ] ),
                            location_url_max_id = ( location.href.match( reg_location_url_max_id ) || [ 0, '' ] )[ 1 ],
                            max_id = reg_number.test( cursor ) ? cursor : location_url_max_id,
                            replaced_url = api_user_timeline_template.replace( /#USER_ID#/g, user_id ).replace( /#COUNT#/g, count ) + ( max_id ? '&max_id=' + max_id : '' );
                        
                        //console.log( 'url_filter(): source_url=', source_url, 'location.href=', location.href );
                        //console.log( 'user_id=', user_id, 'count=', count, 'cursor=', cursor, 'location_url_max_id=', location_url_max_id, 'max_id=', max_id );
                        //console.log( 'replaced_url=', replaced_url );
                        
                        return replaced_url;
                    },
                },
                
                response_json_filter_map = {
                    'default' : null,
                    
                    'user_timeline_response_1.1_to_2' : ( source_json, source_url ) => {
                        //console.log( 'response_json_filter(): source_url=', source_url, 'source_json=', source_json );
                        
                        // /2/timeline/profile と /1.1/statuses/user_timeline とでは応答(JSON)の構造が異なるため、変換を行う
                        var user_id = ( source_url.match( reg_api2_user_timeline_params.user_id ) || [ 0, '' ] )[ 1 ];
                        
                        if ( ! user_id ) {
                            console.error( 'response_json_filter(): user_id not found. source_url=', source_url );
                            
                            return source_json;
                        }
                        
                        var max_id = ( location.href.match( reg_location_url_max_id ) || [ 0, 0 ] )[ 1 ] || '9153891586667446272',
                            // datetime_to_tweet_id(Date.parse( '2080-01-01T00:00:00.000Z' )) => 9153891586667446272
                            // 参考：Tweet ID の最大値は 2^63-1 = 0x7fffffffffffffff = 9223372036854775807 => tweet_id_to_date( '9223372036854775807' ).toISOString() => "2080-07-10T17:30:30.208Z"
                            until_id = Decimal.add( max_id, 1 ).toString(),
                            min_id_obj = new Decimal( max_id ),
                            since_id,
                            
                            replaced_json = {
                                globalObjects : {
                                    broadcasts : {},
                                    cards : {},
                                    media: {},
                                    moments : {},
                                    places : {},
                                    tweets : {},
                                    users : {},
                                },
                                timeline : {
                                    id : 'ProfileAll-' + user_id,
                                    instructions : [
                                        {
                                            addEntries : {
                                                entries : [],
                                            }
                                        },
                                    ],
                                    responseObjects : {
                                        feedbackActions : {},
                                    },
                                },
                            },
                            src_tweets = source_json,
                            dst_tweets = replaced_json.globalObjects.tweets,
                            dst_users = replaced_json.globalObjects.users,
                            dst_entries = replaced_json.timeline.instructions[ 0 ].addEntries.entries;
                        
                        src_tweets.forEach( ( src_tweet ) => {
                            var tweet_id = src_tweet.id_str,
                                src_user = src_tweet.user,
                                user_id = src_user.id_str,
                                retweeted_status = src_tweet.retweeted_status,
                                quoted_status = src_tweet.quoted_status;
                            
                            dst_tweets[ tweet_id ] = src_tweet;
                            src_tweet.user_id_str = user_id;
                            dst_users[ user_id ] = src_user;
                            delete src_tweet.user;
                            
                            if ( retweeted_status ) {
                                src_tweet.retweeted_status_id_str = retweeted_status.id_str;
                                dst_tweets[ retweeted_status.id_str ] = retweeted_status;
                                retweeted_status.user_id_str = retweeted_status.user.id_str;
                                dst_users[ retweeted_status.user.id_str ] = retweeted_status.user;
                                delete retweeted_status.user;
                            }
                            
                            if ( quoted_status ) {
                                src_tweet.quoted_status_id_str = quoted_status.id_str;
                                dst_tweets[ quoted_status.id_str ] = quoted_status;
                                quoted_status.user_id_str = quoted_status.user.id_str;
                                dst_users[ quoted_status.user.id_str ] = quoted_status.user;
                                delete quoted_status.user;
                            }
                            
                            dst_entries.push( {
                                content : {
                                    item : {
                                        content : {
                                            tweet : {
                                                displayType : 'Tweet',
                                                id : tweet_id,
                                            }
                                        }
                                    }
                                },
                                entryId : 'tweet-' + tweet_id,
                                sortIndex : tweet_id,
                                
                            } );
                            
                            if ( min_id_obj.cmp( tweet_id ) > 0 ) {
                                min_id_obj = new Decimal( tweet_id );
                            }
                        } );
                        
                        since_id = min_id_obj.sub( 1 ).toString();
                        
                        dst_entries.push( {
                            content : {
                                operation : {
                                    cursor : {
                                        cursorType : 'Top',
                                        value : until_id, // TODO: cursor 値が適当でも大丈夫か不明
                                    }
                                }
                            },
                            entryId : 'cursor-top-' + until_id,
                            sortIndex : until_id,
                        } );
                        
                        dst_entries.push( {
                            content : {
                                operation : {
                                    cursor : {
                                        cursorType : 'Bottom',
                                        stopOnEmptyResponse : true,
                                        value : since_id, // TODO: cursor 値が適当でも大丈夫か不明
                                    }
                                }
                            },
                            entryId : 'cursor-bottom-' + since_id,
                            sortIndex : since_id,
                        } );
                        
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
                        reg_url : /^https:\/\/api\.twitter\.com\/2\/timeline\/profile\/\d+\.json/,
                        url_filter : url_filter_map[ 'user_timeline_url_2_to_1.1' ],
                        response_json_filter : response_json_filter_map[ 'user_timeline_response_1.1_to_2' ],
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
            
            original_prototype_send.apply( xhr, arguments );
        };
    } )( window.XMLHttpRequest );
    
    // ◆ window.fetch へのパッチ
    ( ( original_fetch ) => {
        window.fetch = ( url, options ) => {
            var fetch_promise,
                called_url = url,
                body = ( options || {} ).body,
                filter_url_config;
            
            try {
                filter_url_config = get_filter_url_config( url );
                
                if ( filter_url_config.name != 'default' ) {
                    url = filter_url_config.url_filter( url );
                }
            }
            catch ( error ) {
                console.error( 'fetch()', error, '=> check get_filter_url_config()' );
            }
            
            // リクエストデータを拡張機能に送信
            write_request_data( {
                url : called_url,
                body : body,
            } );
            
            fetch_promise = original_fetch( url, options );
            
            return fetch_promise.then( ( response ) => {
                var original_json_function = response.json;
                
                response.json = function () {
                    var json_promise = original_json_function.apply( response, arguments );
                    
                    if ( filter_url_config.name == 'default' ) {
                        return json_promise;
                    }
                    
                    return json_promise.then( ( original_json ) => {
                        var replaced_json;
                        
                        try {
                            replaced_json = filter_url_config.response_json_filter( original_json, called_url );
                            
                            // レスポンスデータを拡張機能に送信
                            write_result_data( {
                                url : called_url,
                                json : replaced_json,
                            } );
                            
                            return replaced_json;
                        }
                        catch ( error ) {
                            return original_json; // JSON 以外のデータはそのまま返す
                        }
                    } );
                };
                
                return response;
            } );
        };
    } )( window.fetch );
};
