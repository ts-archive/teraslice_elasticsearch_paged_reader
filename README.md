# Reader - teraslice_paged_reader

To install from the root of your teraslice instance.

```
npm install terascope/teraslice_paged_reader
```

# Description

A reader for Elasticsearch based on normal paging mechanisms.

This is primarily useful on relatively small indices when you need sorted results or do not have a date field to work with and want to run the data through a Teraslice op pipeline.

If you have a large amount of data the deep paging required for the processing may overload the cluster so caution is recommended.

# Output

If `full_response: false` and array of JSON formatted records from the Elasticsearch index.

If `full_response: true` and array of JSON formatted records from the Elasticsearch search response which includes all metadata as well as the actual data records.

# Parameters

| Name | Description | Default | Required |
| ---- | ----------- | ------- | -------- |
| index | Which index to search |  | Y |
| query | Lucene query to use when selecting data | * | N |
| size | How many docs to pull in each paging request | 5000 | N |
| from | The starting offset for paging | 0 | N |
| sort | Sort order for the results. field_name:asc or field_name:desc |  | N |
| full_response | Set to true to receive the full Elasticsearch query response including index metadata |  | N |
| set_result_window | Set to true to temporarily increase the index.max_result_window setting. This will allow result sets larger than 10,000 records to be processed but should be used with extreme caution if you have a large index. | false | Y/N |

# Job configuration example

This example will read an index in 10,000 record chunks and then export it to a CSV file. This type of job is mostly useful at modest index sizes and preserving the order is only possible if you use a single worker.


```
{
    "name": "Reindex",
    "lifecycle": "once",
    "workers": 1,
    "operations": [
        {
          "_op": "teraslice_elasticsearch_paged_reader",
          "index": "test-data",
          "query": "date:*",
          "sort": "dete:desc",
          "size": 10000,
          "set_result_window": false
        },
        {
          "_op": "teraslice_csv_sender",
          "fields": ["value", "date"],
          "filename": "/tmp/exported"
        }
    ]
}
```

# Notes

For elasticsearch 2.0 and above you have to deal with index.max_result_window if your index has more than 10,000 records in it. If you set `set_result_window` to true the reader will set it based on the size of the result set but this should be used with caution as the reader can not revert the setting when processing is complete.
