import hashlib
import inspect
import json
import time
from functools import wraps
from typing import Optional

import redis as sync_redis
import redis.asyncio as redis
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    decode_responses=True
)

redis_client_sync = sync_redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    decode_responses=True,
    socket_connect_timeout=5,
    socket_timeout=5,
)

async def get_redis_client():
    return redis_client


# 🔹 Base prefix (shared)
def _base_prefix(module: str) -> str:
    return f"{settings.APP_PREFIX}:{settings.CACHE_VERSION}:{module}"

# 🔹 Hash helper for query params
def _hash_payload(*args, **kwargs) -> str:
    filtered_kwargs = {k: v for k, v in kwargs.items() if k not in ["session", "db", "request", "background_tasks"]}
    if "current_user" in filtered_kwargs and hasattr(filtered_kwargs["current_user"], "id"):
        filtered_kwargs["current_user"] = str(filtered_kwargs["current_user"].id)

    payload = {
        "args": args,
        "kwargs": filtered_kwargs
    }
    payload_str = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.md5(payload_str.encode()).hexdigest()

# 🔹 Query key (pagination / filters)
def query_key_generator(module: str, resource: str, *args, **kwargs) -> str:
    hash_str = _hash_payload(*args, **kwargs)
    return f"{_base_prefix(module)}:{resource}:query:{hash_str}"

# 🔹 Entity key (single item)
def entity_key_generator(module: str, resource: str, entity_id: str) -> str:
    return f"{_base_prefix(module)}:{resource}:entity:{entity_id}"

def cache_get(key: str) -> Optional[str]:
    try:
        return redis_client_sync.get(key)
    except sync_redis.RedisError as exc:
        logger.warning("redis_get_failed", key=key, error=str(exc))
        return None

def cache_set(key: str, value: str, expire_seconds: int = 3600) -> None:
    try:
        redis_client_sync.setex(key, expire_seconds, value)
    except sync_redis.RedisError as exc:
        logger.warning("redis_set_failed", key=key, error=str(exc))

def clear_cache(key_pattern: str) -> None:
    try:
        count = 0
        for key in redis_client_sync.scan_iter(match=key_pattern, count=100):
            redis_client_sync.delete(key)
            count += 1
        if count > 0:
            logger.debug("cache_cleared", pattern=key_pattern, count=count)
    except sync_redis.RedisError as exc:
        logger.warning("redis_clear_failed", pattern=key_pattern, error=str(exc))

def extract_entity_id(func, args, kwargs):
    try:
        bound_args = inspect.signature(func).bind(*args, **kwargs)
        bound_args.apply_defaults()

        # Prefer *_id
        for name, value in bound_args.arguments.items():
            if name.endswith("_id"):
                return value

        # Fallback to "id"
        if "id" in bound_args.arguments:
            return bound_args.arguments["id"]

    except Exception:
        pass

    return "all"

def build_cache_key(key_generator_func, func, args, kwargs, generator_kwargs):
    module = generator_kwargs.get("module", "default")
    resource = generator_kwargs.get("resource", "default")

    if key_generator_func == query_key_generator:
        return query_key_generator(module, resource, *args, **kwargs)
    entity_id = extract_entity_id(func, args, kwargs)
    return entity_key_generator(module, resource, str(entity_id))

def serialize_result(result):
    def normalize(obj):
        # Pydantic v2 models
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
            
        # Pydantic v1 models
        if hasattr(obj, "dict"):
            return obj.dict()

        # SQLAlchemy models — dump columns only (no relationships)
        if hasattr(obj, "__table__"):
            return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}

        # Dicts (e.g. get_users returns {"users": [...], "total": int})
        if isinstance(obj, dict):
            return {k: normalize(v) for k, v in obj.items()}

        # Lists
        if isinstance(obj, list):
            return [normalize(item) for item in obj]

        return obj

    return json.dumps(normalize(result), default=str)

def redis_cache(key_generator_func, expire_seconds: int = 3600, max_retries: int = 10, sleep_time: float = 0.5, **generator_kwargs):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = build_cache_key(key_generator_func, func, args, kwargs, generator_kwargs)
            lock_key = f"lock:{key}"

            cached = cache_get(key)
            if cached is not None:
                return json.loads(cached)

            for _ in range(max_retries):
                try:
                    lock_acquired = redis_client_sync.set(lock_key, "locked", nx=True, ex=10)
                except sync_redis.RedisError as exc:
                    logger.warning("redis_lock_failed", key=lock_key, error=str(exc))
                    lock_acquired = True  # Fallback: proceed without lock

                if lock_acquired:
                    try:
                        # Double-check
                        cached = cache_get(key)
                        if cached is not None:
                            return json.loads(cached)

                        result = func(*args, **kwargs)

                        serialized = serialize_result(result)
                        cache_set(key, serialized, expire_seconds)

                        return result
                    finally:
                        try:
                            redis_client_sync.delete(lock_key)
                        except sync_redis.RedisError:
                            pass
                else:
                    time.sleep(sleep_time)
                    cached = cache_get(key)
                    if cached is not None:
                        return json.loads(cached)

            # Fallback if timeout happens
            logger.warning("cache_stampede_timeout", key=key)
            result = func(*args, **kwargs)
            serialized = serialize_result(result)
            cache_set(key, serialized, expire_seconds)
            return result

        return wrapper
    return decorator
