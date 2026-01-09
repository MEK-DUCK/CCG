"""
WebSocket router for real-time presence tracking.

Allows clients to:
1. Connect to track their presence on a resource
2. Receive updates when other users join/leave
3. Get notified when data changes
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import json
import logging

from app.database import get_db
from app.presence import presence_manager
from app.auth import decode_token, require_auth
from app import models

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["Presence"])


async def get_user_from_token(token: str, db: Session) -> Optional[models.User]:
    """Validate JWT token and return user."""
    if not token:
        return None
    
    payload = decode_token(token)
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or user.status != models.UserStatus.ACTIVE:
        return None
    
    return user


@router.websocket("/presence/{resource_type}/{resource_id}")
async def presence_websocket(
    websocket: WebSocket,
    resource_type: str,
    resource_id: str,
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for presence tracking.
    
    Resource types:
    - "page" - A page in the app (home, contracts, lifting-plan, admin)
    - "monthly-plan" - A specific monthly plan being edited
    - "contract" - A specific contract being edited
    - "cargo" - A specific cargo being edited
    - "quarterly-plan" - A specific quarterly plan being edited
    
    Query params:
    - token: JWT token for authentication
    
    Messages received:
    - {"type": "heartbeat"} - Keep connection alive
    - {"type": "editing", "field": "vessel_name"} - User started editing a field
    - {"type": "stopped_editing"} - User stopped editing
    
    Messages sent:
    - {"type": "presence", "users": [...], "count": N} - Current users on resource
    - {"type": "user_editing", "user": {...}, "field": "..."} - Another user is editing
    - {"type": "data_changed", "user": {...}} - Another user saved changes
    """
    from app.database import SessionLocal
    
    db = SessionLocal()
    user = None
    
    try:
        # SECURITY: Authenticate user BEFORE accepting connection
        # This prevents resource exhaustion from unauthenticated connection floods
        user = await get_user_from_token(token, db)
        
        if not user:
            # Close without accepting - don't waste resources on unauthenticated requests
            await websocket.close(code=4001)
            logger.warning(f"WebSocket connection rejected: invalid or missing token")
            return
        
        # Register presence (includes connection limit check)
        success, error_message = await presence_manager.connect(
            websocket=websocket,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id=user.id,
            initials=user.initials,
            full_name=user.full_name
        )
        
        if not success:
            # Connection was rejected (e.g., too many connections)
            # Connection was already accepted by connect(), so send error and close
            try:
                await websocket.send_json({
                    "type": "error",
                    "code": "CONNECTION_LIMIT_EXCEEDED",
                    "message": error_message
                })
                await websocket.close(code=4002)
            except Exception:
                pass  # Connection may already be closed
            logger.warning(f"WebSocket connection rejected for user {user.id}: {error_message}")
            return
        
        # Handle incoming messages
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                msg_type = message.get("type")
                
                if msg_type == "heartbeat":
                    # Just acknowledge - connection is still alive
                    await websocket.send_json({"type": "heartbeat_ack"})
                
                elif msg_type == "editing":
                    # Broadcast that this user is editing a field
                    await presence_manager.send_notification(
                        resource_type=resource_type,
                        resource_id=resource_id,
                        notification_type="user_editing",
                        data={
                            "user": {
                                "user_id": user.id,
                                "initials": user.initials,
                                "full_name": user.full_name
                            },
                            "field": message.get("field")
                        },
                        exclude_user_id=user.id
                    )
                
                elif msg_type == "stopped_editing":
                    # Broadcast that this user stopped editing
                    await presence_manager.send_notification(
                        resource_type=resource_type,
                        resource_id=resource_id,
                        notification_type="user_stopped_editing",
                        data={
                            "user": {
                                "user_id": user.id,
                                "initials": user.initials,
                                "full_name": user.full_name
                            }
                        },
                        exclude_user_id=user.id
                    )
                
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from user {user.id}")
                continue
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user.id if user else 'unknown'}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Clean up presence
        if user:
            await presence_manager.disconnect(resource_type, resource_id, user.id)
        db.close()


# REST endpoint to get current presence (for initial page load)
@router.get("/presence/{resource_type}/{resource_id}")
def get_presence(
    resource_type: str,
    resource_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """
    Get current users viewing a resource.
    Useful for initial page load before WebSocket connects.
    """
    users = presence_manager.get_users_on_resource(resource_type, resource_id)
    return {
        "resource_type": resource_type,
        "resource_id": resource_id,
        "users": users,
        "count": len(users)
    }


async def notify_data_changed(
    resource_type: str,
    resource_id: str,
    user_id: int,
    user_initials: str,
    user_full_name: str,
    change_type: str = "update"
):
    """
    Notify all users viewing a resource that data has changed.
    Call this from your update endpoints after saving.
    
    Args:
        resource_type: Type of resource (monthly-plan, contract, etc.)
        resource_id: ID of the resource
        user_id: ID of user who made the change
        user_initials: Initials of user who made the change
        user_full_name: Full name of user who made the change
        change_type: Type of change (create, update, delete)
    """
    await presence_manager.send_notification(
        resource_type=resource_type,
        resource_id=str(resource_id),
        notification_type="data_changed",
        data={
            "user": {
                "user_id": user_id,
                "initials": user_initials,
                "full_name": user_full_name
            },
            "change_type": change_type,
        },
        exclude_user_id=user_id
    )

