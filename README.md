# teraslice_elasticsearch_paged_reader
A reader for Elasticsearch based on normal paging mechanisms.

This is primarily useful on relatively small indices when you need sorted results or do not have a date field to work with and want to run the data through a Teraslice op pipeline.

If you have a large amount of data the deep paging required for the processing may overload the cluster so caution is recommended.

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

NOTE: For elasticsearch 2.0 and above you have to deal with index.max_result_window if your index has more than 10,000 records in it. If you set 'set_result_window' to true the reader will set it based on the size of the result set but this should be used with caution as the reader can not revert the setting when processing is complete.