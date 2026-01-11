"""
Row Highlights router - Shared team highlights for port movement table.
Allows team leaders to highlight rows that all team members can see.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.auth import require_auth
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/", response_model=List[schemas.RowHighlight])
def get_all_highlights(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Get all highlighted rows."""
    try:
        highlights = db.query(models.RowHighlight).all()
        return highlights
    except Exception as e:
        logger.error(f"Error fetching highlights: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching highlights: {str(e)}")


@router.get("/keys", response_model=schemas.RowHighlightList)
def get_highlight_keys(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Get just the row keys of all highlighted rows (lightweight endpoint)."""
    try:
        highlights = db.query(models.RowHighlight.row_key).all()
        return {"row_keys": [h.row_key for h in highlights]}
    except Exception as e:
        logger.error(f"Error fetching highlight keys: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching highlight keys: {str(e)}")


@router.post("/toggle/{row_key}")
def toggle_highlight(
    row_key: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Toggle highlight for a row. If highlighted, removes it. If not, adds it."""
    try:
        existing = db.query(models.RowHighlight).filter(
            models.RowHighlight.row_key == row_key
        ).first()

        if existing:
            # Remove highlight
            db.delete(existing)
            db.commit()
            logger.info(f"Highlight removed for row: {row_key} by {current_user.initials}")
            return {"action": "removed", "row_key": row_key}
        else:
            # Add highlight
            new_highlight = models.RowHighlight(
                row_key=row_key,
                highlighted_by_id=current_user.id,
                highlighted_by_initials=current_user.initials,
            )
            db.add(new_highlight)
            db.commit()
            db.refresh(new_highlight)
            logger.info(f"Highlight added for row: {row_key} by {current_user.initials}")
            return {"action": "added", "row_key": row_key, "highlighted_by": current_user.initials}
    except Exception as e:
        db.rollback()
        logger.error(f"Error toggling highlight for {row_key}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error toggling highlight: {str(e)}")


@router.post("/", response_model=schemas.RowHighlight)
def add_highlight(
    highlight: schemas.RowHighlightCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Add a highlight for a row."""
    try:
        # Check if already highlighted
        existing = db.query(models.RowHighlight).filter(
            models.RowHighlight.row_key == highlight.row_key
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail="Row is already highlighted")

        new_highlight = models.RowHighlight(
            row_key=highlight.row_key,
            note=highlight.note,
            highlighted_by_id=current_user.id,
            highlighted_by_initials=current_user.initials,
        )
        db.add(new_highlight)
        db.commit()
        db.refresh(new_highlight)

        logger.info(f"Highlight added for row: {highlight.row_key} by {current_user.initials}")
        return new_highlight
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding highlight: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding highlight: {str(e)}")


@router.delete("/{row_key}")
def remove_highlight(
    row_key: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Remove a highlight from a row."""
    try:
        existing = db.query(models.RowHighlight).filter(
            models.RowHighlight.row_key == row_key
        ).first()

        if not existing:
            raise HTTPException(status_code=404, detail="Highlight not found")

        db.delete(existing)
        db.commit()

        logger.info(f"Highlight removed for row: {row_key} by {current_user.initials}")
        return {"message": f"Highlight removed for row: {row_key}"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing highlight: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error removing highlight: {str(e)}")


@router.delete("/")
def clear_all_highlights(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Clear all highlights (admin action)."""
    try:
        count = db.query(models.RowHighlight).delete()
        db.commit()

        logger.info(f"All highlights cleared ({count} rows) by {current_user.initials}")
        return {"message": f"Cleared {count} highlights"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error clearing highlights: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error clearing highlights: {str(e)}")
