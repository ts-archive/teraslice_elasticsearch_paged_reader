/*
 * This is a simple reader for elasticsearch that slices data based on normal
 * elasticsearch query paging mechanisms. This allows you to run sorted queries
 * and if your job just has a single worker you can pull all data in order.
 *
 * Due to the costs of deep paging this reader is not suitable for processing
 * truly large amounts of data but it's useful in certain data processing work
 * flows.
 */

var Promise = require('bluebird');

/*
 * TODO: this code was copied from teraslice proper.
 * Implies there should be a better api for this purpose.
 */

function getClient(context, config, type) {
    var clientConfig = {};
    clientConfig.type = type;

    if (config && config.hasOwnProperty('connection')) {
        clientConfig.endpoint = config.connection ? config.connection : 'default';
        clientConfig.cached = config.connection_cache !== undefined ? config.connection_cache : true;

    }
    else {
        clientConfig.endpoint = 'default';
        clientConfig.cached = true;
    }

    return context.foundation.getConnection(clientConfig).client;
}

var parallelSlicers = false;

function newSlicer(context, job, retryData) {
    var opConfig = job.readerConfig;
    var logger = context.logger;

    var client = getClient(context, opConfig, 'elasticsearch');

    var from = opConfig.from;
    var size = opConfig.size;

    var max_result_window;
    var record_count;

    var slicers = [];

    function setResultWindow(result_window) {
        if (result_window > 2000000) {
            throw new Error("Increasing index.max_result_window to " + result_window + " has too high risk of out of memory errors.");
        }

        logger.info("Setting max_result_window for index " + opConfig.index + " to " + result_window);

        return client.indices.putSettings({
            index: opConfig.index,
            body: {
                index: {
                    max_result_window: result_window
                }
            }
        });
    }

    function checkResultWindow() {
        return client.indices.getSettings({
            index: opConfig.index
        })
        .then(function(results) {
            //TODO needs error handling if index doesn't exist
            var data = results[opConfig.index].settings.index.max_result_window;
            max_result_window = data ? data : 10000;

            if (opConfig.set_result_window && (record_count > max_result_window)) {
                return setResultWindow(record_count + size);
            }
            else {
                if (record_count > max_result_window) {
                    throw new Error(' max_result_window for index: ' + opConfig.index + ' is set at ' +
                        max_result_window + ' which is too small to process ' + record_count + ' records');
                }
            }
        })
        /*.catch(function(err) {
console.log(err)
// TODO: this is a general error handler which could be misleading
            throw new Error('index specified in reader does not exist');
        });*/
    }

    slicers.push(function() {
        if (from > record_count) {
            // THis can't actually be done here because the workers are
            // still doing work.
            //if (max_result_window) setResultWindow(max_result_window)
            return null;
        }

        var slice = from;
        from += size;

        return slice;
    });

    return new Promise(function(resolve, reject) {
        client.count({
            index: opConfig.index,
            q: opConfig.query
        })
        .then(function(response) {
            record_count = response.count;
            checkResultWindow().then(function() {
                resolve(slicers);
            });
        });
    });
}

function newReader(context, opConfig, jobConfig) {
    var client = getClient(context, opConfig, 'elasticsearch');
    var size = opConfig.size;
    var sort = opConfig.sort;
    var query = opConfig.query;

    return function(from) {
        return new Promise(function(resolve, reject) {

            client.search({
                index: opConfig.index,
                q: opConfig.query,
                size: opConfig.size,
                from: from,
                sort: opConfig.sort
            })
            .then(function(data) {
                if (opConfig.full_response) {
                    resolve(data);
                }
                else {
                    resolve(data.hits.hits.map(function(data) {
                        return data._source
                    }));
                }
            });
        });
    }
}

function schema() {
    return {
        index: {
            doc: 'Which index to read from',
            default: '',
            format: 'required_String'
        },
        query: {
            doc: 'Lucene query to use when selecting data.',
            default: '*',
            format: String
        },
        size: {
            doc: 'The number of docs pulled in a single chunk,',
            default: 5000,
            format: 'integer'
        },
        from: {
            doc: 'The starting offset for paging.',
            default: 0,
            format: 'integer'
        },
        sort: {
            doc: 'Sort order for the results. field_name:asc or field_name:desc',
            default: null,
            format: 'optional_String'
        },
        full_response: {
            doc: 'Set to true to receive the full Elasticsearch query response including index metadata.',
            default: false,
            format: Boolean
        },
        set_result_window: {
            doc: 'Set to true to temporarily increase the index.max_result_window setting.' +
            ' This will allow result sets larger than 10,000 records to be processed' +
            ' but should be used with extreme caution if you have a large index.',
            default: false,
            format: Boolean
        }
    };
}

module.exports = {
    newReader: newReader,
    newSlicer: newSlicer,
    schema: schema,
    parallelSlicers: parallelSlicers
};