CREATE TABLE api_rate_limit_buckets (
  bucket_start timestamptz NOT NULL,
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 1 AND 512),
  route text NOT NULL CHECK (char_length(route) BETWEEN 1 AND 512),
  request_count integer NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (bucket_start, client_key, route)
);

CREATE INDEX api_rate_limit_buckets_cleanup_idx
  ON api_rate_limit_buckets (bucket_start);
