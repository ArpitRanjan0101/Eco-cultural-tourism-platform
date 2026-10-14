#!/bin/sh
# Development S3-compatible object store (SeaweedFS). Writes the S3 identity file
# from environment variables, then starts a single-node server with the S3 gateway.
#  - "app": the backend's credentials (full access)
#  - "anonymous": read-only access to the public media buckets (images served by URL)
set -eu

cat > /tmp/s3.json <<EOF
{
  "identities": [
    {
      "name": "app",
      "credentials": [{ "accessKey": "${STORAGE_ACCESS_KEY}", "secretKey": "${STORAGE_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    },
    {
      "name": "anonymous",
      "actions": ["Read:${STORAGE_PUBLIC_BUCKET}", "Read:${STORAGE_PUBLIC_BUCKET}-test"]
    }
  ]
}
EOF

# Each bucket is a collection with its own volumes: size volumes small and let the
# volume server size its slot count from free disk (volume.max=0) for dev use.
exec weed server -dir=/data -ip=storage -volume.max=0 -master.volumeSizeLimitMB=256 \
  -s3 -s3.port=8333 -s3.config=/tmp/s3.json
