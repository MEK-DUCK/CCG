"""
WebSocket-based presence management for real-time collaboration awareness.

Tracks which users are viewing which resources (pages, records) and broadcasts
presence updates to all users viewing the same resource.
"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set, Optional, List
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import asyncio
import json
import logging

logger = logging.getLogger(__name__)


@dataclass
class PresenceUser:
    """Information about a user's presence on a resource."""
    user_id: int
    initials: str
    full_name: str
    connected_at: str
    
    def to_dict(self) -> dict:
        return asdict(self)


class PresenceManager:
    """
    Manages WebSocket connections and tracks which users are viewing which resources.
    
    Resources are identified by type and ID, e.g.:
    - "page:home" - Home page
    - "page:contracts" - Contracts management page
    - "page:lifting-plan" - Lifting plan page
    - "monthly-plan:4354" - Specific monthly plan
    - "contract:412" - Specific contract
    - "cargo:1957" - Specific cargo
    """
    
    def __init__(self):
        # resource_key -> {user_id -> WebSocket}
        self.connections: Dict[str, Dict[int, WebSocket]] = {}
        # resource_key -> {user_id -> PresenceUser}
        self.user_info: Dict[str, Dict[int, PresenceUser]] = {}
        # user_id -> set of resource_keys (for cleanup on disconnect)
        self.user_resources: Dict[int, Set[str]] = {}
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
    
    def _make_key(self, resource_type: str, resource_id: str) -> str:
        """Create a unique key for a resource."""
        return f"{resource_type}:{resource_id}"
    
    async def connect(
        self, 
        websocket: WebSocket, 
        resource_type: str, 
        resource_id: str,
        user_id: int,
        initials: str,
        full_name: str
    ) -> None:
        """Register a user's connection to a resource."""
        await websocket.accept()
        key = self._make_key(resource_type, resource_id)
        
        async with self._lock:
            # Initialize dicts if needed
            if key not in self.connections:
                self.connections[key] = {}
                self.user_info[key] = {}
            
            if user_id not in self.user_resources:
                self.user_resources[user_id] = set()
            
            # Store connection and user info
            self.connections[key][user_id] = websocket
            self.user_info[key][user_id] = PresenceUser(
                user_id=user_id,
                initials=initials,
                full_name=full_name,
                connected_at=datetime.now(timezone.utc).isoformat()
            )
            self.user_resources[user_id].add(key)
        
        # Broadcast updated presence to all users on this resource
        await self.broadcast_presence(resource_type, resource_id)
        
        logger.info(f"User {initials} (ID:{user_id}) connected to {key}")
    
    async def disconnect(
        self, 
        resource_type: str, 
        resource_id: str, 
        user_id: int
    ) -> None:
        """Remove a user's connection from a resource."""
        key = self._make_key(resource_type, resource_id)
        initials = "?"
        
        async with self._lock:
            if key in self.connections:
                self.connections[key].pop(user_id, None)
                user = self.user_info[key].pop(user_id, None)
                if user:
                    initials = user.initials
                
                # Clean up empty resource entries
                if not self.connections[key]:
                    del self.connections[key]
                    del self.user_info[key]
            
            if user_id in self.user_resources:
                self.user_resources[user_id].discard(key)
                if not self.user_resources[user_id]:
                    del self.user_resources[user_id]
        
        # Broadcast updated presence to remaining users
        await self.broadcast_presence(resource_type, resource_id)
        
        logger.info(f"User {initials} (ID:{user_id}) disconnected from {key}")
    
    async def disconnect_user_all(self, user_id: int) -> None:
        """Disconnect a user from all resources (e.g., on logout or connection drop)."""
        async with self._lock:
            resources = list(self.user_resources.get(user_id, set()))
        
        for key in resources:
            parts = key.split(":", 1)
            if len(parts) == 2:
                await self.disconnect(parts[0], parts[1], user_id)
    
    async def broadcast_presence(
        self, 
        resource_type: str, 
        resource_id: str,
        exclude_user_id: Optional[int] = None
    ) -> None:
        """Broadcast current presence list to all users on a resource."""
        key = self._make_key(resource_type, resource_id)
        
        async with self._lock:
            if key not in self.connections:
                return
            
            connections = dict(self.connections.get(key, {}))
            users = list(self.user_info.get(key, {}).values())
        
        message = json.dumps({
            "type": "presence",
            "resource_type": resource_type,
            "resource_id": resource_id,
            "users": [u.to_dict() for u in users],
            "count": len(users)
        })
        
        # Send to all connected users
        disconnected = []
        for uid, ws in connections.items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await ws.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send presence to user {uid}: {e}")
                disconnected.append(uid)
        
        # Clean up any disconnected users
        for uid in disconnected:
            await self.disconnect(resource_type, resource_id, uid)
    
    def get_users_on_resource(
        self, 
        resource_type: str, 
        resource_id: str
    ) -> List[dict]:
        """Get list of users currently viewing a resource (synchronous)."""
        key = self._make_key(resource_type, resource_id)
        users = self.user_info.get(key, {})
        return [u.to_dict() for u in users.values()]
    
    def get_other_users(
        self, 
        resource_type: str, 
        resource_id: str,
        exclude_user_id: int
    ) -> List[dict]:
        """Get list of OTHER users viewing a resource (excludes the requesting user)."""
        key = self._make_key(resource_type, resource_id)
        users = self.user_info.get(key, {})
        return [u.to_dict() for u in users.values() if u.user_id != exclude_user_id]
    
    async def send_notification(
        self,
        resource_type: str,
        resource_id: str,
        notification_type: str,
        data: dict,
        exclude_user_id: Optional[int] = None
    ) -> None:
        """
        Send a custom notification to all users on a resource.
        
        Useful for:
        - "data_changed" - Someone saved changes
        - "editing_started" - Someone started editing a field
        - "editing_stopped" - Someone stopped editing
        """
        key = self._make_key(resource_type, resource_id)
        
        async with self._lock:
            connections = dict(self.connections.get(key, {}))
        
        message = json.dumps({
            "type": notification_type,
            "resource_type": resource_type,
            "resource_id": resource_id,
            **data
        })
        
        for uid, ws in connections.items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await ws.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send notification to user {uid}: {e}")


    async def broadcast_data_change(
        self,
        resource_type: str,
        resource_id: str,
        change_type: str,
        entity_type: str,
        entity_id: int,
        entity_data: Optional[dict] = None,
        changed_by_user_id: Optional[int] = None,
        changed_by_initials: Optional[str] = None
    ) -> None:
        """
        Broadcast a data change to all users viewing a resource.
        
        This is used for real-time sync - when data changes, all connected
        users receive the update and can refresh their UI.
        
        Args:
            resource_type: Type of resource (e.g., "page")
            resource_id: ID of resource (e.g., "port-movement")
            change_type: Type of change ("created", "updated", "deleted")
            entity_type: Type of entity that changed ("cargo", "monthly_plan", etc.)
            entity_id: ID of the entity that changed
            entity_data: Optional full entity data for "created" or "updated"
            changed_by_user_id: ID of user who made the change
            changed_by_initials: Initials of user who made the change
        """
        key = self._make_key(resource_type, resource_id)
        
        async with self._lock:
            connections = dict(self.connections.get(key, {}))
        
        if not connections:
            return
        
        message = json.dumps({
            "type": "data_sync",
            "change_type": change_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_data": entity_data,
            "changed_by": {
                "user_id": changed_by_user_id,
                "initials": changed_by_initials
            } if changed_by_user_id else None,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        logger.info(f"Broadcasting {change_type} {entity_type}:{entity_id} to {len(connections)} users on {key}")
        
        disconnected = []
        for uid, ws in connections.items():
            # Don't send to the user who made the change - they already have the data
            if changed_by_user_id and uid == changed_by_user_id:
                continue
            try:
                await ws.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send data_sync to user {uid}: {e}")
                disconnected.append(uid)
        
        # Clean up disconnected users
        for uid in disconnected:
            await self.disconnect(resource_type, resource_id, uid)


# Global presence manager instance
presence_manager = PresenceManager()

