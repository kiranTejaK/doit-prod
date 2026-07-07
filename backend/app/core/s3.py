import logging

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

def get_s3_client():
    if not settings.S3_BUCKET:
        return None
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )

def upload_file_to_s3(file_obj, key: str, content_type: str = None) -> bool:
    s3_client = get_s3_client()
    if not s3_client:
        logger.warning("S3 client not configured, skipping upload")
        return False

    try:
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        s3_client.upload_fileobj(file_obj, settings.S3_BUCKET, key, ExtraArgs=extra_args)
        return True
    except ClientError as e:
        logger.error(f"Error uploading to S3: {e}")
        return False

def get_presigned_url(key: str, expiration: int = 3600) -> str | None:
    s3_client = get_s3_client()
    if not s3_client:
        return None

    try:
        response = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": key},
            ExpiresIn=expiration,
        )
        return response
    except ClientError as e:
        logger.error(f"Error generating presigned URL: {e}")
        return None

def delete_file_from_s3(key: str) -> bool:
    s3_client = get_s3_client()
    if not s3_client:
        return False

    try:
        s3_client.delete_object(Bucket=settings.S3_BUCKET, Key=key)
        return True
    except ClientError as e:
        logger.error(f"Error deleting from S3: {e}")
        return False
